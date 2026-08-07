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
  const fingerprint = stableFingerprint({ prompt: "company-discovery/v3-executive-market-intelligence", model, compactInput });
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
        "ROLE: VP Market Intelligence & Territory Strategy for SalesPilot.",
        "MISSION: Build the highest-value prospect territory available under the approved campaign mandate. Find operating companies that exhibit the observable conditions created by the seller's commercial thesis; do not merely find organisations that share vocabulary with the seller.",
        "EXECUTIVE ACCOUNTABILITY: Treat sales capacity as scarce. A company should be returned only when you would be willing to allocate a capable account executive's time to it. Balance market coverage, commercial fit, diversity and evidence quality rather than maximising candidate count.",
        "SEARCH METHOD: First translate the campaign into observable market signals. Search through several independent lenses where supported: industry, operating model, organisational complexity, geography, trigger conditions and likely buyer environment. Build a broad candidate pool before proving individual candidates.",
        "FALSIFICATION: For every candidate ask what strongest available evidence suggests it may NOT be a good prospect. Reflect that honestly in fit scores, uncertainties and riskFlags. Do not rescue a weak candidate simply because it resembles the requested ICP.",
        "ANTI-ICP: Actively avoid companies that are superficially similar but lack the operating reality, scale, geography, audience or commercial conditions that make the campaign relevant.",
        "Search for companies experiencing the operating reality, not companies selling similarly named products or using the seller's product-category language.",
        "Return only real operating B2B companies with official company websites. Evidence returned in the result must come from those official domains.",
        "Do not invent employee counts, technology usage, operational problems, buyer intent, budgets, growth, private information or trigger events.",
        "Exclude the customer's own company, directories, agencies listing clients, news aggregators and duplicate domains.",
        "Never return a company present in excludedCompanies. Treat both canonical domain and company name as already researched.",
        "Score industry fit, audience fit, operational fit, geography fit and commercial fit independently. Do not allow one strong dimension to conceal a serious mismatch in another.",
        "Return 10-12 diverse candidates when genuinely supported so the verifier has breadth, but never manufacture a marginal candidate to hit a number.",
        "Distribute candidates across multiple supplied archetypes where the market supports it. Do not let one sector, keyword family or company type dominate merely because it is easy to search.",
        "Evidence priority: operations/locations; careers/role descriptions; annual, sustainability or regulatory reports; procurement/supplier pages; official case studies/news; then homepage. Prefer evidence that reveals how the company actually operates.",
        input.searchPass && input.searchPass > 1
          ? `This is search pass ${input.searchPass}. Earlier search retained too few supported companies. Broaden through ${input.searchStrategy ?? "ALTERNATIVE_LANGUAGE"} while preserving the approved commercial problem, anti-ICP discipline and evidence threshold.`
          : "This is the primary market-mapping pass. Start with the approved audience, buyer language, observable operating conditions and strongest direct commercial fit.",
        "For each company include only the 1-4 strongest official-site evidence items. Keep explanations concise and decision-useful.",
        "Write calm British English. Return exact JSON only. Prompt policy: company-discovery/v3-executive-market-intelligence.",
      ].join(" "),
      input: JSON.stringify(compactInput),
      tools: [{ type: "web_search_preview", search_context_size: "medium" }],
      reasoning: { effort: "medium" },
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
