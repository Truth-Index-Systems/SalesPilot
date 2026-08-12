import "server-only";
import { discardOpenAIBackgroundResponse, fetchResumableOpenAIResponse, isOpenAIBackgroundPending } from "@/lib/ai/background-response";
import { aiRequestTimeoutMs, classifyOpenAITransportError } from "@/lib/ai/request-policy";
import { aiWorkloadProfile, aiPromptCacheKey } from "@/lib/ai/workload-profile";
import { completeAiRequest, reserveAiRequest, responseUsage } from "@/lib/ai/governance";
import { compactG5OutreachBrief, stableFingerprint } from "@/lib/ai/cost-optimisation";
import { parseStructuredAiResponse, safeStructuredAiError } from "@/lib/ai/structured-response-gateway";
import { resolveOpenAIModel } from "@/lib/intelligence/model-router";
import {
  G5OutreachGenerationSchema,
  g5OutreachGenerationJsonSchema,
  type G5OutreachGeneration,
} from "./g5-outreach-generation-schema";

const ENDPOINT = "https://api.openai.com/v1/responses";

type RouteTruth = { id?: unknown; channelType?: unknown; channelValue?: unknown };
type PrimaryDecision = { routeId?: unknown; executionChannel?: unknown };

const CHANNEL_COMPATIBILITY: Record<string, G5OutreachGeneration["channel"] | null> = {
  DIRECT_EMAIL: "EMAIL",
  DEPARTMENT_EMAIL: "EMAIL",
  GENERAL_EMAIL: "EMAIL",
  LINKEDIN: "LINKEDIN",
  SWITCHBOARD: "SWITCHBOARD",
  INTRODUCTION: "REFERRAL",
  UNKNOWN: null,
};

function primaryDecision(channelStrategy: Record<string, unknown>): { routeId: string; channel: G5OutreachGeneration["channel"] } {
  const primary = channelStrategy.primary as PrimaryDecision | undefined;
  if (!primary || typeof primary.routeId !== "string" || typeof primary.executionChannel !== "string") {
    throw new Error("G5_OUTREACH_PRIMARY_CHANNEL_MISSING");
  }
  if (!["EMAIL", "LINKEDIN", "SWITCHBOARD", "REFERRAL"].includes(primary.executionChannel)) {
    throw new Error("G5_OUTREACH_PRIMARY_CHANNEL_UNSUPPORTED");
  }
  return { routeId: primary.routeId, channel: primary.executionChannel as G5OutreachGeneration["channel"] };
}

function routeById(sourceSnapshot: Record<string, unknown>, routeId: string): RouteTruth | null {
  const opportunity = sourceSnapshot.opportunity as Record<string, unknown> | undefined;
  const routes = Array.isArray(opportunity?.commercial_routes) ? opportunity.commercial_routes : [];
  for (const value of routes) {
    if (!value || typeof value !== "object") continue;
    const route = value as RouteTruth;
    if (route.id === routeId) return route;
  }
  return null;
}

function validateNativeContent(result: G5OutreachGeneration): void {
  const c = result.content;
  if (result.channel === "EMAIL" && !(c.subject && c.emailBody)) throw new Error("G5_OUTREACH_EMAIL_CONTENT_MISSING");
  if (result.channel === "LINKEDIN" && !c.linkedinMessage) throw new Error("G5_OUTREACH_LINKEDIN_CONTENT_MISSING");
  if (result.channel === "SWITCHBOARD" && !(c.switchboardOpening && c.switchboardRoutingRequest)) throw new Error("G5_OUTREACH_SWITCHBOARD_CONTENT_MISSING");
  if (result.channel === "REFERRAL" && !(c.referralRequest && c.referralForwardableNote)) throw new Error("G5_OUTREACH_REFERRAL_CONTENT_MISSING");
}

