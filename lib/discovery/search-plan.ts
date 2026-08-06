import "server-only";

import { z } from "zod";
import { resolveOpenAIModel } from "@/lib/intelligence/model-router";
import { completeAiRequest, reserveAiRequest, responseUsage } from "@/lib/ai/governance";
import { compactForAi, stableFingerprint } from "@/lib/ai/cost-optimisation";
import { parseStructuredAiResponse, safeStructuredAiError } from "@/lib/ai/structured-response-gateway";

const ENDPOINT = "https://api.openai.com/v1/responses";

const SearchArchetypeSchema = z.object({
  name: z.string().min(1).max(120),
  operatingReality: z.string().min(1).max(420),
  sectors: z.array(z.string().min(1).max(120)).min(1).max(8),
  searchTerms: z.array(z.string().min(1).max(180)).min(2).max(10),
  evidenceSignals: z.array(z.string().min(1).max(220)).min(2).max(10),
});

export const CompanySearchPlanSchema = z.object({
  schemaVersion: z.literal("company-search-plan/v1"),
  commercialProblem: z.string().min(1).max(500),
  operationalConditions: z.array(z.string().min(1).max(220)).min(3).max(12),
  companyArchetypes: z.array(SearchArchetypeSchema).min(3).max(8),
  buyerRoleSynonyms: z.array(z.string().min(1).max(120)).min(3).max(16),
  geographyVariants: z.array(z.string().min(1).max(120)).min(1).max(12),
  sourcePriority: z.array(z.string().min(1).max(160)).min(3).max(8),
  exclusionRules: z.array(z.string().min(1).max(220)).min(2).max(10),
  diversificationRule: z.string().min(1).max(420),
});

export type CompanySearchPlan = z.output<typeof CompanySearchPlanSchema>;

const companySearchPlanJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion","commercialProblem","operationalConditions","companyArchetypes","buyerRoleSynonyms","geographyVariants","sourcePriority","exclusionRules","diversificationRule"],
  properties: {
    schemaVersion: { type: "string", enum: ["company-search-plan/v1"] },
    commercialProblem: { type: "string" },
    operationalConditions: { type: "array", minItems: 3, maxItems: 12, items: { type: "string" } },
    companyArchetypes: {
      type: "array", minItems: 3, maxItems: 8,
      items: {
        type: "object", additionalProperties: false,
        required: ["name","operatingReality","sectors","searchTerms","evidenceSignals"],
        properties: {
          name: { type: "string" },
          operatingReality: { type: "string" },
          sectors: { type: "array", minItems: 1, maxItems: 8, items: { type: "string" } },
          searchTerms: { type: "array", minItems: 2, maxItems: 10, items: { type: "string" } },
          evidenceSignals: { type: "array", minItems: 2, maxItems: 10, items: { type: "string" } },
        },
      },
    },
    buyerRoleSynonyms: { type: "array", minItems: 3, maxItems: 16, items: { type: "string" } },
    geographyVariants: { type: "array", minItems: 1, maxItems: 12, items: { type: "string" } },
    sourcePriority: { type: "array", minItems: 3, maxItems: 8, items: { type: "string" } },
    exclusionRules: { type: "array", minItems: 2, maxItems: 10, items: { type: "string" } },
    diversificationRule: { type: "string" },
  },
} as const;

type SearchPlanInput = {
  organisationId: string;
  campaignId: string;
  schedulerRunId?: string | null;
  jobId: string;
  campaign: Record<string, unknown>;
  business: Record<string, unknown>;
  customerWebsite?: string | null;
  searchPass: number;
  searchStrategy: string;
};

