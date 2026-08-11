import "server-only";
import { discardOpenAIBackgroundResponse, fetchResumableOpenAIResponse, isOpenAIBackgroundPending } from "@/lib/ai/background-response";
import { aiRequestTimeoutMs, classifyOpenAITransportError } from "@/lib/ai/request-policy";
import { aiWorkloadProfile, aiPromptCacheKey } from "@/lib/ai/workload-profile";
import { completeAiRequest, reserveAiRequest, responseUsage } from "@/lib/ai/governance";
import { compactG5ChannelBrief, stableFingerprint } from "@/lib/ai/cost-optimisation";
import { parseStructuredAiResponse, safeStructuredAiError } from "@/lib/ai/structured-response-gateway";
import { resolveOpenAIModel } from "@/lib/intelligence/model-router";
import {
  G5ChannelStrategySchema,
  g5ChannelStrategyJsonSchema,
  type G5ChannelStrategy,
  type G5RouteDecision,
} from "./g5-channel-strategy-schema";

const ENDPOINT = "https://api.openai.com/v1/responses";

type RouteTruth = {
  id?: unknown;
  channelType?: unknown;
  channelValue?: unknown;
  isViable?: unknown;
};

const CHANNEL_COMPATIBILITY: Record<string, G5RouteDecision["executionChannel"] | null> = {
  DIRECT_EMAIL: "EMAIL",
  DEPARTMENT_EMAIL: "EMAIL",
  GENERAL_EMAIL: "EMAIL",
  LINKEDIN: "LINKEDIN",
  SWITCHBOARD: "SWITCHBOARD",
  INTRODUCTION: "REFERRAL",
  UNKNOWN: null,
};

function routeTruthById(sourceSnapshot: Record<string, unknown>): Map<string, RouteTruth> {
  const opportunity = sourceSnapshot.opportunity as Record<string, unknown> | undefined;
  const routes = Array.isArray(opportunity?.commercial_routes) ? opportunity.commercial_routes : [];
  const result = new Map<string, RouteTruth>();
  for (const value of routes) {
    if (!value || typeof value !== "object") continue;
    const route = value as RouteTruth;
    if (typeof route.id === "string") result.set(route.id, route);
  }
  return result;
}

function validateDecision(decision: G5RouteDecision | null, routes: Map<string, RouteTruth>, label: string): void {
  if (!decision) return;
  const route = routes.get(decision.routeId);
  if (!route) throw new Error(`G5_CHANNEL_STRATEGY_UNKNOWN_${label}_ROUTE`);
  if (route.isViable !== true) throw new Error(`G5_CHANNEL_STRATEGY_NON_VIABLE_${label}_ROUTE`);
  const expected = typeof route.channelType === "string" ? CHANNEL_COMPATIBILITY[route.channelType] : null;
  if (!expected || expected !== decision.executionChannel) {
    throw new Error(`G5_CHANNEL_STRATEGY_CHANNEL_MISMATCH_${label}`);
  }
  if (typeof route.channelValue !== "string" || route.channelValue.trim().length === 0) {
    throw new Error(`G5_CHANNEL_STRATEGY_UNREACHABLE_${label}_ROUTE`);
  }
}


function deterministicSingleRouteStrategy(input: {
  commercialReasoning: Record<string, unknown>;
  sourceSnapshot: Record<string, unknown>;
}): G5ChannelStrategy | null {
  const routes = [...routeTruthById(input.sourceSnapshot).values()].filter((route) => {
    if (route.isViable !== true) return false;
    if (typeof route.channelValue !== "string" || route.channelValue.trim().length === 0) return false;
    return typeof route.channelType === "string" && Boolean(CHANNEL_COMPATIBILITY[route.channelType]);
  });
  if (routes.length !== 1) return null;
  const route = routes[0];
  if (typeof route.id !== "string" || typeof route.channelType !== "string") return null;
  const executionChannel = CHANNEL_COMPATIBILITY[route.channelType];
  if (!executionChannel) return null;

  const whyNow = typeof input.commercialReasoning.whyNow === "string" && input.commercialReasoning.whyNow.trim()
    ? input.commercialReasoning.whyNow.trim()
    : "No separate timing trigger is verified; use the established commercial relevance without manufacturing urgency.";
  const commitment = typeof input.commercialReasoning.smallestReasonableCommitment === "string" && input.commercialReasoning.smallestReasonableCommitment.trim()
    ? input.commercialReasoning.smallestReasonableCommitment.trim()
    : "Confirm relevance and the correct owner for a next conversation.";

  return G5ChannelStrategySchema.parse({
    schemaVersion: "g5-channel-strategy/v1",
    promptVersion: "g5-channel-strategy/v3-responsibility-boundary",
    primary: {
      routeId: route.id,
      executionChannel,
      selectionReason: "This is the only G4-validated route that is both viable and directly reachable, so no comparative channel judgement is required.",
      commercialFriction: executionChannel === "EMAIL" || executionChannel === "LINKEDIN" ? "LOW" : "MEDIUM",
      expectedCommitment: commitment,
    },
    secondary: null,
    fallback: null,
    sequenceRationale: "Use the sole validated executable route first. Do not manufacture an alternative route merely to create sequence diversity.",
    primaryWhyNow: whyNow,
    alternativesNotFirst: [],
    channelConfidence: 95,
    limitations: ["Only one viable reachable G4 route is currently available; route diversity remains limited."],
  });
}

