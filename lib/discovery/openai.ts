import "server-only";

import { resolveOpenAIModel } from "@/lib/intelligence/model-router";
import { completeAiRequest, reserveAiRequest, responseUsage } from "@/lib/ai/governance";
import { normaliseDiscoveryResult } from "./normalise";
import { CompanyDiscoveryResultSchema } from "./schemas";
import { CompanyDiscoveryGatewaySchema, canonicaliseCompanyDiscoveryOutput } from "./structured-output";
import { compactCompanyDiscoveryInput, stableFingerprint } from "@/lib/ai/cost-optimisation";
import { parseStructuredAiResponse, safeStructuredAiError } from "@/lib/ai/structured-response-gateway";
import type { CompanySearchPlan } from "./search-plan";

const ENDPOINT = "https://api.openai.com/v1/responses";

const scoreSchema = {
  type: "integer",
  minimum: 0,
  maximum: 100,
} as const;

const companyDiscoveryJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion", "searchSummary", "companies"],
  properties: {
    schemaVersion: { type: "string", enum: ["company-discovery/v2"] },
    searchSummary: { type: "string" },
    companies: {
      type: "array",
      minItems: 1,
      maxItems: 12,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "name", "websiteUrl", "country", "industry", "summary",
          "confidence", "matchLabel", "fitBreakdown", "why",
          "uncertainties", "riskFlags", "evidence",
        ],
        properties: {
          name: { type: "string" },
          websiteUrl: { type: "string" },
          country: { type: "string" },
          industry: { type: "string" },
          summary: { type: "string" },
          confidence: scoreSchema,
          matchLabel: {
            type: "string",
            enum: ["Strongest match", "Strong match", "Good match"],
          },
          fitBreakdown: {
            type: "object",
            additionalProperties: false,
            required: ["industryFit", "audienceFit", "operationalFit", "geographyFit", "commercialFit"],
            properties: {
              industryFit: scoreSchema,
              audienceFit: scoreSchema,
              operationalFit: scoreSchema,
              geographyFit: scoreSchema,
              commercialFit: scoreSchema,
            },
          },
          why: { type: "array", minItems: 1, maxItems: 4, items: { type: "string", maxLength: 320 } },
          uncertainties: { type: "array", maxItems: 3, items: { type: "string", maxLength: 280 } },
          riskFlags: { type: "array", maxItems: 3, items: { type: "string", maxLength: 240 } },
          evidence: {
            type: "array",
            minItems: 1,
            maxItems: 4,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["claim", "sourceUrl", "sourceTitle", "excerpt"],
              properties: {
                claim: { type: "string", maxLength: 320 },
                sourceUrl: { type: "string" },
                sourceTitle: { type: ["string", "null"], maxLength: 180 },
                excerpt: { type: ["string", "null"], maxLength: 420 },
              },
            },
          },
        },
      },
    },
  },
} as const;

type DiscoverCompaniesInput = {
  organisationId: string;
  campaignId: string;
  schedulerRunId?: string | null;
  jobId: string;
  campaign: Record<string, unknown>;
  business: Record<string, unknown>;
  customerWebsite?: string | null;
  excludedCompanies?: Array<{ name: string; domain: string }>;
  searchPass?: number;
  searchStrategy?: string;
  searchPlan: CompanySearchPlan;
};

