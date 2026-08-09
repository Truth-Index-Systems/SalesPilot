/**
 * Genesis T8 CE-R2 R4 — Commercial Coherence + Opportunity Realisation.
 *
 * R4 composes the already-propagated R3 constraint state into bounded,
 * explainable commercial-state quantities without introducing arbitrary
 * commercial weights. Semantic grouping remains AI-owned; mathematics only
 * combines canonical groups deterministically.
 */
import type { GenesisT8CommercialDimension } from "../commercial-graph-9d";
import type {
  GenesisT8CommercialRealityPropagation,
  GenesisT8PropagatedConstraintState,
} from "./constraint-propagation";
import { assertCommercialRealityPropagationInvariant } from "./constraint-propagation";

export const GENESIS_T8_COMMERCIAL_COHERENCE_VERSION = "1.0.0" as const;
export const GENESIS_T8_CE_R2_R4_BUILD = "R4-BUILD1" as const;

export type GenesisT8CoherenceDimension = Exclude<GenesisT8CommercialDimension, "TRUTH" | "RELATIONAL" | "TEMPORAL">;

/**
 * AI owns only the semantic grouping and applicable dimensions. There are no
 * numeric weights. Multiple constraints in one reinforcement group are treated
 * as one commercial proposition family and therefore cannot double-count.
 */
export type GenesisT8CoherenceConstraintContext = Readonly<{
  constraintId: string;
  reinforcementGroupKey: string;
  dimensions: readonly GenesisT8CoherenceDimension[];
}>;

export type GenesisT8DimensionCoherenceState = Readonly<{
  dimension: GenesisT8CoherenceDimension;
  support: number;
  pressure: number;
  coherence: number;
  contributingConstraintIds: readonly string[];
}>;

export type GenesisT8CommercialKnowledgeChannels = Readonly<{
  /** Knowledge sufficient to resolve active viability boundaries. */
  viability: number;
  /** Knowledge sufficient to assess stability/pressure near active boundaries. */
  stability: number;
  /** Optional supporting/enrichment knowledge; never allowed to collapse decision assurance. */
  enrichment: number;
}>;

export type GenesisT8CommercialCoherenceState = Readonly<{
  viability: GenesisT8CommercialRealityPropagation["viability"];
  commercialCoherence: number;
  constraintPressure: number;
  commercialStability: number;
  /** Backward-compatible decision-relevant aggregate = min(viability, stability). */
  knowledgeSufficiency: number;
  knowledgeChannels: GenesisT8CommercialKnowledgeChannels;
  reasoningConfidence: number;
  dimensions: readonly GenesisT8DimensionCoherenceState[];
  nearestFailureBoundaryConstraintIds: readonly string[];
}>;

export const GENESIS_T8_CONTACT_STATES = Object.freeze([
  "APPROPRIATE",
  "PLAUSIBLE",
  "UNKNOWN",
  "INAPPROPRIATE",
] as const);
export type GenesisT8ContactState = (typeof GENESIS_T8_CONTACT_STATES)[number];

export const GENESIS_T8_ROUTE_STATES = Object.freeze([
  "DIRECT",
  "INDIRECT",
  "WEAK",
  "UNKNOWN",
  "BLOCKED",
] as const);
export type GenesisT8RouteState = (typeof GENESIS_T8_ROUTE_STATES)[number];

export const GENESIS_T8_ROUTE_TARGET_MODES = Object.freeze([
  "PERSON",
  "ORGANISATION",
  "INTERMEDIARY",
] as const);
export type GenesisT8RouteTargetMode = (typeof GENESIS_T8_ROUTE_TARGET_MODES)[number];

/**
 * These are interfaces to future Contact/Route engines. R4 does not discover
 * people or routes and does not allow AI-supplied numeric fit/weights.
 */
export type GenesisT8ContactRealisationInput = Readonly<{
  state: GenesisT8ContactState;
  contactEntityId?: string;
}>;

export type GenesisT8RouteRealisationInput = Readonly<{
  state: GenesisT8RouteState;
  targetMode: GenesisT8RouteTargetMode;
  routeEntityId?: string;
}>;

export const GENESIS_T8_OPPORTUNITY_REALISATION_STATES = Object.freeze([
  "NOT_VIABLE",
  "COMMERCIAL_REALITY_UNRESOLVED",
  "ACTIONABLE",
  "ACTIONABLE_WITHOUT_NAMED_CONTACT",
  "VIABLE_BUT_UNRESOLVED",
  "STRANDED",
] as const);
export type GenesisT8OpportunityRealisationState = (typeof GENESIS_T8_OPPORTUNITY_REALISATION_STATES)[number];

