/**
 * Genesis T8 CE2 Evolution R5 — Multidimensional Commercial Stability.
 *
 * Research-led additive evolution over frozen CE-R2 v1 and CE2 R1-R4.
 * R5 formalises commercial stability as distance from failure across the
 * already-canonical CE-R1 commercial dimensions. It combines:
 *   - robust optimisation's worst-case safety floor;
 *   - lexicographic maximin to distinguish equal weakest-axis realities
 *     without weighted compensation;
 *   - viability theory as a deferred dynamic extension, not simulated here.
 *
 * No AI-authored numeric weights, probability, hidden thresholds, opportunity
 * ranking, temporal decay or invented perturbation envelopes are permitted.
 */
import type { GenesisT8CoherenceConstraintContext } from "../mathematics/commercial-coherence";
import type { GenesisT8PropagatedConstraintState } from "../mathematics/constraint-propagation";
import type { GenesisT8CommercialRealityPropagation } from "../mathematics/constraint-propagation";
import { assertCommercialRealityPropagationInvariant } from "../mathematics/constraint-propagation";

export const GENESIS_T8_CE2_EVOLUTION_R5_VERSION = "1.0.0" as const;
export const GENESIS_T8_CE2_EVOLUTION_R5_BUILD = "CE2-R5" as const;

export const GENESIS_T8_STABILITY_DIMENSIONS = Object.freeze([
  "SEMANTIC",
  "STRUCTURAL",
  "OPERATIONAL",
  "COMMERCIAL",
  "TECHNOLOGICAL",
  "STRATEGIC",
] as const);
export type GenesisT8StabilityDimension = (typeof GENESIS_T8_STABILITY_DIMENSIONS)[number];

export type GenesisT8DimensionStabilityState = Readonly<{
  dimension: GenesisT8StabilityDimension;
  margin: number;
  restrictiveConstraintIds: readonly string[];
  criticalConstraintIds: readonly string[];
}>;

export type GenesisT8MultidimensionalStability = Readonly<{
  viability: GenesisT8CommercialRealityPropagation["viability"];
  /** Robust-optimisation safety floor: the weakest active dimension margin. */
  globalStabilityFloor: number;
  /** Ascending margins. Compare lexicographically; never sum or average. */
  lexicographicProfile: readonly number[];
  dimensions: readonly GenesisT8DimensionStabilityState[];
  criticalDimensions: readonly GenesisT8StabilityDimension[];
  deterministicReasons: readonly string[];
}>;

const EPSILON = 1e-12;
const clamp01 = (value: number): number => Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));

function canonicalContexts(contexts: readonly GenesisT8CoherenceConstraintContext[]): ReadonlyMap<string, GenesisT8CoherenceConstraintContext> {
  const map = new Map<string, GenesisT8CoherenceConstraintContext>();
  for (const context of contexts) {
    if (!context.constraintId?.trim()) throw new Error("GENESIS_T8_CE2_R5_VIOLATION:CONSTRAINT_ID");
    if (map.has(context.constraintId)) throw new Error("GENESIS_T8_CE2_R5_VIOLATION:DUPLICATE_CONSTRAINT_CONTEXT");
    if (context.dimensions.some((dimension) => !(GENESIS_T8_STABILITY_DIMENSIONS as readonly string[]).includes(dimension))) {
      throw new Error("GENESIS_T8_CE2_R5_VIOLATION:NON_STABILITY_DIMENSION");
    }
    map.set(context.constraintId, context);
  }
  return map;
}

/**
 * Distance-to-failure contribution for one restrictive constraint.
 * Supporting evidence cannot manufacture resilience and unknownness remains
 * epistemic (R2/R4), not a commercial stability penalty.
 */
export function restrictiveConstraintMargin(state: GenesisT8PropagatedConstraintState): number | null {
  if (state.local.applicability === "NOT_APPLICABLE") return null;
  switch (state.local.constraintClass) {
    case "BOUNDARY":
      return clamp01(state.effectiveBoundarySurvivalSupport - state.effectiveBoundaryEliminationSupport - state.relevantContradictionUncertainty);
    case "LIMITING":
      return clamp01(1 - state.effectiveLimitingPressure - state.relevantContradictionUncertainty);
    case "CONTRADICTORY":
      return clamp01(1 - state.relevantContradictionUncertainty);
    case "SUPPORTING":
    case "UNKNOWN":
      return null;
  }
}

