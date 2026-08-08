import "server-only";

import { z } from "zod";
import { discardOpenAIBackgroundResponse, fetchResumableOpenAIResponse, isOpenAIBackgroundPending, isOpenAIBackgroundTerminal } from "@/lib/ai/background-response";
import { completeAiRequest, reserveAiRequest, responseUsage } from "@/lib/ai/governance";
import { parseStructuredAiResponse, safeStructuredAiError } from "@/lib/ai/structured-response-gateway";
import { aiPromptCacheKey, aiWorkloadProfile } from "@/lib/ai/workload-profile";
import { aiRequestTimeoutMs, classifyOpenAITransportError } from "@/lib/ai/request-policy";
import { stableFingerprint } from "@/lib/ai/cost-optimisation";
import { resolveOpenAIModel } from "@/lib/intelligence/model-router";
import type { EvidenceDirection, EvidenceSourceClass, TruthEntityType } from "./truth";

const RepairEvidenceSchema = z.object({
  direction: z.enum(["SUPPORTS", "CONTRADICTS"]),
  sourceClass: z.enum([
    "REGULATORY_OR_GOVERNMENT", "OFFICIAL_PRIMARY", "OFFICIAL_PROFILE", "MAJOR_REPUTABLE_MEDIA",
    "INDUSTRY_PUBLICATION", "COMMERCIAL_DATABASE", "BUSINESS_DIRECTORY", "SOCIAL_OR_COMMUNITY",
    "SEARCH_SNIPPET", "UNKNOWN",
  ]),
  sourceUrl: z.string().url(),
  sourceTitle: z.string().max(240).nullable(),
  excerpt: z.string().min(1).max(700),
  directness: z.number().int().min(0).max(100),
});

const RepairResultSchema = z.object({
  schemaVersion: z.literal("genesis-g8-repair/v1"),
  summary: z.string().max(800),
  evidence: z.array(RepairEvidenceSchema).max(5),
});

const repairJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion", "summary", "evidence"],
  properties: {
    schemaVersion: { type: "string", enum: ["genesis-g8-repair/v1"] },
    summary: { type: "string", maxLength: 800 },
    evidence: {
      type: "array", maxItems: 5,
      items: {
        type: "object", additionalProperties: false,
        required: ["direction", "sourceClass", "sourceUrl", "sourceTitle", "excerpt", "directness"],
        properties: {
          direction: { type: "string", enum: ["SUPPORTS", "CONTRADICTS"] },
          sourceClass: { type: "string", enum: [
            "REGULATORY_OR_GOVERNMENT", "OFFICIAL_PRIMARY", "OFFICIAL_PROFILE", "MAJOR_REPUTABLE_MEDIA",
            "INDUSTRY_PUBLICATION", "COMMERCIAL_DATABASE", "BUSINESS_DIRECTORY", "SOCIAL_OR_COMMUNITY",
            "SEARCH_SNIPPET", "UNKNOWN",
          ] },
          sourceUrl: { type: "string" },
          sourceTitle: { type: ["string", "null"], maxLength: 240 },
          excerpt: { type: "string", maxLength: 700 },
          directness: { type: "integer", minimum: 0, maximum: 100 },
        },
      },
    },
  },
} as const;

export interface GenesisG8RepairResearchInput {
  repairId: string;
  entityId: string;
  entityType: TruthEntityType;
  entityCanonicalKey: string;
  entityDisplayName?: string | null;
  claimId: string;
  claimKey: string;
  claimLabel: string;
  objective: string;
  repairMode: string;
  organisationId?: string | null;
  campaignId?: string | null;
}

export interface GenesisG8RepairResearchEvidence {
  direction: EvidenceDirection;
  sourceClass: EvidenceSourceClass;
  sourceUrl: string;
  sourceTitle: string | null;
  excerpt: string;
  directness: number;
}

export interface GenesisG8RepairResearchResult {
  schemaVersion: "genesis-g8-repair/v1";
  summary: string;
  evidence: GenesisG8RepairResearchEvidence[];
}

