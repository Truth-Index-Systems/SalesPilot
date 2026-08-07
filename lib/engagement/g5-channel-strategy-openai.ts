import "server-only";
import { completeAiRequest, reserveAiRequest, responseUsage } from "@/lib/ai/governance";
import { compactForAi, stableFingerprint } from "@/lib/ai/cost-optimisation";
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
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("OPENAI_API_KEY_NOT_CONFIGURED");

  const model = resolveOpenAIModel("analysis").model;
  const compactInput = compactForAi({
    commercialReasoning: input.commercialReasoning,
    immutableG4: input.sourceSnapshot,
  }, { evidenceLimit: 8, depth: 8 }) as Record<string, unknown>;
  const sourceFingerprint = stableFingerprint(compactInput);
  const requestFingerprint = stableFingerprint({ prompt: "g5-channel-strategy/v1", model, sourceFingerprint });
  const startedAt = Date.now();

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
    response = await fetch(ENDPOINT, {
      method: "POST",
      cache: "no-store",
      signal: AbortSignal.timeout(120_000),
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        instructions: [
          "You are SalesPilot Genesis G5 Engagement Channel Strategy Intelligence.",
          "Commercial Reasoning and the supplied G4 snapshot are immutable inputs. Select how to begin the commercial conversation; never rediscover company, contact, route or buying-path truth.",
          "Choose only viable commercial route IDs present in immutableG4.opportunity.commercial_routes. Never invent a route ID, contact, address, profile, phone number or channel.",
          "The execution channel must exactly match the chosen G4 route channelType: DIRECT_EMAIL/DEPARTMENT_EMAIL/GENERAL_EMAIL => EMAIL; LINKEDIN => LINKEDIN; SWITCHBOARD => SWITCHBOARD; INTRODUCTION => REFERRAL. UNKNOWN is not actionable and must not be selected.",
          "A selectable route must already contain a non-empty channelValue. Do not infer missing reachability.",
          "Rank a primary move, then a genuinely useful secondary and fallback when the supplied viable routes support them. Use null when no distinct safe route exists.",
          "Consider route confidence, accessibility, authority, commercial relevance, evidence quality, difficulty, contact specificity and commercial friction. Do not automatically prefer email.",
          "Explain why the primary route is better than its alternatives. Do not write outreach copy, scripts or subject lines.",
          "primaryWhyNow must inherit the Commercial Reasoning timing logic and must not invent urgency.",
          "Use calm, concise British English. Return exact JSON only.",
        ].join(" "),
        input: JSON.stringify(compactInput),
        text: { format: { type: "json_schema", name: "salespilot_g5_channel_strategy_v1", strict: true, schema: g5ChannelStrategyJsonSchema } },
        max_output_tokens: 2200,
        store: false,
      }),
    });
  } catch (error) {
    await completeAiRequest({
      ledgerId: reservation.ledgerId, ok: false, durationMs: Date.now() - startedAt,
      errorCode: "NETWORK", errorMessage: error instanceof Error ? error.message : "OpenAI request failed",
    }).catch(() => undefined);
    throw error;
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