export function evaluateMultidimensionalStability(
  propagation: GenesisT8CommercialRealityPropagation,
  contexts: readonly GenesisT8CoherenceConstraintContext[],
): GenesisT8MultidimensionalStability {
  assertCommercialRealityPropagationInvariant(propagation);
  const byContext = canonicalContexts(contexts);
  const stateIds = new Set(propagation.states.map((state) => state.constraintId));
  for (const id of byContext.keys()) if (!stateIds.has(id)) throw new Error(`GENESIS_T8_CE2_R5_VIOLATION:CONTEXT_WITHOUT_PROPAGATED_STATE:${id}`);

  const dimensions: GenesisT8DimensionStabilityState[] = [];
  for (const dimension of GENESIS_T8_STABILITY_DIMENSIONS) {
    const entries = propagation.states
      .filter((state) => byContext.get(state.constraintId)?.dimensions.includes(dimension))
      .map((state) => ({ id: state.constraintId, margin: restrictiveConstraintMargin(state) }))
      .filter((entry): entry is { id: string; margin: number } => entry.margin !== null)
      .sort((a, b) => a.id.localeCompare(b.id));

    // No active restrictive constraint on an existing canonical dimension means
    // no demonstrated commercial pressure on that axis. Epistemic absence is
    // governed separately by R2/R4 and is never silently converted to strength.
    const margin = entries.length ? Math.min(...entries.map((entry) => entry.margin)) : 1;
    const criticalConstraintIds = entries
      .filter((entry) => Math.abs(entry.margin - margin) <= EPSILON)
      .map((entry) => entry.id)
      .sort((a, b) => a.localeCompare(b));

    dimensions.push(Object.freeze({
      dimension,
      margin: propagation.viability === "ELIMINATED" ? 0 : margin,
      restrictiveConstraintIds: Object.freeze(entries.map((entry) => entry.id)),
      criticalConstraintIds: Object.freeze(criticalConstraintIds),
    }));
  }

  const globalStabilityFloor = propagation.viability === "SURVIVES"
    ? Math.min(...dimensions.map((item) => item.margin))
    : 0;
  const criticalDimensions = Object.freeze(dimensions
    .filter((item) => Math.abs(item.margin - globalStabilityFloor) <= EPSILON)
    .map((item) => item.dimension)
    .sort((a, b) => a.localeCompare(b)));
  const lexicographicProfile = Object.freeze(dimensions.map((item) => item.margin).sort((a, b) => a - b));

  return Object.freeze({
    viability: propagation.viability,
    globalStabilityFloor,
    lexicographicProfile,
    dimensions: Object.freeze(dimensions),
    criticalDimensions,
    deterministicReasons: Object.freeze([
      `VIABILITY:${propagation.viability}`,
      `GLOBAL_STABILITY_FLOOR:${globalStabilityFloor}`,
      `LEXICOGRAPHIC_PROFILE:${lexicographicProfile.join(",")}`,
      `CRITICAL_DIMENSIONS:${criticalDimensions.join(",") || "NONE"}`,
    ]),
  });
}

/**
 * Lexicographic maximin comparison.
 * Returns 1 when A is more stable, -1 when B is more stable, 0 for equality.
 * Weakest margins are compared first, then second-weakest, etc. No strong axis
 * can compensate for a weaker earlier axis.
 */
export function compareStabilityLexicographically(
  a: GenesisT8MultidimensionalStability,
  b: GenesisT8MultidimensionalStability,
): -1 | 0 | 1 {
  if (a.viability !== b.viability) {
    const precedence: Record<GenesisT8CommercialRealityPropagation["viability"], number> = { ELIMINATED: 0, UNRESOLVED: 1, SURVIVES: 2 };
    return precedence[a.viability] > precedence[b.viability] ? 1 : -1;
  }
  if (a.lexicographicProfile.length !== b.lexicographicProfile.length) throw new Error("GENESIS_T8_CE2_R5_VIOLATION:PROFILE_LENGTH_MISMATCH");
  for (let i = 0; i < a.lexicographicProfile.length; i += 1) {
    if (a.lexicographicProfile[i] > b.lexicographicProfile[i] + EPSILON) return 1;
    if (b.lexicographicProfile[i] > a.lexicographicProfile[i] + EPSILON) return -1;
  }
  return 0;
}

export const GENESIS_T8_CE2_R5_STABILITY_LAWS = Object.freeze([
  "STABILITY_MEANS_DISTANCE_FROM_COMMERCIAL_FAILURE_NOT_AVERAGE_HEALTH",
  "FROZEN_CE_R2_BOUNDARY_AND_PRESSURE_MATHEMATICS_REMAIN_AUTHORITATIVE_INPUTS",
  "ROBUST_WORST_CASE_MARGIN_IS_THE_GLOBAL_STABILITY_FLOOR",
  "LEXICOGRAPHIC_MAXIMIN_REFINES_EQUAL_WEAKEST_AXIS_CASES_WITHOUT_COMPENSATION",
  "STRONG_DIMENSIONS_CANNOT_OFFSET_A_WEAKER_EARLIER_DIMENSION",
  "SUPPORTING_EVIDENCE_CANNOT_MANUFACTURE_STABILITY",
  "UNKNOWNNESS_IS_EPISTEMIC_AND_CANNOT_BE_SILENTLY_CONVERTED_TO_COMMERCIAL_PRESSURE",
  "STABILITY_DIMENSIONS_REUSE_EXISTING_CE_R1_CANONICAL_COMMERCIAL_DIMENSIONS",
  "TRUTH_TEMPORAL_AND_RELATIONAL_AXES_ARE_NOT_REINVENTED_AS_R5_COMMERCIAL_WEIGHTS",
  "VIABILITY_KERNEL_DYNAMICS_ARE_DEFERRED_UNTIL_ADMISSIBLE_PERTURBATIONS_AND_ACTIONS_EXIST",
  "NO_WEIGHTED_AVERAGE_SCORE_PROBABILITY_OR_HIDDEN_THRESHOLD_IS_PERMITTED",
  "CE2_R5_DOES_NOT_RANK_OPPORTUNITIES_ROUTES_CONTACTS_OR_RESEARCH",
] as const);
