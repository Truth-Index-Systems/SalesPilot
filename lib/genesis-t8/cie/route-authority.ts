import {
  evaluateCommercialGraph,
  type GenesisT8CommercialDecisionGraph,
  type GenesisT8CommercialPathEdge,
} from "../ce2-evolution/commercial-graph-calculus";

export const GENESIS_T8_CIE_R5_VERSION = "1.0.0" as const;
export const GENESIS_T8_CIE_R5_BUILD = "CIE-R5" as const;
export const GENESIS_T8_CIE_R5_AUTHORITY_MODE = "AUTHORITATIVE" as const;

export type CieR5ExecutionChannel = "EMAIL" | "LINKEDIN" | "SWITCHBOARD" | "REFERRAL";

export type CieR5RouteDecision = Readonly<{ routeId: string; executionChannel: CieR5ExecutionChannel; selectionReason: string; commercialFriction: "LOW" | "MEDIUM" | "HIGH"; expectedCommitment: string }>;
export type CieR5ChannelStrategy = Readonly<{ schemaVersion: "g5-channel-strategy/v1"; promptVersion: "cie-r5-route-authority/v1"; primary: CieR5RouteDecision; secondary: CieR5RouteDecision | null; fallback: CieR5RouteDecision | null; sequenceRationale: string; primaryWhyNow: string; alternativesNotFirst: readonly Readonly<{ routeId: string; reason: string }>[]; channelConfidence: number; limitations: readonly string[] }>;

const CHANNEL_COMPATIBILITY: Readonly<Record<string, CieR5ExecutionChannel | null>> = Object.freeze({
  DIRECT_EMAIL: "EMAIL",
  DEPARTMENT_EMAIL: "EMAIL",
  GENERAL_EMAIL: "EMAIL",
  LINKEDIN: "LINKEDIN",
  SWITCHBOARD: "SWITCHBOARD",
  INTRODUCTION: "REFERRAL",
  UNKNOWN: null,
});

type RouteTruth = Readonly<{
  id?: unknown;
  channelType?: unknown;
  channelValue?: unknown;
  isViable?: unknown;
}>;

type AuthoritativeRoute = Readonly<{
  id: string;
  channelType: string;
  channelValue: string | null;
  executionChannel: CieR5ExecutionChannel | null;
  edgeState: "OPEN" | "UNRESOLVED" | "BLOCKED";
}>;

export type CieR5RouteAuthorityResult = Readonly<{
  strategy: CieR5ChannelStrategy;
  graphAssessment: ReturnType<typeof evaluateCommercialGraph>;
  selectedRouteIds: readonly string[];
}>;

function canonicalRoute(value: unknown): AuthoritativeRoute | null {
  if (!value || typeof value !== "object") return null;
  const route = value as RouteTruth;
  if (typeof route.id !== "string" || !route.id.trim()) return null;
  const channelType = typeof route.channelType === "string" ? route.channelType : "UNKNOWN";
  const executionChannel = CHANNEL_COMPATIBILITY[channelType] ?? null;
  const channelValue = typeof route.channelValue === "string" && route.channelValue.trim() ? route.channelValue.trim() : null;
  const edgeState: AuthoritativeRoute["edgeState"] = route.isViable !== true
    ? "BLOCKED"
    : executionChannel && channelValue
      ? "OPEN"
      : "UNRESOLVED";
  return Object.freeze({ id: route.id, channelType, channelValue, executionChannel, edgeState });
}

function sourceRoutes(sourceSnapshot: Record<string, unknown>): readonly AuthoritativeRoute[] {
  const opportunity = sourceSnapshot.opportunity as Record<string, unknown> | undefined;
  const raw = Array.isArray(opportunity?.commercial_routes) ? opportunity.commercial_routes : [];
  const routes = raw.map(canonicalRoute).filter((route): route is AuthoritativeRoute => route !== null);
  const ids = new Set<string>();
  for (const route of routes) {
    if (ids.has(route.id)) throw new Error("GENESIS_T8_CIE_R5_VIOLATION:DUPLICATE_ROUTE_ID");
    ids.add(route.id);
  }
  return Object.freeze([...routes].sort((a, b) => a.id.localeCompare(b.id)));
}

function graphForRoutes(realityId: string, routes: readonly AuthoritativeRoute[]): GenesisT8CommercialDecisionGraph {
  const sourceNodeId = "cie:seller";
  const targetNodeId = "cie:commercial-objective";
  const edges: GenesisT8CommercialPathEdge[] = routes.map((route) => Object.freeze({
    edgeId: route.id,
    fromNodeId: sourceNodeId,
    toNodeId: targetNodeId,
    sourceRelationshipId: route.id,
    state: route.edgeState,
    stabilityMargin: null,
  }));
  return Object.freeze({
    realityId,
    nodes: Object.freeze([
      Object.freeze({ nodeId: sourceNodeId, referencedTokenIds: Object.freeze([]) }),
      Object.freeze({ nodeId: targetNodeId, referencedTokenIds: Object.freeze([]) }),
    ]),
    edges: Object.freeze(edges),
  });
}

