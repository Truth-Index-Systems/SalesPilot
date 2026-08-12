import {
  evaluateCommercialGraph,
  type GenesisT8CommercialDecisionGraph,
  type GenesisT8CommercialPathEdge,
} from "../ce2-evolution/commercial-graph-calculus";

export const GENESIS_T8_CIE_R5_VERSION = "2.0.0" as const;
export const GENESIS_T8_CIE_R5_BUILD = "CIE-R5-FB4" as const;
export const GENESIS_T8_CIE_R5_AUTHORITY_MODE = "AUTHORITATIVE" as const;
export const GENESIS_T8_CIE_R5_ROUTE_EVIDENCE_SEMANTICS = "MR-T8-FB4-RAW-ROUTE-EVIDENCE-1.0.0" as const;

export type CieR5ExecutionChannel = "EMAIL" | "LINKEDIN" | "SWITCHBOARD" | "REFERRAL";
export type CieR5RouteState = "OPEN" | "UNRESOLVED" | "BLOCKED";

export type CieR5RouteDecision = Readonly<{
  routeId: string;
  executionChannel: CieR5ExecutionChannel;
  selectionReason: string;
  commercialFriction: "LOW" | "MEDIUM" | "HIGH";
  expectedCommitment: string;
}>;

export type CieR5ChannelStrategy = Readonly<{
  schemaVersion: "g5-channel-strategy/v1";
  promptVersion: "cie-r5-route-authority/v2";
  primary: CieR5RouteDecision;
  secondary: CieR5RouteDecision | null;
  fallback: CieR5RouteDecision | null;
  sequenceRationale: string;
  primaryWhyNow: string;
  alternativesNotFirst: readonly Readonly<{ routeId: string; reason: string }>[];
  channelConfidence: number;
  limitations: readonly string[];
}>;

const CHANNEL_COMPATIBILITY: Readonly<Record<string, CieR5ExecutionChannel | null>> = Object.freeze({
  DIRECT_EMAIL: "EMAIL",
  DEPARTMENT_EMAIL: "EMAIL",
  GENERAL_EMAIL: "EMAIL",
  LINKEDIN: "LINKEDIN",
  SWITCHBOARD: "SWITCHBOARD",
  INTRODUCTION: "REFERRAL",
  UNKNOWN: null,
});

type RouteEvidence = Readonly<{
  evidenceType?: unknown;
  claim?: unknown;
  sourceUrl?: unknown;
  excerpt?: unknown;
  verified?: unknown;
  excerptMatched?: unknown;
}>;

type RouteTruth = Readonly<{
  id?: unknown;
  routeType?: unknown;
  contactName?: unknown;
  contactRole?: unknown;
  targetRole?: unknown;
  channelType?: unknown;
  channelValue?: unknown;
  routeSemanticsVersion?: unknown;
  evidence?: unknown;
}>;

export type AuthoritativeRoute = Readonly<{
  id: string;
  routeType: string;
  contactName: string | null;
  contactRole: string | null;
  targetRole: string | null;
  channelType: string;
  channelValue: string | null;
  executionChannel: CieR5ExecutionChannel | null;
  edgeState: CieR5RouteState;
  evidenceSupport: "CHANNEL_VALUE_SUPPORTED" | "CHANNEL_VALUE_UNSUPPORTED" | "CHANNEL_UNRESOLVED";
}>;

export type CieR5RouteAuthorityResult = Readonly<{
  authorityMode: "AUTHORITATIVE";
  evidenceSemanticsVersion: typeof GENESIS_T8_CIE_R5_ROUTE_EVIDENCE_SEMANTICS;
  strategy: CieR5ChannelStrategy;
  graphAssessment: ReturnType<typeof evaluateCommercialGraph>;
  selectedRouteIds: readonly string[];
  routeStates: readonly AuthoritativeRoute[];
}>;

const text = (value: unknown): string => typeof value === "string" ? value.trim() : "";
const lower = (value: unknown): string => text(value).toLowerCase();
const digits = (value: unknown): string => text(value).replace(/\D+/g, "");

function normalizedLinkedIn(value: string): string {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    if (host !== "linkedin.com" && !host.endsWith(".linkedin.com")) return "";
    return `https://www.linkedin.com${url.pathname.replace(/\/$/, "")}`.toLowerCase();
  } catch { return ""; }
}

