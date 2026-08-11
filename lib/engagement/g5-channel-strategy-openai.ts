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
  void input;
  throw new Error("CIE_R8_AUTHORITY_VIOLATION:AI_ROUTE_SELECTION_ERADICATED");
}