export async function researchGenesisG8ClaimRepair(input: GenesisG8RepairResearchInput): Promise<GenesisG8RepairResearchResult> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("OPENAI_API_KEY_NOT_CONFIGURED");

  const model = resolveOpenAIModel("analysis").model;
  const governanceOrganisationId = input.organisationId ?? process.env.MARKETROUTE_G8_SYSTEM_ORGANISATION_ID?.trim() ?? null;
  const profile = aiWorkloadProfile("GENESIS_G8_REPAIR");
  const timeoutMs = aiRequestTimeoutMs("GENESIS_G8_REPAIR");
  const fingerprint = stableFingerprint({
    prompt: profile.promptVersion,
    cacheKey: aiPromptCacheKey("GENESIS_G8_REPAIR"),
    entityId: input.entityId,
    claimId: input.claimId,
    objective: input.objective,
    repairMode: input.repairMode,
  });
  const baseRequestScope = `genesis-g8-repair:${fingerprint}`;
  const estimatedCostUsd = Math.max(0.005, Number(process.env.MARKETROUTE_G8_REPAIR_ESTIMATED_COST_USD ?? "0.04") || 0.04);
  let requestScope = baseRequestScope;
  let lastTerminalError: Error | null = null;

  for (let terminalGeneration = 0; terminalGeneration < 3; terminalGeneration += 1) {
    const reservation = await reserveAiRequest({
      organisationId: governanceOrganisationId,
      campaignId: input.campaignId ?? null,
      jobType: "GENESIS_G8_REPAIR",
      jobId: input.repairId,
      requestScope,
      model,
      estimatedCostUsd,
    });
    const startedAt = Date.now();
    let response: Response;
    try {
      response = await fetchResumableOpenAIResponse({
        apiKey,
        task: "GENESIS_G8_REPAIR",
        organisationId: governanceOrganisationId,
        campaignId: input.campaignId ?? null,
        jobType: "GENESIS_G8_REPAIR",
        jobId: input.repairId,
        requestScope,
        model,
        ledgerId: reservation.ledgerId,
      }, {
        method: "POST",
        cache: "no-store",
        signal: AbortSignal.timeout(timeoutMs),
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          instructions: [
            "ROLE: Genesis G8 evidence researcher for MarketRoute.",
            "MISSION: Research exactly one existing intelligence claim. Return evidence only; never assign a Truth Index, workflow status, commercial score, or human-review decision.",
            "SCOPE DISCIPLINE: Do not broaden into company discovery, contact discovery, route generation, opportunity generation, or outreach. The requested claim is the complete unit of work.",
            "FALSIFICATION: Search for evidence that contradicts the claim as seriously as evidence that supports it. If reliable evidence is unavailable, return an empty evidence array rather than inventing support.",
            "SOURCES: Prefer current first-party, regulatory/government and official-profile sources; reputable independent sources may corroborate. Cite the exact public URL and a concise traceable excerpt.",
            "SOURCE CLASS: Classify the source only into the supplied enum. Genesis code, not you, assigns authority weights and calculates confidence.",
            "DIRECTNESS: Score only how directly the quoted evidence bears on this exact claim (0-100). Do not use this as an overall confidence score.",
            "Write concise British English and return exact JSON only. Prompt policy: genesis-g8-repair/v1.",
          ].join(" "),
          input: JSON.stringify({
            entityType: input.entityType,
            entityCanonicalKey: input.entityCanonicalKey,
            entityDisplayName: input.entityDisplayName ?? null,
            claimKey: input.claimKey,
            claimLabel: input.claimLabel,
            objective: input.objective,
            repairMode: input.repairMode,
          }),
          tools: [{ type: "web_search_preview", search_context_size: "medium" }],
          reasoning: { effort: profile.reasoningEffort },
          text: { format: { type: "json_schema", name: "genesis_g8_repair_v1", strict: true, schema: repairJsonSchema } },
          max_output_tokens: profile.maxOutputTokens,
          store: false,
        }),
      });
    } catch (error) {
      if (isOpenAIBackgroundPending(error)) throw error;
      if (isOpenAIBackgroundTerminal(error)) {
        const reason = error.providerReason ?? `Provider response ended ${error.status}`;
        await completeAiRequest({ ledgerId: reservation.ledgerId, ok: false, durationMs: Date.now() - startedAt, responseId: error.responseId, errorCode: `OPENAI_BACKGROUND_${error.status.toUpperCase()}`, errorMessage: reason }).catch(() => undefined);
        lastTerminalError = new Error(`GENESIS_G8_REPAIR_BACKGROUND_TERMINAL:${error.status}:${reason}`);
        requestScope = `${baseRequestScope}:retry:${stableFingerprint({ previousScope: requestScope, responseId: error.responseId })}`;
        continue;
      }
      const transport = classifyOpenAITransportError(error, "GENESIS_G8_REPAIR", timeoutMs);
      await completeAiRequest({ ledgerId: reservation.ledgerId, ok: false, durationMs: Date.now() - startedAt, errorCode: transport.code, errorMessage: transport.error.message }).catch(() => undefined);
      throw transport.error;
    }

    const json: unknown = await response.json().catch(() => null);
    const responseId = typeof (json as any)?.id === "string" ? (json as any).id : null;
    if (!response.ok) {
      await completeAiRequest({ ledgerId: reservation.ledgerId, ok: false, usage: responseUsage(json), webSearchCalls: 1, durationMs: Date.now() - startedAt, responseId, errorCode: `HTTP_${response.status}`, errorMessage: JSON.stringify((json as any)?.error ?? null) }).catch(() => undefined);
      throw new Error(`GENESIS_G8_REPAIR_OPENAI_FAILED:${response.status}`);
    }

    const status = typeof (json as any)?.status === "string" ? (json as any).status : null;
    if (status === "incomplete") {
      const reason = typeof (json as any)?.incomplete_details?.reason === "string" ? (json as any).incomplete_details.reason : "UNKNOWN";
      await completeAiRequest({ ledgerId: reservation.ledgerId, ok: false, usage: responseUsage(json), webSearchCalls: 1, durationMs: Date.now() - startedAt, responseId, errorCode: "INCOMPLETE_RESPONSE", errorMessage: reason }).catch(() => undefined);
      if (responseId) {
        lastTerminalError = new Error(`GENESIS_G8_REPAIR_INCOMPLETE:${reason}`);
        requestScope = `${baseRequestScope}:retry:${stableFingerprint({ previousScope: requestScope, responseId })}`;
        continue;
      }
      throw lastTerminalError ?? new Error(`GENESIS_G8_REPAIR_INCOMPLETE:${reason}`);
    }

    try {
      const parsed = await parseStructuredAiResponse({ response: json, schema: RepairResultSchema, jsonSchema: repairJsonSchema, schemaName: "genesis_g8_repair_v1", apiKey, model });
      await completeAiRequest({ ledgerId: reservation.ledgerId, ok: true, usage: responseUsage(json), webSearchCalls: 1, durationMs: Date.now() - startedAt, responseId });
      return parsed.value;
    } catch (error) {
      await discardOpenAIBackgroundResponse({ organisationId: governanceOrganisationId, campaignId: input.campaignId ?? null, jobType: "GENESIS_G8_REPAIR", jobId: input.repairId, requestScope }).catch(() => undefined);
      const safe = safeStructuredAiError(error);
      await completeAiRequest({ ledgerId: reservation.ledgerId, ok: false, usage: responseUsage(json), webSearchCalls: 1, durationMs: Date.now() - startedAt, responseId, errorCode: safe.code, errorMessage: safe.message }).catch(() => undefined);
      throw new Error(`GENESIS_G8_REPAIR_RESPONSE_${safe.code}`);
    }
  }

  throw lastTerminalError ?? new Error("GENESIS_G8_REPAIR_TERMINAL_RETRY_LIMIT");
}
