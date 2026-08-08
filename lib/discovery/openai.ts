import "server-only";

import { resolveOpenAIModel } from "@/lib/intelligence/model-router";
import { completeAiRequest, reserveAiRequest, responseUsage } from "@/lib/ai/governance";
import { normaliseDiscoveryResult } from "./normalise";
import { CompanyDiscoveryResultSchema } from "./schemas";
import { CompanyDiscoveryGatewaySchema, canonicaliseCompanyDiscoveryOutput } from "./structured-output";
import { compactCompanyDiscoveryInput, stableFingerprint } from "@/lib/ai/cost-optimisation";
import { parseStructuredAiResponse, safeStructuredAiError } from "@/lib/ai/structured-response-gateway";
import type { CompanySearchPlan } from "./search-plan";
import { aiRequestTimeoutMs, classifyOpenAITransportError } from "@/lib/ai/request-policy";

const ENDPOINT = "https://api.openai.com/v1/responses";

const scoreSchema = {
  type: "integer",
  minimum: 0,
  maximum: 100,
} as const;

function companyDiscoveryJsonSchemaFor(limit: number) {
  const boundedLimit = Math.max(1, Math.min(5, Math.floor(limit)));
  return {
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion", "searchSummary", "companies"],
  properties: {
    schemaVersion: { type: "string", enum: ["company-discovery/v2"] },
    searchSummary: { type: "string" },
    companies: {
      type: "array",
      minItems: 0,
      maxItems: boundedLimit,
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
}

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
  targetCandidateLimit?: number;
  archetypeIndex?: number;
  archetypeTotal?: number;
};

export async function discoverCompanies(input: DiscoverCompaniesInput) {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("OPENAI_API_KEY_NOT_CONFIGURED");

  const model = resolveOpenAIModel("analysis").model;
  const startedAt = Date.now();
  const requestedLimit = Number(input.targetCandidateLimit ?? 4);
  const targetCandidateLimit = Number.isFinite(requestedLimit) ? Math.max(1, Math.min(5, Math.floor(requestedLimit))) : 4;
  const jsonSchema = companyDiscoveryJsonSchemaFor(targetCandidateLimit);
  const compactInput = compactCompanyDiscoveryInput(input);
  const fingerprint = stableFingerprint({ prompt: "company-discovery/v5-bounded-archetype", model, compactInput, targetCandidateLimit, archetypeIndex: input.archetypeIndex ?? 0 });
  const wholePassEstimate = Number(process.env.SALESPILOT_COMPANY_DISCOVERY_ESTIMATED_COST_USD ?? "0.25");
  const safeWholePassEstimate = Number.isFinite(wholePassEstimate) && wholePassEstimate > 0 ? wholePassEstimate : 0.25;
  const estimatedCostUsd = Math.max(0.01, safeWholePassEstimate / Math.max(1, input.archetypeTotal ?? 1));
  const reservation = await reserveAiRequest({ organisationId: input.organisationId, campaignId: input.campaignId, schedulerRunId: input.schedulerRunId, jobType: "COMPANY_DISCOVERY", jobId: input.jobId, requestScope: `company-discovery:${fingerprint}`, model, estimatedCostUsd });
  const requestTimeoutMs = aiRequestTimeoutMs("COMPANY_DISCOVERY");
  let response: Response;
  try {
    response = await fetch(ENDPOINT, {
    method: "POST",
    cache: "no-store",
    signal: AbortSignal.timeout(requestTimeoutMs),
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      instructions: [
        "ROLE: VP Market Intelligence & Territory Strategy for SalesPilot.",
        "MISSION: Build the highest-value prospect territory available under the approved campaign mandate. Find operating companies that exhibit the observable conditions created by the seller's commercial thesis; do not merely find organisations that share vocabulary with the seller.",
        "ACCOUNTABLE FOR: Build and qualify the prospect territory under the approved campaign. Treat sales capacity as scarce. Return a company only when you would be willing to allocate a capable account executive's time to it. Balance market coverage, commercial fit, diversity and evidence quality rather than maximising candidate count.",
        "ADVISES BUT DOES NOT DECIDE: You may assess account fit, explain evidence and recommend which discovered companies deserve attention. You do NOT approve/reject companies in workflow state, choose contacts, choose routes/channels, set scheduler priority, decide Opportunity readiness, or create outreach. SalesPilot validates/persists; later executives own account access and engagement.",
        "OUT OF SCOPE / HAND OFF: Your question is 'Is this a commercially attractive account under this campaign?' not 'How do we get in?' Never reject an otherwise strong account merely because an obvious contact or email is unavailable; Account Mapping / Route Intelligence owns reachability. Do not perform buying-committee mapping or invent a route to make an account look actionable.",
        "SEARCH METHOD: The deterministic market plan has already selected one bounded target-account archetype for this request. Research that archetype deeply enough to identify a small number of genuinely supported accounts. Do not broaden into the other archetypes; SalesPilot schedules those independently.",
        "FALSIFICATION: For every candidate ask what strongest available evidence suggests it may NOT be a good prospect. Reflect that honestly in fit scores, uncertainties and riskFlags. Do not rescue a weak candidate simply because it resembles the requested ICP.",
        "ANTI-ICP: Actively avoid companies that are superficially similar but lack the operating reality, scale, geography, audience or commercial conditions that make the campaign relevant.",
        "Search for companies experiencing the operating reality, not companies selling similarly named products or using the seller's product-category language.",
        "Return only real operating B2B companies with official company websites. Evidence returned in the result must come from those official domains.",
        "Do not invent employee counts, technology usage, operational problems, buyer intent, budgets, growth, private information or trigger events.",
        "Exclude the customer's own company, directories, agencies listing clients, news aggregators and duplicate domains.",
        "Never return a company present in excludedCompanies. Treat both canonical domain and company name as already researched.",
        "Score industry fit, audience fit, operational fit, geography fit and commercial fit independently. Do not allow one strong dimension to conceal a serious mismatch in another.",
        `Return at most ${targetCandidateLimit} candidates for this bounded archetype. Fewer, including zero, is correct when evidence is weak; never manufacture a marginal candidate to hit the limit.`,
        `This is archetype ${(input.archetypeIndex ?? 0) + 1} of ${Math.max(1, input.archetypeTotal ?? 1)} for the current market-search pass. Complete only this unit of work.`,
        "Evidence priority: operations/locations; careers/role descriptions; annual, sustainability or regulatory reports; procurement/supplier pages; official case studies/news; then homepage. Prefer evidence that reveals how the company actually operates.",
        input.searchPass && input.searchPass > 1
          ? `This is search pass ${input.searchPass}. Earlier search retained too few supported companies. Broaden through ${input.searchStrategy ?? "ALTERNATIVE_LANGUAGE"} while preserving the approved commercial problem, anti-ICP discipline and evidence threshold.`
          : "This is the primary market-mapping pass. Start with the approved audience, buyer language, observable operating conditions and strongest direct commercial fit.",
        "For each company include only the 1-4 strongest official-site evidence items. Keep explanations concise and decision-useful.",
        "Everything outside your accountability belongs to another executive or deterministic SalesPilot. Do not assume another role merely to complete the task.",
        "Write calm British English. Return exact JSON only. Prompt policy: company-discovery/v5-bounded-archetype.",
      ].join(" "),
      input: JSON.stringify(compactInput),
      tools: [{ type: "web_search_preview", search_context_size: "medium" }],
      reasoning: { effort: "medium" },
      text: {
        format: {
          type: "json_schema",
          name: "salespilot_company_discovery_v2",
          strict: true,
          schema: jsonSchema,
        },
      },
      // GPT-5 reasoning tokens share max_output_tokens with the final JSON.
      // Bounded archetype output materially reduces completion size while leaving
      // enough room for GPT-5 reasoning plus strict JSON.
      max_output_tokens: 5_500,
      store: false,
    }),
    });
  } catch (error) {
    const transport = classifyOpenAITransportError(error, "COMPANY_DISCOVERY", requestTimeoutMs);
    await completeAiRequest({ ledgerId: reservation.ledgerId, ok: false, durationMs: Date.now()-startedAt, errorCode: transport.code, errorMessage: transport.error.message }).catch(()=>undefined);
    throw transport.error;
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
    const gateway = await parseStructuredAiResponse({ response: json, schema: CompanyDiscoveryGatewaySchema, jsonSchema: jsonSchema, schemaName: "salespilot_company_discovery_v2", apiKey, model });
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