export type GenesisT8OpportunityRealisation = Readonly<{
  state: GenesisT8OpportunityRealisationState;
  commercial: GenesisT8CommercialCoherenceState;
  contactState: GenesisT8ContactState;
  routeState: GenesisT8RouteState;
  routeTargetMode: GenesisT8RouteTargetMode;
  actionable: boolean;
  reasonCode:
    | "COMMERCIAL_ELIMINATION"
    | "COMMERCIAL_UNRESOLVED"
    | "CONTACT_AND_ROUTE_AVAILABLE"
    | "ORGANISATIONAL_OR_INTERMEDIARY_ROUTE_AVAILABLE"
    | "CONTACT_OR_ROUTE_UNKNOWN"
    | "CONTACT_INAPPROPRIATE_FOR_PERSON_ROUTE"
    | "ROUTE_BLOCKED"
    | "ROUTE_TOO_WEAK";
}>;

const clamp01 = (value: number): number => Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
const EPSILON = 1e-12;

export function assertCoherenceContextInvariant(context: GenesisT8CoherenceConstraintContext): void {
  if (!context.constraintId?.trim()) throw new Error("GENESIS_T8_CE_R2_R4_VIOLATION:CONSTRAINT_ID");
  if (!context.reinforcementGroupKey?.trim()) throw new Error("GENESIS_T8_CE_R2_R4_VIOLATION:REINFORCEMENT_GROUP");
  if (!Array.isArray(context.dimensions) || new Set(context.dimensions).size !== context.dimensions.length) {
    throw new Error("GENESIS_T8_CE_R2_R4_VIOLATION:DIMENSION_SET");
  }
  const allowed: readonly string[] = ["SEMANTIC", "STRUCTURAL", "OPERATIONAL", "COMMERCIAL", "TECHNOLOGICAL", "STRATEGIC"];
  if (context.dimensions.some((dimension) => !allowed.includes(dimension))) {
    throw new Error("GENESIS_T8_CE_R2_R4_VIOLATION:DIMENSION");
  }
  for (const forbidden of ["weight", "importance", "score", "probability", "confidence", "multiplier"]) {
    if (Object.prototype.hasOwnProperty.call(context as object, forbidden)) {
      throw new Error(`GENESIS_T8_CE_R2_R4_VIOLATION:SEMANTIC_NUMERIC_WEIGHT:${forbidden}`);
    }
  }
}

export function assertContactRealisationInputInvariant(input: GenesisT8ContactRealisationInput): void {
  if (!GENESIS_T8_CONTACT_STATES.includes(input.state)) throw new Error("GENESIS_T8_CE_R2_R4_VIOLATION:CONTACT_STATE");
  if (input.contactEntityId !== undefined && !input.contactEntityId.trim()) throw new Error("GENESIS_T8_CE_R2_R4_VIOLATION:CONTACT_ID");
  for (const forbidden of ["score", "weight", "confidence", "probability", "fit"]) {
    if (Object.prototype.hasOwnProperty.call(input as object, forbidden)) throw new Error(`GENESIS_T8_CE_R2_R4_VIOLATION:CONTACT_NUMERIC_FIELD:${forbidden}`);
  }
}

export function assertRouteRealisationInputInvariant(input: GenesisT8RouteRealisationInput): void {
  if (!GENESIS_T8_ROUTE_STATES.includes(input.state)) throw new Error("GENESIS_T8_CE_R2_R4_VIOLATION:ROUTE_STATE");
  if (!GENESIS_T8_ROUTE_TARGET_MODES.includes(input.targetMode)) throw new Error("GENESIS_T8_CE_R2_R4_VIOLATION:ROUTE_TARGET_MODE");
  if (input.routeEntityId !== undefined && !input.routeEntityId.trim()) throw new Error("GENESIS_T8_CE_R2_R4_VIOLATION:ROUTE_ID");
  for (const forbidden of ["score", "weight", "confidence", "probability", "fit"]) {
    if (Object.prototype.hasOwnProperty.call(input as object, forbidden)) throw new Error(`GENESIS_T8_CE_R2_R4_VIOLATION:ROUTE_NUMERIC_FIELD:${forbidden}`);
  }
}