function commercialReasoningText(commercialReasoning: Record<string, unknown>, key: string, fallback: string): string {
  const value = commercialReasoning[key];
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function routeDecision(route: AuthoritativeRoute, reason: string, commitment: string): CieR5RouteDecision {
  if (!route.executionChannel || !route.channelValue || route.edgeState !== "OPEN") throw new Error("GENESIS_T8_CIE_R5_VIOLATION:NON_OPEN_SELECTION");
  return {
    routeId: route.id,
    executionChannel: route.executionChannel,
    selectionReason: reason,
    commercialFriction: "MEDIUM",
    expectedCommitment: commitment,
  };
}

/**
 * Authoritative R5 route decision.
 *
 * The R7 Pareto frontier is the commercial result. When multiple OPEN paths are
 * mathematically indistinguishable under authorised graph information, route ID
 * ordering is only an operational tie-break. It is not a commercial ranking.
 */
export function evaluateCieR5RouteAuthority(input: {
  realityId: string;
  commercialReasoning: Record<string, unknown>;
  sourceSnapshot: Record<string, unknown>;
}): CieR5RouteAuthorityResult {
  if (!input.realityId.trim()) throw new Error("GENESIS_T8_CIE_R5_VIOLATION:REALITY_ID");
  const routes = sourceRoutes(input.sourceSnapshot);
  if (!routes.length) throw new Error("GENESIS_T8_CIE_R5_VIOLATION:NO_ROUTES");
  const graph = graphForRoutes(input.realityId, routes);
  const assessment = evaluateCommercialGraph(graph, "cie:seller", "cie:commercial-objective", { maxSimplePaths: 64, maxPathDepth: 4 });
  const frontierIds = assessment.openParetoPaths.flatMap((path) => path.edgeIds.length === 1 ? [path.edgeIds[0]] : []);
  const selected = [...new Set(frontierIds)].sort((a, b) => a.localeCompare(b));
  if (!selected.length) throw new Error(assessment.structuralReachable
    ? "GENESIS_T8_CIE_R5_ROUTE_UNRESOLVED"
    : "GENESIS_T8_CIE_R5_NO_STRUCTURAL_ROUTE");

  const byId = new Map(routes.map((route) => [route.id, route] as const));
  const chosen = selected.slice(0, 3).map((id) => byId.get(id)!).filter(Boolean);
  const commitment = commercialReasoningText(input.commercialReasoning, "smallestReasonableCommitment", "Confirm relevance and the correct owner for a next conversation.");
  const whyNow = commercialReasoningText(input.commercialReasoning, "whyNow", "No separate timing trigger is verified; use the established commercial relevance without manufacturing urgency.");
  const tie = selected.length > 1;
  const primaryReason = tie
    ? "This route is on the authoritative OPEN Pareto frontier. Other frontier routes are mathematically nondominated; canonical route ID order is used only to make execution reproducible, not to claim superior commercial value."
    : "This is the unique authoritative OPEN route on the current Pareto frontier.";
  const secondaryReason = "This is another authoritative OPEN nondominated route retained as an independent execution alternative.";

  const strategy: CieR5ChannelStrategy = Object.freeze({
    schemaVersion: "g5-channel-strategy/v1",
    promptVersion: "cie-r5-route-authority/v1",
    primary: routeDecision(chosen[0], primaryReason, commitment),
    secondary: chosen[1] ? routeDecision(chosen[1], secondaryReason, commitment) : null,
    fallback: chosen[2] ? routeDecision(chosen[2], secondaryReason, commitment) : null,
    sequenceRationale: tie
      ? "Execute the canonical member of the nondominated OPEN frontier first. Remaining frontier members are preserved as alternatives; the sequence is operational, not a weighted commercial ranking."
      : "Use the uniquely justified OPEN Pareto route first.",
    primaryWhyNow: whyNow,
    alternativesNotFirst: selected.slice(3).map((routeId) => ({ routeId, reason: "Also on the authoritative OPEN Pareto frontier but outside the three-slot execution compatibility envelope." })),
    // Compatibility telemetry only: 100 denotes categorical OPEN validation, not probability/rank.
    channelConfidence: 100,
    limitations: Object.freeze([
      `CIE-R5 graph robustness: ${assessment.robustnessClass}.`,
      ...(tie ? ["Multiple nondominated OPEN routes exist; no scalar score was used to claim one is commercially superior."] : []),
    ]),
  });

  return Object.freeze({ strategy, graphAssessment: assessment, selectedRouteIds: Object.freeze(selected) });
}

export const GENESIS_T8_CIE_R5_ROUTE_LAWS = Object.freeze([
  "UDOSIB_R7_IS_THE_AUTHORITATIVE_ROUTE_REASONING_OWNER",
  "AI_MAY_NOT_SELECT_PRIMARY_SECONDARY_OR_FALLBACK_ROUTES",
  "OPEN_PATHS_CATEGORICALLY_PRECEDE_UNRESOLVED_AND_BLOCKED_PATHS",
  "THE_PARETO_FRONTIER_IS_THE_COMMERCIAL_ROUTE_DECISION",
  "CANONICAL_TIE_BREAKS_AMONG_MATHEMATICALLY_EQUIVALENT_FRONTIER_ROUTES_ARE_OPERATIONAL_NOT_COMMERCIAL_RANKS",
  "LEGACY_WEIGHTED_ROUTE_SCORES_MAY_NOT_CONTROL_ROUTE_SELECTION",
  "MISSING_OPEN_ROUTE_FAILS_CLOSED_AND_NEVER_FALLS_BACK_TO_AI_OR_LEGACY_SCORING",
] as const);