function evidenceRows(route: RouteTruth): readonly RouteEvidence[] {
  return Array.isArray(route.evidence) ? route.evidence.filter((item): item is RouteEvidence => !!item && typeof item === "object") : [];
}

/**
 * Build 4 route evidence qualification.
 *
 * OPEN never derives from an AI score or historical is_viable flag. The concrete
 * persisted channel value must itself be present in deterministically-normalised
 * qualifying evidence. `verified` means the normaliser accepted the source as an
 * allowed official/first-party source; `excerptMatched` is retained as a minimum
 * evidence-presence gate, while this function performs the missing value-to-source
 * match that the legacy implementation never required.
 */
function channelValueSupported(route: RouteTruth, channelType: string, channelValue: string): boolean {
  const candidates = evidenceRows(route).filter((item) => item.verified === true && item.excerptMatched === true && text(item.sourceUrl));
  if (!candidates.length) return false;

  if (["DIRECT_EMAIL", "DEPARTMENT_EMAIL", "GENERAL_EMAIL"].includes(channelType)) {
    const expected = channelValue.toLowerCase();
    return candidates.some((item) => `${lower(item.claim)} ${lower(item.excerpt)} ${lower(item.sourceUrl)}`.includes(expected));
  }

  if (channelType === "LINKEDIN") {
    const expected = normalizedLinkedIn(channelValue);
    return !!expected && candidates.some((item) => normalizedLinkedIn(text(item.sourceUrl)) === expected || `${lower(item.claim)} ${lower(item.excerpt)}`.includes(expected));
  }

  if (channelType === "SWITCHBOARD") {
    const expected = digits(channelValue);
    if (expected.length < 7) return false;
    return candidates.some((item) => digits(`${text(item.claim)} ${text(item.excerpt)}`).includes(expected));
  }

  if (channelType === "INTRODUCTION") {
    const value = channelValue.toLowerCase();
    const person = lower(route.contactName);
    return candidates.some((item) => {
      const body = `${lower(item.claim)} ${lower(item.excerpt)}`;
      return (value.length >= 3 && body.includes(value)) || (person.length >= 3 && body.includes(person));
    });
  }

  return false;
}

export function evaluateRawRouteState(value: unknown): AuthoritativeRoute | null {
  if (!value || typeof value !== "object") return null;
  const route = value as RouteTruth;
  const id = text(route.id);
  if (!id) return null;
  const routeSemanticsVersion = text(route.routeSemanticsVersion);
  const channelType = text(route.channelType) || "UNKNOWN";
  const executionChannel = CHANNEL_COMPATIBILITY[channelType] ?? null;
  const channelValue = text(route.channelValue) || null;
  const routeType = text(route.routeType) || "OPERATIONAL";
  const contactName = text(route.contactName) || null;
  const contactRole = text(route.contactRole) || null;
  const targetRole = text(route.targetRole) || null;

  if (!["MR-T8-FB4-RAW", "MR-T8-FB4-MIGRATED-RAW"].includes(routeSemanticsVersion)) {
    return Object.freeze({ id, routeType, contactName, contactRole, targetRole, channelType, channelValue, executionChannel, edgeState: "UNRESOLVED", evidenceSupport: "CHANNEL_UNRESOLVED" });
  }

  if (channelType === "UNKNOWN" || !executionChannel || !channelValue) {
    return Object.freeze({ id, routeType, contactName, contactRole, targetRole, channelType, channelValue, executionChannel, edgeState: "UNRESOLVED", evidenceSupport: "CHANNEL_UNRESOLVED" });
  }

  const supported = channelValueSupported(route, channelType, channelValue);
  return Object.freeze({
    id, routeType, contactName, contactRole, targetRole, channelType, channelValue, executionChannel,
    edgeState: supported ? "OPEN" : "UNRESOLVED",
    evidenceSupport: supported ? "CHANNEL_VALUE_SUPPORTED" : "CHANNEL_VALUE_UNSUPPORTED",
  });
}