function validateAgainstImmutableRoutes(result: G5ChannelStrategy, sourceSnapshot: Record<string, unknown>): void {
  const routes = routeTruthById(sourceSnapshot);
  if (!routes.size) throw new Error("G5_CHANNEL_STRATEGY_NO_G4_ROUTES");
  validateDecision(result.primary, routes, "PRIMARY");
  validateDecision(result.secondary, routes, "SECONDARY");
  validateDecision(result.fallback, routes, "FALLBACK");

  const selected = [result.primary.routeId, result.secondary?.routeId, result.fallback?.routeId].filter(Boolean);
  if (new Set(selected).size !== selected.length) throw new Error("G5_CHANNEL_STRATEGY_DUPLICATE_ROUTE_SELECTION");
  for (const alternative of result.alternativesNotFirst) {
    if (!routes.has(alternative.routeId)) throw new Error("G5_CHANNEL_STRATEGY_UNKNOWN_ALTERNATIVE_ROUTE");
  }
}

export async function generateG5ChannelStrategy(input: {
  organisationId: string;
  campaignId: string;
  schedulerRunId: string;
  strategyId: string;
  commercialReasoning: Record<string, unknown>;
  sourceSnapshot: Record<string, unknown>;
}): Promise<{ result: G5ChannelStrategy; model: string; sourceFingerprint: string }> {
  throw new Error("CIE_R8_AUTHORITY_VIOLATION:AI_ROUTE_SELECTION_ERADICATED");
  const profile = aiWorkloadProfile("G5_CHANNEL_STRATEGY");
  const compactInput = compactG5ChannelBrief({
    commercialReasoning: input.commercialReasoning,
    sourceSnapshot: input.sourceSnapshot,
  }, { evidenceLimit: profile.evidenceLimit, depth: profile.depth }) as Record<string, unknown>;
  const sourceFingerprint = stableFingerprint(compactInput);
  const deterministic = deterministicSingleRouteStrategy({ commercialReasoning: input.commercialReasoning, sourceSnapshot: input.sourceSnapshot });
  if (deterministic) {
    validateAgainstImmutableRoutes(deterministic, input.sourceSnapshot);
    return { result: deterministic, model: "deterministic:r4-single-route", sourceFingerprint };
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("OPENAI_API_KEY_NOT_CONFIGURED");
  const model = resolveOpenAIModel("analysis").model;
  const requestFingerprint = stableFingerprint({ prompt: profile.promptVersion, cacheKey: aiPromptCacheKey("G5_CHANNEL_STRATEGY"), model, sourceFingerprint });
  const startedAt = Date.now();
  const requestTimeoutMs = aiRequestTimeoutMs("G5_CHANNEL_STRATEGY");

  const reservation = await reserveAiRequest({
    organisationId: input.organisationId,
    campaignId: input.campaignId,
    schedulerRunId: input.schedulerRunId,
    jobType: "COMMERCIAL_REASONING",
    jobId: input.strategyId,
    requestScope: `g5-channel-strategy:${requestFingerprint}`,
    model,
    estimatedCostUsd: Number(process.env.SALESPILOT_CHANNEL_STRATEGY_ESTIMATED_COST_USD ?? "0.05"),
  });

  let response: Response;
  try {
    response = await fetchResumableOpenAIResponse({ apiKey, task: "G5_CHANNEL_STRATEGY", organisationId: input.organisationId, campaignId: input.campaignId, jobType: "COMMERCIAL_REASONING", jobId: input.strategyId, requestScope: `g5-channel-strategy:${requestFingerprint}`, model, ledgerId: reservation.ledgerId }, {
      method: "POST",
      cache: "no-store",
      signal: AbortSignal.timeout(requestTimeoutMs),
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        instructions: [
          "ROLE: VP Sales Development for MarketRoute.",
          "MISSION: Select the first action most likely to create the right commercial conversation with the least avoidable friction. Do not choose the channel that merely looks most convenient in the data.",
          "ACCOUNTABLE FOR: Recommend the first engagement move and safe sequence among already-validated G4 routes. Treat each route as a real SDR/BDR move and evaluate reachability, buyer relevance, sufficient authority, routing power, evidence, friction and probability of reaching the right conversation.",
          "ADVISES BUT DOES NOT DECIDE: You recommend primary/secondary/fallback route IDs and execution channel mappings. You do NOT invent or validate new contacts/routes, write outreach, alter Commercial Reasoning, decide whether a message passes review, approve the strategy, set system thresholds, queue or send. MarketRoute deterministically validates every selected route before persistence/execution.",
          "OUT OF SCOPE / HAND OFF: Route Intelligence owns the available access map; Commercial Reasoning owns why the account should care; Executive Communications owns wording. If the available routes are weak, report limitations instead of repairing them with invented access or copy.",
          "DECISION STANDARD: Ask 'If one capable salesperson had exactly one attempt on this account today, where should they spend it?' Then ask what move two should be if the first attempt fails. Sequence awareness should improve the first choice.",
          "Do not automatically prefer email or the most senior person. A directly reachable operational owner can beat an executive; a switchboard can beat a generic inbox; a referral can beat both when routing probability is materially higher.",
          "Commercial Reasoning and the supplied G4 snapshot are immutable inputs. Never rediscover company/contact/route truth and never write outreach.",
          "Choose only viable route IDs present in immutableG4.opportunity.commercial_routes. Never invent a route ID, contact, address, profile, phone or channel.",
          "Execution channel must exactly match G4 route channelType: DIRECT_EMAIL/DEPARTMENT_EMAIL/GENERAL_EMAIL => EMAIL; LINKEDIN => LINKEDIN; SWITCHBOARD => SWITCHBOARD; INTRODUCTION => REFERRAL. UNKNOWN is never actionable.",
          "Every selected route must already contain a non-empty channelValue. Never infer missing reachability.",
          "Rank a primary move, then a genuinely independent secondary and fallback when available. Use null rather than manufacturing diversity.",
          "Primary selection should maximise probability of a relevant conversation, considering authority, relevance, accessibility, routing power, evidence quality, contact specificity and commercial friction.",
          "Explain why alternatives are not first. This explainability should make sense to an experienced sales leader reviewing the account plan.",
          "primaryWhyNow must inherit Commercial Reasoning timing and must not create urgency.",
          "FALSIFICATION: Before finalising, ask whether the easiest route is misleadingly attractive and whether a slightly harder route is materially more likely to reach the real owner.",
          "Everything outside your accountability belongs to another executive or deterministic MarketRoute. Do not assume another role merely to complete the task.",
          "Write calm, concise British English. Return exact JSON only. Set promptVersion to g5-channel-strategy/v3-responsibility-boundary.",
        ].join(" "),
        input: JSON.stringify(compactInput),
        reasoning: { effort: profile.reasoningEffort },
        text: { format: { type: "json_schema", name: "salespilot_g5_channel_strategy_v1", strict: true, schema: g5ChannelStrategyJsonSchema } },
        max_output_tokens: profile.maxOutputTokens,
        store: false,
      }),
    });
  } catch (error) {
    if (isOpenAIBackgroundPending(error)) throw error;
    const transport = classifyOpenAITransportError(error, "G5_CHANNEL_STRATEGY", requestTimeoutMs);
    await completeAiRequest({
      ledgerId: reservation.ledgerId, ok: false, durationMs: Date.now() - startedAt,
      errorCode: transport.code, errorMessage: transport.error.message,
    }).catch(() => undefined);
    throw transport.error;
  }

  const json: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    await completeAiRequest({
      ledgerId: reservation.ledgerId, ok: false, usage: responseUsage(json), durationMs: Date.now() - startedAt,
      responseId: typeof (json as any)?.id === "string" ? (json as any).id : null,
      errorCode: `HTTP_${response.status}`, errorMessage: JSON.stringify((json as any)?.error ?? null),
    }).catch(() => undefined);
    throw new Error(`OPENAI_G5_CHANNEL_STRATEGY_FAILED:${response.status}`);
  }

  let parsed: G5ChannelStrategy;
  try {
    parsed = (await parseStructuredAiResponse({
      response: json,
      schema: G5ChannelStrategySchema,
      jsonSchema: g5ChannelStrategyJsonSchema,
      schemaName: "salespilot_g5_channel_strategy_v1",
      apiKey,
      model,
    })).value;
    validateAgainstImmutableRoutes(parsed, input.sourceSnapshot);
  } catch (error) {
    await discardOpenAIBackgroundResponse({ organisationId: input.organisationId, campaignId: input.campaignId, jobType: "COMMERCIAL_REASONING", jobId: input.strategyId, requestScope: `g5-channel-strategy:${requestFingerprint}` }).catch(()=>undefined);
    const safe = safeStructuredAiError(error);
    await completeAiRequest({
      ledgerId: reservation.ledgerId, ok: false, usage: responseUsage(json), durationMs: Date.now() - startedAt,
      errorCode: safe.code, errorMessage: safe.message,
    }).catch(() => undefined);
    throw error;
  }

  await completeAiRequest({
    ledgerId: reservation.ledgerId, ok: true, usage: responseUsage(json), durationMs: Date.now() - startedAt,
    responseId: typeof (json as any)?.id === "string" ? (json as any).id : null,
  });

  return { result: parsed, model, sourceFingerprint };
}