export async function discoverCompanies(input: DiscoverCompaniesInput) {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("OPENAI_API_KEY_NOT_CONFIGURED");

  const model = resolveOpenAIModel("analysis").model;
  const startedAt = Date.now();
  const compactInput = compactCompanyDiscoveryInput(input);
  const fingerprint = stableFingerprint({ prompt: "company-discovery/v2-cost-optimised", model, compactInput });
  const reservation = await reserveAiRequest({ organisationId: input.organisationId, campaignId: input.campaignId, schedulerRunId: input.schedulerRunId, jobType: "COMPANY_DISCOVERY", jobId: input.jobId, requestScope: `company-discovery:${fingerprint}`, model, estimatedCostUsd: Number(process.env.SALESPILOT_COMPANY_DISCOVERY_ESTIMATED_COST_USD ?? "0.25") });
  let response: Response;
  try {
    response = await fetch(ENDPOINT, {
    method: "POST",
    cache: "no-store",
    signal: AbortSignal.timeout(220_000),
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      instructions: [
        "You are SalesPilot Company Discovery.",
        "Execute the supplied search plan to find real operating B2B companies that genuinely match the approved outbound sales campaign.",
        "Discovery and proof are separate: first build a broad, diverse candidate pool across the supplied company archetypes, then attach the strongest official evidence for each candidate.",
        "Search for companies experiencing the operating reality, not companies selling similarly named products or using the seller's product-category language.",
        "Return only official company websites and evidence from those official domains.",
        "Do not invent employee counts, technology usage, operational problems, buyer intent, or private information.",
        "Exclude the customer's own company, directories, agencies listing clients, news articles, and duplicate domains.",
        "Never return a company present in excludedCompanies. Treat both its canonical domain and company name as already researched.",
        "Score industry fit, audience fit, operational fit, geography fit, and commercial fit independently.",
        "Record genuine uncertainties and risk flags instead of hiding them.",
        "Return 10–12 diverse candidates when supported so the independent verifier has enough breadth to retain the strongest matches; quality still matters and unsupported candidates must not be invented.",
        "Distribute candidates across multiple supplied archetypes. Do not let one sector, keyword family or company type dominate the result.",
        "Prioritise evidence in this order where available: operations and locations pages; careers and role descriptions; annual, sustainability or regulatory reports; procurement and supplier pages; official case studies and news; then the homepage.",
        input.searchPass && input.searchPass > 1
          ? `This is search pass ${input.searchPass}. The earlier search retained too few supported companies. Broaden intelligently using this strategy: ${input.searchStrategy ?? "ALTERNATIVE_LANGUAGE"}. Keep the approved commercial problem and evidence threshold unchanged.`
          : "Start with the approved audience, buyer language and strongest direct commercial fit.",
        "For each company, include only the 1–4 strongest official-site evidence items and keep explanations concise.",
        "Use British English.",
      ].join(" "),
      input: JSON.stringify(compactInput),
      tools: [{ type: "web_search_preview", search_context_size: "medium" }],
      reasoning: { effort: "low" },
      text: {
        format: {
          type: "json_schema",
          name: "salespilot_company_discovery_v2",
          strict: true,
          schema: companyDiscoveryJsonSchema,
        },
      },
      // GPT-5 reasoning tokens share max_output_tokens with the final JSON.
      // 9k plus low reasoning effort prevents incomplete structured responses
      // while the tighter schema keeps actual output materially below this cap.
      max_output_tokens: 9_000,
      store: false,
    }),
    });
  } catch (error) {
    await completeAiRequest({ ledgerId: reservation.ledgerId, ok: false, durationMs: Date.now()-startedAt, errorCode: "NETWORK", errorMessage: error instanceof Error ? error.message : "OpenAI request failed" }).catch(()=>undefined);
    throw error;
  }

  const json: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const errorResponse = json as { error?: unknown } | null;
    await completeAiRequest({ ledgerId: reservation.ledgerId, ok: false, usage: responseUsage(json), webSearchCalls: 1, durationMs: Date.now()-startedAt, responseId: typeof (json as any)?.id === "string" ? (json as any).id : null, errorCode: `HTTP_${response.status}`, errorMessage: JSON.stringify(errorResponse?.error ?? null) }).catch(()=>undefined);
    throw new Error(`OPENAI_DISCOVERY_FAILED:${response.status}:${JSON.stringify(errorResponse?.error ?? null)}`);
  }
  const responseId = typeof (json as any)?.id === "string" ? (json as any).id : null;
  const responseStatus = typeof (json as any)?.status === "string" ? (json as any).status : null;
  const incompleteReason = typeof (json as any)?.incomplete_details?.reason === "string"
    ? (json as any).incomplete_details.reason
    : null;

  if (responseStatus === "incomplete") {
    await completeAiRequest({
      ledgerId: reservation.ledgerId,
      ok: false,
      usage: responseUsage(json),
      webSearchCalls: 1,
      durationMs: Date.now()-startedAt,
      responseId,
      errorCode: "INCOMPLETE_RESPONSE",
      errorMessage: incompleteReason ?? "OpenAI returned an incomplete company-discovery response",
    }).catch(()=>undefined);
    throw new Error(`OPENAI_DISCOVERY_INCOMPLETE:${incompleteReason ?? "UNKNOWN"}`);
  }

  let parsed: ReturnType<typeof CompanyDiscoveryResultSchema.parse>;
  try {
    const gateway = await parseStructuredAiResponse({ response: json, schema: CompanyDiscoveryGatewaySchema, jsonSchema: companyDiscoveryJsonSchema, schemaName: "salespilot_company_discovery_v2", apiKey, model });
    parsed = canonicaliseCompanyDiscoveryOutput(gateway.value);
  } catch (error) {
    const safe = safeStructuredAiError(error);
    await completeAiRequest({ ledgerId: reservation.ledgerId, ok: false, usage: responseUsage(json), webSearchCalls: 1, durationMs: Date.now()-startedAt, responseId, errorCode: safe.code, errorMessage: safe.message }).catch(()=>undefined);
    throw new Error(`DISCOVERY_RESPONSE_${safe.code}`);
  }

  await completeAiRequest({
    ledgerId: reservation.ledgerId,
    ok: true,
    usage: responseUsage(json),
    webSearchCalls: 1,
    durationMs: Date.now()-startedAt,
    responseId,
  });
  return normaliseDiscoveryResult(parsed, { customerWebsite: input.customerWebsite });
}