/**
 * Independent semantic groups compound with diminishing returns:
 *   R = 1 - product(1 - g_j)
 * Within one AI-defined semantic group we take max, never sum, so synonyms,
 * repeated evidence paths and related statements cannot manufacture force.
 */
export function reinforceIndependentGroups(groups: ReadonlyMap<string, readonly number[]>): number {
  if (groups.size === 0) return 0;
  let complement = 1;
  for (const values of [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, values]) => values)) {
    const groupStrength = values.length ? Math.max(...values.map(clamp01)) : 0;
    complement *= 1 - groupStrength;
  }
  return clamp01(1 - complement);
}

/** Constraint pressure composes independent restrictive channels, also bounded. */
export function composeConstraintPressure(limitingPressure: number, contradictionPressure: number): number {
  const l = clamp01(limitingPressure);
  const c = clamp01(contradictionPressure);
  return clamp01(1 - (1 - l) * (1 - c));
}

/**
 * Coherence exists only for a surviving reality. Positive commercial support is
 * discounted by restrictive pressure; pressure cannot create support.
 */
export function commercialCoherenceFromSupportAndPressure(support: number, pressure: number): number {
  return clamp01(clamp01(support) * (1 - clamp01(pressure)));
}

function minimumBoundaryMargin(states: readonly GenesisT8PropagatedConstraintState[]): Readonly<{ margin: number; ids: readonly string[] }> {
  const boundaries = states.filter((state) => state.local.constraintClass === "BOUNDARY" && state.local.applicability !== "NOT_APPLICABLE");
  if (!boundaries.length) return Object.freeze({ margin: 1, ids: Object.freeze([]) });
  const margins = boundaries.map((state) => ({
    id: state.constraintId,
    margin: clamp01(state.effectiveBoundarySurvivalSupport - state.effectiveBoundaryEliminationSupport - state.relevantContradictionUncertainty),
  }));
  const minimum = Math.min(...margins.map((item) => item.margin));
  return Object.freeze({
    margin: minimum,
    ids: Object.freeze(margins.filter((item) => Math.abs(item.margin - minimum) <= EPSILON).map((item) => item.id).sort((a, b) => a.localeCompare(b))),
  });
}

function minimumKnowledgeForClasses(
  states: readonly GenesisT8PropagatedConstraintState[],
  classes: ReadonlySet<string>,
): number {
  const relevant = states.filter((state) => state.local.applicability !== "NOT_APPLICABLE" && classes.has(state.local.constraintClass));
  if (!relevant.length) return 1;
  return Math.min(...relevant.map((state) => clamp01(1 - state.effectiveKnowledgeDeficit)));
}

function assertUnitInterval(value: number, code: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) throw new Error(`GENESIS_T8_CE_R2_R4_VIOLATION:${code}`);
}

export function assertCommercialCoherenceStateInvariant(state: GenesisT8CommercialCoherenceState): void {
  if (!["SURVIVES", "ELIMINATED", "UNRESOLVED"].includes(state.viability)) throw new Error("GENESIS_T8_CE_R2_R4_VIOLATION:COMMERCIAL_VIABILITY");
  for (const [code, value] of [
    ["COMMERCIAL_COHERENCE", state.commercialCoherence],
    ["CONSTRAINT_PRESSURE", state.constraintPressure],
    ["COMMERCIAL_STABILITY", state.commercialStability],
    ["KNOWLEDGE_SUFFICIENCY", state.knowledgeSufficiency],
    ["REASONING_CONFIDENCE", state.reasoningConfidence],
  ] as const) assertUnitInterval(value, code);
  // Pre-R8 persisted R4 snapshots may not contain the channel breakdown. They
  // remain readable if their aggregate is structurally valid; all newly
  // evaluated R8 states emit and validate the channels below.
  if (state.knowledgeChannels) {
    assertUnitInterval(state.knowledgeChannels.viability, "VIABILITY_KNOWLEDGE");
    assertUnitInterval(state.knowledgeChannels.stability, "STABILITY_KNOWLEDGE");
    assertUnitInterval(state.knowledgeChannels.enrichment, "ENRICHMENT_KNOWLEDGE");
    const expectedKnowledge = Math.min(state.knowledgeChannels.viability, state.knowledgeChannels.stability);
    if (Math.abs(state.knowledgeSufficiency - expectedKnowledge) > EPSILON) throw new Error("GENESIS_T8_CE_R2_R4_VIOLATION:KNOWLEDGE_AGGREGATE_MISMATCH");
  }
  if (state.viability !== "SURVIVES" && (state.commercialCoherence > EPSILON || state.commercialStability > EPSILON)) {
    throw new Error("GENESIS_T8_CE_R2_R4_VIOLATION:NON_SURVIVING_COMMERCIAL_FORCE");
  }
}