export async function buildCompanySearchPlan(input: SearchPlanInput): Promise<CompanySearchPlan> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("OPENAI_API_KEY_NOT_CONFIGURED");

  const model = resolveOpenAIModel("analysis").model;
  const compactInput = compactForAi({
    campaign: input.campaign,
    business: input.business,
    customerWebsite: input.customerWebsite ?? null,
    searchPass: input.searchPass,
    searchStrategy: input.searchStrategy,
  }, { evidenceLimit: 4, depth: 5 });
  const fingerprint = stableFingerprint({ prompt: "company-search-plan/v1", model, compactInput });
  const startedAt = Date.now();
  const reservation = await reserveAiRequest({
    organisationId: input.organisationId,
    campaignId: input.campaignId,
    schedulerRunId: input.schedulerRunId,
    jobType: "COMPANY_DISCOVERY",
    jobId: input.jobId,
    requestScope: `company-search-plan:${fingerprint}`,
    model,
    estimatedCostUsd: Number(process.env.SALESPILOT_COMPANY_SEARCH_PLAN_ESTIMATED_COST_USD ?? "0.06"),
  });

  let response: Response;
  try {
    response = await fetch(ENDPOINT, {
      method: "POST",
      cache: "no-store",
      signal: AbortSignal.timeout(90_000),
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        instructions: [
          "You are SalesPilot's Company Discovery search strategist.",
          "Do not find or name companies. Build the market-search plan that will be used by a separate web-search stage.",
          "Translate the approved campaign into operating realities and commercial conditions, not product-category keywords.",
          "Create diverse company archetypes that experience the problem, including adjacent sectors when the same operational need exists.",
          "Prefer search signals such as operational footprint, locations, shift work, production, logistics, maintenance, safety, compliance, downtime and distributed teams where relevant.",
          "Prioritise official operations pages, locations pages, careers and job descriptions, annual or sustainability reports, procurement pages, case studies and official news before generic homepages.",
          "The plan must diversify across archetypes rather than repeatedly searching synonyms for the same narrow segment.",
          input.searchPass > 1
            ? `This is expansion pass ${input.searchPass}. Use strategy ${input.searchStrategy} to cover market space not exhausted by the earlier pass while preserving the approved commercial problem.`
            : "This is the primary pass. Build broad market coverage before qualification.",
          "Use British English.",
        ].join(" "),
        input: JSON.stringify(compactInput),
        reasoning: { effort: "low" },
        text: { format: { type: "json_schema", name: "salespilot_company_search_plan_v1", strict: true, schema: companySearchPlanJsonSchema } },
        max_output_tokens: 4_500,
        store: false,
      }),
    });
  } catch (error) {
    await completeAiRequest({ ledgerId: reservation.ledgerId, ok: false, durationMs: Date.now()-startedAt, errorCode: "NETWORK", errorMessage: error instanceof Error ? error.message : "Search planning request failed" }).catch(()=>undefined);
    throw error;
  }

  const json: unknown = await response.json().catch(() => null);
  const responseId = typeof (json as any)?.id === "string" ? (json as any).id : null;
  if (!response.ok) {
    await completeAiRequest({ ledgerId: reservation.ledgerId, ok: false, usage: responseUsage(json), durationMs: Date.now()-startedAt, responseId, errorCode: `HTTP_${response.status}`, errorMessage: JSON.stringify((json as any)?.error ?? null) }).catch(()=>undefined);
    throw new Error(`OPENAI_SEARCH_PLAN_FAILED:${response.status}`);
  }

  try {
    const gateway = await parseStructuredAiResponse({ response: json, schema: CompanySearchPlanSchema, jsonSchema: companySearchPlanJsonSchema, schemaName: "salespilot_company_search_plan_v1", apiKey, model });
    await completeAiRequest({ ledgerId: reservation.ledgerId, ok: true, usage: responseUsage(json), durationMs: Date.now()-startedAt, responseId }).catch(()=>undefined);
    return gateway.value;
  } catch (error) {
    const safe = safeStructuredAiError(error);
    await completeAiRequest({ ledgerId: reservation.ledgerId, ok: false, usage: responseUsage(json), durationMs: Date.now()-startedAt, responseId, errorCode: safe.code, errorMessage: safe.message }).catch(()=>undefined);
    throw new Error(`SEARCH_PLAN_RESPONSE_${safe.code}`);
  }
}