function sourceRoutes(sourceSnapshot: Record<string, unknown>): readonly AuthoritativeRoute[] {
  const opportunity = sourceSnapshot.opportunity as Record<string, unknown> | undefined;
  const raw = Array.isArray(opportunity?.commercial_routes) ? opportunity.commercial_routes : [];
  const routes = raw.map(evaluateRawRouteState).filter((route): route is AuthoritativeRoute => route !== null);
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
  return Object.freeze({
    routeId: route.id,
    executionChannel: route.executionChannel,
    selectionReason: reason,
    commercialFriction: "MEDIUM",
    expectedCommitment: commitment,
  });
}

/**
 * Authoritative R5 route decision.
 *
 * Build 4 removes the final legacy authority leak. OPEN is determined only by
 * supported executable route facts. AI numeric route scores and commercial_routes
 * is_viable/is_primary are not accepted inputs.
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
    ? "This evidence-qualified route is on the authoritative OPEN Pareto frontier. Other frontier routes are mathematically nondominated; canonical route ID order is used only to make execution reproducible, not to claim superior commercial value."
    : "This is the unique evidence-qualified authoritative OPEN route on the current Pareto frontier.";
  const secondaryReason = "This is another evidence-qualified authoritative OPEN nondominated route retained as an independent execution alternative.";

  const strategy: CieR5ChannelStrategy = Object.freeze({
    schemaVersion: "g5-channel-strategy/v1",
    promptVersion: "cie-r5-route-authority/v2",
    primary: routeDecision(chosen[0], primaryReason, commitment),
    secondary: chosen[1] ? routeDecision(chosen[1], secondaryReason, commitment) : null,
    fallback: chosen[2] ? routeDecision(chosen[2], secondaryReason, commitment) : null,
    sequenceRationale: tie
      ? "Execute the canonical member of the nondominated evidence-qualified OPEN frontier first. Remaining frontier members are preserved as alternatives; the sequence is operational, not a weighted commercial ranking."
      : "Use the uniquely evidence-qualified OPEN Pareto route first.",
    primaryWhyNow: whyNow,
    alternativesNotFirst: selected.slice(3).map((routeId) => ({ routeId, reason: "Also on the authoritative OPEN Pareto frontier but outside the three-slot execution compatibility envelope." })),
    // Compatibility field required by the G5 strategy contract. It is categorical telemetry only.
    channelConfidence: 100,
    limitations: Object.freeze([
      `CIE-R5 graph robustness: ${assessment.robustnessClass}.`,
      `Route evidence semantics: ${GENESIS_T8_CIE_R5_ROUTE_EVIDENCE_SEMANTICS}.`,
      ...(tie ? ["Multiple nondominated OPEN routes exist; no scalar score was used to claim one is commercially superior."] : []),
    ]),
  });

  return Object.freeze({
    authorityMode: GENESIS_T8_CIE_R5_AUTHORITY_MODE,
    evidenceSemanticsVersion: GENESIS_T8_CIE_R5_ROUTE_EVIDENCE_SEMANTICS,
    strategy,
    graphAssessment: assessment,
    selectedRouteIds: Object.freeze(selected),
    routeStates: routes,
  });
}

export const GENESIS_T8_CIE_R5_ROUTE_LAWS = Object.freeze([
  "CIE_R5_IS_THE_SOLE_LIVE_ROUTE_AUTHORITY",
  "AI_MAY_PROPOSE_ROUTE_FACTS_AND_EVIDENCE_BUT_MAY_NOT_SCORE_RANK_OR_LABEL_ROUTE_VIABILITY",
  "LEGACY_IS_VIABLE_IS_PRIMARY_ROUTE_QUALITY_AND_CONFIDENCE_ARE_FORBIDDEN_AUTHORITY_INPUTS",
  "A_CONCRETE_CHANNEL_VALUE_MUST_BE_SUPPORTED_BY_QUALIFYING_EVIDENCE_BEFORE_A_ROUTE_IS_OPEN",
  "OPEN_PATHS_CATEGORICALLY_PRECEDE_UNRESOLVED_AND_BLOCKED_PATHS",
  "THE_PARETO_FRONTIER_IS_THE_COMMERCIAL_ROUTE_DECISION",
  "CANONICAL_TIE_BREAKS_AMONG_MATHEMATICALLY_EQUIVALENT_FRONTIER_ROUTES_ARE_OPERATIONAL_NOT_COMMERCIAL_RANKS",
  "MISSING_OPEN_ROUTE_FAILS_CLOSED_AND_NEVER_FALLS_BACK_TO_AI_OR_LEGACY_SCORING",
] as const);