export function evaluateCommercialCoherence(
  propagation: GenesisT8CommercialRealityPropagation,
  contexts: readonly GenesisT8CoherenceConstraintContext[],
): GenesisT8CommercialCoherenceState {
  assertCommercialRealityPropagationInvariant(propagation);
  const stateById = new Map(propagation.states.map((state) => [state.constraintId, state]));
  const contextIds = new Set<string>();
  for (const context of contexts) {
    assertCoherenceContextInvariant(context);
    if (contextIds.has(context.constraintId)) throw new Error("GENESIS_T8_CE_R2_R4_VIOLATION:DUPLICATE_CONTEXT");
    contextIds.add(context.constraintId);
    if (!stateById.has(context.constraintId)) throw new Error("GENESIS_T8_CE_R2_R4_VIOLATION:CONTEXT_CONSTRAINT_MISSING");
  }

  const supportGroups = new Map<string, number[]>();
  const limitingGroups = new Map<string, number[]>();
  const contradictionGroups = new Map<string, number[]>();

  for (const context of contexts) {
    const state = stateById.get(context.constraintId)!;
    const positive = Math.max(state.effectiveSupportStrength, state.effectiveBoundarySurvivalSupport);
    supportGroups.set(context.reinforcementGroupKey, [...(supportGroups.get(context.reinforcementGroupKey) ?? []), positive]);
    limitingGroups.set(context.reinforcementGroupKey, [...(limitingGroups.get(context.reinforcementGroupKey) ?? []), state.effectiveLimitingPressure]);
    contradictionGroups.set(context.reinforcementGroupKey, [...(contradictionGroups.get(context.reinforcementGroupKey) ?? []), state.relevantContradictionUncertainty]);
  }

  const support = reinforceIndependentGroups(supportGroups);
  const limiting = reinforceIndependentGroups(limitingGroups);
  const contradiction = reinforceIndependentGroups(contradictionGroups);
  const pressure = composeConstraintPressure(limiting, contradiction);
  const coherence = propagation.viability === "SURVIVES" ? commercialCoherenceFromSupportAndPressure(support, pressure) : 0;
  const boundary = minimumBoundaryMargin(propagation.states);

  // Decision-local knowledge: optional supporting/enrichment unknowns never
  // collapse assurance about viability or stability.
  const viabilityKnowledge = minimumKnowledgeForClasses(propagation.states, new Set(["BOUNDARY"]));
  const stabilityKnowledge = minimumKnowledgeForClasses(propagation.states, new Set(["BOUNDARY", "LIMITING", "CONTRADICTORY"]));
  const enrichmentKnowledge = minimumKnowledgeForClasses(propagation.states, new Set(["SUPPORTING", "UNKNOWN"]));
  const knowledgeSufficiency = Math.min(viabilityKnowledge, stabilityKnowledge);
  const reasoningConfidence = propagation.viability === "UNRESOLVED"
    ? 0
    : clamp01(knowledgeSufficiency * (1 - contradiction));

  const dimensions: GenesisT8DimensionCoherenceState[] = [];
  const dimensionSet = new Set<GenesisT8CoherenceDimension>(contexts.flatMap((context) => [...context.dimensions]));
  for (const dimension of [...dimensionSet].sort((a, b) => a.localeCompare(b))) {
    const scoped = contexts.filter((context) => context.dimensions.includes(dimension));
    const sg = new Map<string, number[]>();
    const lg = new Map<string, number[]>();
    const cg = new Map<string, number[]>();
    for (const context of scoped) {
      const state = stateById.get(context.constraintId)!;
      sg.set(context.reinforcementGroupKey, [...(sg.get(context.reinforcementGroupKey) ?? []), Math.max(state.effectiveSupportStrength, state.effectiveBoundarySurvivalSupport)]);
      lg.set(context.reinforcementGroupKey, [...(lg.get(context.reinforcementGroupKey) ?? []), state.effectiveLimitingPressure]);
      cg.set(context.reinforcementGroupKey, [...(cg.get(context.reinforcementGroupKey) ?? []), state.relevantContradictionUncertainty]);
    }
    const ds = reinforceIndependentGroups(sg);
    const dp = composeConstraintPressure(reinforceIndependentGroups(lg), reinforceIndependentGroups(cg));
    dimensions.push(Object.freeze({
      dimension,
      support: ds,
      pressure: dp,
      coherence: propagation.viability === "SURVIVES" ? commercialCoherenceFromSupportAndPressure(ds, dp) : 0,
      contributingConstraintIds: Object.freeze(scoped.map((context) => context.constraintId).sort((a, b) => a.localeCompare(b))),
    }));
  }

  return Object.freeze({
    viability: propagation.viability,
    commercialCoherence: coherence,
    constraintPressure: pressure,
    commercialStability: propagation.viability === "SURVIVES" ? boundary.margin : 0,
    knowledgeSufficiency,
    knowledgeChannels: Object.freeze({ viability: viabilityKnowledge, stability: stabilityKnowledge, enrichment: enrichmentKnowledge }),
    reasoningConfidence,
    dimensions: Object.freeze(dimensions),
    nearestFailureBoundaryConstraintIds: boundary.ids,
  });
}