function validateAgainstImmutableDecision(input: {
  result: G5OutreachGeneration;
  channelStrategy: Record<string, unknown>;
  sourceSnapshot: Record<string, unknown>;
  personalisationSafety: Record<string, unknown>;
}): void {
  const primary = primaryDecision(input.channelStrategy);
  if (input.result.routeId !== primary.routeId) throw new Error("G5_OUTREACH_ROUTE_MISMATCH");
  if (input.result.channel !== primary.channel) throw new Error("G5_OUTREACH_CHANNEL_MISMATCH");
  const route = routeById(input.sourceSnapshot, primary.routeId);
  if (!route) throw new Error("G5_OUTREACH_CIE_ROUTE_MISSING");
  if (typeof route.channelValue !== "string" || route.channelValue.trim().length === 0) throw new Error("G5_OUTREACH_CIE_ROUTE_UNREACHABLE");
  const expected = typeof route.channelType === "string" ? CHANNEL_COMPATIBILITY[route.channelType] : null;
  if (!expected || expected !== primary.channel) throw new Error("G5_OUTREACH_CIE_CHANNEL_MISMATCH");
  const immutableSourceText = JSON.stringify(input.sourceSnapshot);
  for (const evidence of input.result.evidenceUsed) {
    if (!immutableSourceText.includes(evidence.sourceId)) throw new Error("G5_OUTREACH_UNKNOWN_EVIDENCE_SOURCE");
  }
  const safetyItems = Array.isArray(input.personalisationSafety.items)
    ? input.personalisationSafety.items
    : [];
  const allowedIds = new Set<string>();
  const verifiedSourceIds = new Set<string>();
  for (const raw of safetyItems) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as { itemId?: unknown; classification?: unknown; sourceId?: unknown };
    if (typeof item.itemId !== "string") continue;
    if (item.classification === "VERIFIED_FACT" || item.classification === "COMMERCIAL_INFERENCE") allowedIds.add(item.itemId);
    if (item.classification === "VERIFIED_FACT" && typeof item.sourceId === "string") verifiedSourceIds.add(item.sourceId);
  }
  for (const basisId of input.result.personalisationBasis) {
    if (!allowedIds.has(basisId)) throw new Error("G5_OUTREACH_PERSONALISATION_BASIS_NOT_ALLOWED");
  }
  for (const evidence of input.result.evidenceUsed) {
    if (!verifiedSourceIds.has(evidence.sourceId)) throw new Error("G5_OUTREACH_EVIDENCE_NOT_VERIFIED_FACT");
  }
  validateNativeContent(input.result);
}