export function assertOpportunityRealisationInvariant(realisation: GenesisT8OpportunityRealisation): void {
  if (!GENESIS_T8_OPPORTUNITY_REALISATION_STATES.includes(realisation.state)) throw new Error("GENESIS_T8_CE_R2_R4_VIOLATION:REALISATION_STATE");
  assertCommercialCoherenceStateInvariant(realisation.commercial);
  if (!GENESIS_T8_CONTACT_STATES.includes(realisation.contactState)) throw new Error("GENESIS_T8_CE_R2_R4_VIOLATION:REALISATION_CONTACT_STATE");
  if (!GENESIS_T8_ROUTE_STATES.includes(realisation.routeState)) throw new Error("GENESIS_T8_CE_R2_R4_VIOLATION:REALISATION_ROUTE_STATE");
  if (!GENESIS_T8_ROUTE_TARGET_MODES.includes(realisation.routeTargetMode)) throw new Error("GENESIS_T8_CE_R2_R4_VIOLATION:REALISATION_ROUTE_TARGET");
  const actionableState = realisation.state === "ACTIONABLE" || realisation.state === "ACTIONABLE_WITHOUT_NAMED_CONTACT";
  if (realisation.actionable !== actionableState) throw new Error("GENESIS_T8_CE_R2_R4_VIOLATION:ACTIONABLE_FLAG_MISMATCH");
  if (realisation.commercial.viability === "ELIMINATED" && realisation.state !== "NOT_VIABLE") throw new Error("GENESIS_T8_CE_R2_R4_VIOLATION:ELIMINATED_REALISATION_MISMATCH");
  if (realisation.commercial.viability === "UNRESOLVED" && realisation.state !== "COMMERCIAL_REALITY_UNRESOLVED") throw new Error("GENESIS_T8_CE_R2_R4_VIOLATION:UNRESOLVED_REALISATION_MISMATCH");
  if (realisation.commercial.viability === "SURVIVES" && (realisation.state === "NOT_VIABLE" || realisation.state === "COMMERCIAL_REALITY_UNRESOLVED")) throw new Error("GENESIS_T8_CE_R2_R4_VIOLATION:SURVIVING_REALISATION_MISMATCH");
}

export function realisationKnowledgeSufficiency(realisation: GenesisT8OpportunityRealisation): number {
  if (realisation.commercial.viability !== "SURVIVES") return 0;
  if (realisation.routeState === "UNKNOWN" || realisation.routeState === "WEAK") return 0;
  if (realisation.routeTargetMode === "PERSON" && realisation.contactState === "UNKNOWN") return 0;
  return 1;
}

export function evaluateOpportunityRealisation(
  commercial: GenesisT8CommercialCoherenceState,
  contact: GenesisT8ContactRealisationInput,
  route: GenesisT8RouteRealisationInput,
): GenesisT8OpportunityRealisation {
  assertCommercialCoherenceStateInvariant(commercial);
  assertContactRealisationInputInvariant(contact);
  assertRouteRealisationInputInvariant(route);

  if (commercial.viability === "ELIMINATED") {
    return Object.freeze({ state: "NOT_VIABLE", commercial, contactState: contact.state, routeState: route.state, routeTargetMode: route.targetMode, actionable: false, reasonCode: "COMMERCIAL_ELIMINATION" });
  }
  if (commercial.viability === "UNRESOLVED") {
    return Object.freeze({ state: "COMMERCIAL_REALITY_UNRESOLVED", commercial, contactState: contact.state, routeState: route.state, routeTargetMode: route.targetMode, actionable: false, reasonCode: "COMMERCIAL_UNRESOLVED" });
  }
  if (route.state === "BLOCKED") {
    return Object.freeze({ state: "STRANDED", commercial, contactState: contact.state, routeState: route.state, routeTargetMode: route.targetMode, actionable: false, reasonCode: "ROUTE_BLOCKED" });
  }
  if (route.state === "WEAK") {
    return Object.freeze({ state: "VIABLE_BUT_UNRESOLVED", commercial, contactState: contact.state, routeState: route.state, routeTargetMode: route.targetMode, actionable: false, reasonCode: "ROUTE_TOO_WEAK" });
  }
  if (route.state === "UNKNOWN") {
    return Object.freeze({ state: "VIABLE_BUT_UNRESOLVED", commercial, contactState: contact.state, routeState: route.state, routeTargetMode: route.targetMode, actionable: false, reasonCode: "CONTACT_OR_ROUTE_UNKNOWN" });
  }
  if (route.targetMode !== "PERSON" && (route.state === "DIRECT" || route.state === "INDIRECT")) {
    return Object.freeze({ state: "ACTIONABLE_WITHOUT_NAMED_CONTACT", commercial, contactState: contact.state, routeState: route.state, routeTargetMode: route.targetMode, actionable: true, reasonCode: "ORGANISATIONAL_OR_INTERMEDIARY_ROUTE_AVAILABLE" });
  }
  if (contact.state === "INAPPROPRIATE") {
    return Object.freeze({ state: "STRANDED", commercial, contactState: contact.state, routeState: route.state, routeTargetMode: route.targetMode, actionable: false, reasonCode: "CONTACT_INAPPROPRIATE_FOR_PERSON_ROUTE" });
  }
  if (contact.state === "UNKNOWN") {
    return Object.freeze({ state: "VIABLE_BUT_UNRESOLVED", commercial, contactState: contact.state, routeState: route.state, routeTargetMode: route.targetMode, actionable: false, reasonCode: "CONTACT_OR_ROUTE_UNKNOWN" });
  }
  return Object.freeze({ state: "ACTIONABLE", commercial, contactState: contact.state, routeState: route.state, routeTargetMode: route.targetMode, actionable: true, reasonCode: "CONTACT_AND_ROUTE_AVAILABLE" });
}

export const GENESIS_T8_COMMERCIAL_COHERENCE_LAWS = Object.freeze([
  "COMMERCIAL_COHERENCE_IS_DERIVED_ONLY_AFTER_R3_VIABILITY",
  "ROUTE_AND_CONTACT_NEVER_RESCUE_COMMERCIAL_IMPOSSIBILITY",
  "ROUTE_AND_CONTACT_AFFECT_REALISATION_NOT_UNDERLYING_COMMERCIAL_COHERENCE",
  "AI_OWNS_REINFORCEMENT_GROUP_SEMANTICS_BUT_NEVER_NUMERIC_WEIGHTS",
  "WITHIN_GROUP_DUPLICATION_USES_MAX_NOT_SUM",
  "INDEPENDENT_GROUPS_REINFORCE_WITH_BOUNDED_DIMINISHING_RETURNS",
  "SUPPORT_CANNOT_EXCEED_ONE_AND_PRESSURE_CANNOT_CREATE_SUPPORT",
  "COMMERCIAL_STABILITY_IS_DISTANCE_TO_NEAREST_ACTIVE_BOUNDARY",
  "KNOWLEDGE_SUFFICIENCY_IS_DECISION_LOCAL_AND_REMAINS_ORTHOGONAL_TO_COMMERCIAL_FIT",
  "OPTIONAL_SUPPORTING_UNKNOWNS_AFFECT_ENRICHMENT_NOT_VIABILITY_ASSURANCE",
  "CONTACT_AND_ROUTE_INTERFACES_ARE_CATEGORICAL_UNTIL_THEIR_OWN_ENGINES_DEFINE_MATHEMATICS",
  "ORGANISATIONAL_AND_INTERMEDIARY_ROUTES_MAY_BE_ACTIONABLE_WITHOUT_A_NAMED_CONTACT",
] as const);