export async function generateG5Outreach(input: {
  organisationId: string;
  campaignId: string;
  schedulerRunId: string;
  strategyId: string;
  commercialReasoning: Record<string, unknown>;
  channelStrategy: Record<string, unknown>;
  sourceSnapshot: Record<string, unknown>;
  personalisationSafety: Record<string, unknown>;
  rewriteInstruction?: Record<string, unknown> | null;
}): Promise<{ result: G5OutreachGeneration; model: string; sourceFingerprint: string }> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("OPENAI_API_KEY_NOT_CONFIGURED");

  const model = resolveOpenAIModel("analysis").model;
  const profile = aiWorkloadProfile("G5_OUTREACH_GENERATION");
  const compactInput = compactG5OutreachBrief({
    commercialReasoning: input.commercialReasoning,
    channelStrategy: input.channelStrategy,
    sourceSnapshot: input.sourceSnapshot,
    personalisationSafety: input.personalisationSafety,
    rewriteInstruction: input.rewriteInstruction ?? null,
  }, { evidenceLimit: profile.evidenceLimit, depth: profile.depth }) as Record<string, unknown>;
  const sourceFingerprint = stableFingerprint(compactInput);
  const requestFingerprint = stableFingerprint({ prompt: profile.promptVersion, cacheKey: aiPromptCacheKey("G5_OUTREACH_GENERATION"), model, sourceFingerprint });
  const startedAt = Date.now();
  const requestTimeoutMs = aiRequestTimeoutMs("G5_OUTREACH_GENERATION");
  const reservation = await reserveAiRequest({
    organisationId: input.organisationId,
    campaignId: input.campaignId,
    schedulerRunId: input.schedulerRunId,
    jobType: "OUTREACH",
    jobId: input.strategyId,
    requestScope: `g5-outreach-generation:${requestFingerprint}`,
    model,
    estimatedCostUsd: Number(process.env.SALESPILOT_OUTREACH_GENERATION_ESTIMATED_COST_USD ?? "0.06"),
  });

  let response: Response;
  try {
    response = await fetchResumableOpenAIResponse({ apiKey, task: "G5_OUTREACH_GENERATION", organisationId: input.organisationId, campaignId: input.campaignId, jobType: "OUTREACH", jobId: input.strategyId, requestScope: `g5-outreach-generation:${requestFingerprint}`, model, ledgerId: reservation.ledgerId }, {
      method: "POST",
      cache: "no-store",
      signal: AbortSignal.timeout(requestTimeoutMs),
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        instructions: [
          "ROLE: Executive Communications Director for MarketRoute, trusted to write under a senior commercial leader's name.",
          "MISSION: Express the already-approved commercial insight in the fewest natural words necessary to earn a response. Strategy has already been decided upstream; your job is precision, humanity and restraint.",
          "ACCOUNTABLE FOR: Language only - clarity, brevity, natural executive voice, channel-native structure and faithful expression of the approved commercial thesis. You are an executive editor, not a researcher or strategist.",
          "ADVISES BUT DOES NOT DECIDE: You may choose wording, sentence order and the least-friction phrasing of the already-approved next commitment. You do NOT introduce a new commercial claim, change route/channel/contact, reinterpret evidence, change the commercial thesis, approve your own message, set confidence thresholds, schedule or send.",
          "OUT OF SCOPE / HAND OFF: Every substantive claim must already exist in the current R4/R5/R6 authority lineage. If the inputs are weak or incomplete, write conservatively and expose limitations rather than solving the gap with creativity. R6 independently reviews quality; deterministic MarketRoute owns progression.",
          "DECISION STANDARD: Ask 'Would I allow a credible CEO, CRO or senior account executive to send this under their own name?' If it sounds automated, over-polished, needy, generic or like marketing copy, simplify it.",
          "VOICE: Sound like an intelligent operator who noticed something relevant, not a marketer who found a merge field. Prefer specific observation -> plausible implication -> credible relevance -> low-friction question.",
          "Current R4 commercial reality and CIE-R5/R6 route/contact authority are immutable. Never research, rediscover, alter or invent a route, contact, fact, pain, result, budget, relationship or timing claim.",
          "channelStrategy.primary routeId and executionChannel are authoritative. Generate only for that route/channel.",
          "Commercial Reasoning is the factual spine. Respect every prohibited claim and limitation.",
          "VERIFIED_FACT may be directly stated. COMMERCIAL_INFERENCE must be framed as possibility/hypothesis ('may', 'could', 'often', 'worth exploring') and never as something you know about the recipient. DO_NOT_USE must never appear or be implied.",
          "personalisationBasis must contain only personalisationSafety itemId values actually used. Never put free-text explanations there.",
          "If rewriteInstruction exists, repair every valid criticism while preserving route, evidence and claims. Do not solve a writing problem by inventing new information.",
          "EMAIL: normally target roughly 50-100 words when the commercial point can be made that briefly. Use a short, plain subject. Lead with relevance, not pleasantries. Avoid 'I hope you're well', 'I wanted to reach out', fake familiarity, generic compliments, buzzwords, feature dumps, inflated ROI and calendar-first CTAs. Prefer a low-friction interest/ownership question unless the reasoning clearly justifies a stronger ask.",
          "LINKEDIN: native, conversational and materially shorter than email; usually one observation/relevance point and one easy question. No subject-line language, email sign-off style or mini brochure. Connection note is optional and should never pretend familiarity.",
          "SWITCHBOARD: this is routing, not pitching. Give a natural spoken opening and a precise request to be connected to the function/person who owns the relevant problem. Keep the verified phone route visible in the supplied strategy/context; never invent a number.",
          "REFERRAL: minimise the social burden on the introducer. Ask clearly for the correct introduction and provide a very short forwardable note that makes relevance obvious without turning the referrer into the salesperson.",
          "Set every content field irrelevant to the selected channel to null.",
          "evidenceUsed may cite only source IDs present in immutable G4 context. Never fabricate source IDs.",
          "Before finalising, remove every sentence that does not materially increase relevance, credibility or likelihood of reply. Never introduce a new commercial proposition, pain, urgency, proof point or strategic idea simply because it would make the copy stronger.",
          "Everything outside your accountability belongs to another executive or deterministic MarketRoute. Do not assume another role merely to complete the task.",
          "Write natural professional British English. Return exact JSON only. Set promptVersion to g5-outreach-generation/v5-responsibility-boundary.",
        ].join(" "),
        input: JSON.stringify(compactInput),
        reasoning: { effort: profile.reasoningEffort },
        text: { format: { type: "json_schema", name: "salespilot_g5_outreach_generation_v1", strict: true, schema: g5OutreachGenerationJsonSchema } },
        max_output_tokens: profile.maxOutputTokens,
        store: false,
      }),
    });
  } catch (error) {
    if (isOpenAIBackgroundPending(error)) throw error;
    const transport = classifyOpenAITransportError(error, "G5_OUTREACH_GENERATION", requestTimeoutMs);
    await completeAiRequest({ ledgerId: reservation.ledgerId, ok: false, durationMs: Date.now() - startedAt, errorCode: transport.code, errorMessage: transport.error.message }).catch(() => undefined);
    throw transport.error;
  }

  const json: unknown = await response.json().catch(() => null);
  const usage = responseUsage(json);
  const responseId = typeof (json as { id?: unknown } | null)?.id === "string" ? (json as { id: string }).id : null;
  if (!response.ok) {
    await completeAiRequest({ ledgerId: reservation.ledgerId, ok: false, usage, durationMs: Date.now() - startedAt, responseId, errorCode: `HTTP_${response.status}`, errorMessage: JSON.stringify((json as { error?: unknown } | null)?.error ?? null) }).catch(() => undefined);
    throw new Error(`OPENAI_G5_OUTREACH_GENERATION_FAILED:${response.status}`);
  }

  let parsed: G5OutreachGeneration;
  try {
    parsed = (await parseStructuredAiResponse({ response: json, schema: G5OutreachGenerationSchema, jsonSchema: g5OutreachGenerationJsonSchema, schemaName: "salespilot_g5_outreach_generation_v1", apiKey, model })).value;
    validateAgainstImmutableDecision({ result: parsed, channelStrategy: input.channelStrategy, sourceSnapshot: input.sourceSnapshot, personalisationSafety: input.personalisationSafety });
  } catch (error) {
    await discardOpenAIBackgroundResponse({ organisationId: input.organisationId, campaignId: input.campaignId, jobType: "OUTREACH", jobId: input.strategyId, requestScope: `g5-outreach-generation:${requestFingerprint}` }).catch(()=>undefined);
    const safe = safeStructuredAiError(error);
    await completeAiRequest({ ledgerId: reservation.ledgerId, ok: false, usage, durationMs: Date.now() - startedAt, responseId, errorCode: safe.code, errorMessage: safe.message }).catch(() => undefined);
    throw error;
  }

  await completeAiRequest({ ledgerId: reservation.ledgerId, ok: true, usage, durationMs: Date.now() - startedAt, responseId });
  return { result: parsed, model, sourceFingerprint };
}
