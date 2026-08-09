/**
 * Genesis T8 CE-R2 R5 — Opportunity Mathematics.
 *
 * R5 orders already-evaluated commercial realities without a weighted lead score.
 * The ordering law is categorical realisation -> Pareto frontier -> maximin
 * robustness -> deterministic canonical tie-breaks.
 *
 * Semantics remain AI-owned. R5 consumes only R4 deterministic state.
 */
import type {
  GenesisT8OpportunityRealisation,
  GenesisT8OpportunityRealisationState,
} from "./commercial-coherence";

export const GENESIS_T8_OPPORTUNITY_MATHEMATICS_VERSION = "1.0.0" as const;
export const GENESIS_T8_CE_R2_R5_BUILD = "R5-BUILD1" as const;

export const GENESIS_T8_REALISATION_PRECEDENCE = Object.freeze({
  NOT_VIABLE: 0,
  COMMERCIAL_REALITY_UNRESOLVED: 1,
  STRANDED: 2,
  VIABLE_BUT_UNRESOLVED: 3,
  ACTIONABLE_WITHOUT_NAMED_CONTACT: 4,
  ACTIONABLE: 5,
} satisfies Readonly<Record<GenesisT8OpportunityRealisationState, number>>);

export type GenesisT8OpportunityCandidate = Readonly<{
  opportunityId: string;
  targetEntityId: string;
  realisation: GenesisT8OpportunityRealisation;
}>;

export type GenesisT8OpportunityOrderingVector = Readonly<{
  commercialCoherence: number;
  commercialStability: number;
  knowledgeSufficiency: number;
  reasoningConfidence: number;
  constraintHeadroom: number;
}>;

export type GenesisT8OpportunityOrderState = Readonly<{
  opportunityId: string;
  targetEntityId: string;
  realisationState: GenesisT8OpportunityRealisationState;
  realisationPrecedence: number;
  vector: GenesisT8OpportunityOrderingVector;
  commercialStrength: number;
  decisionAssurance: number;
  opportunityRobustness: number;
  paretoFront: number;
  rank: number;
}>;

export type GenesisT8OpportunityOrderingResult = Readonly<{
  ordered: readonly GenesisT8OpportunityOrderState[];
  actionableCount: number;
  unresolvedCount: number;
  strandedCount: number;
  notViableCount: number;
}>;

const EPSILON = 1e-12;
const clamp01 = (value: number): number => Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));

export function assertOpportunityCandidateInvariant(candidate: GenesisT8OpportunityCandidate): void {
  if (!candidate.opportunityId?.trim()) throw new Error("GENESIS_T8_CE_R2_R5_VIOLATION:OPPORTUNITY_ID");
  if (!candidate.targetEntityId?.trim()) throw new Error("GENESIS_T8_CE_R2_R5_VIOLATION:TARGET_ENTITY_ID");
  if (!candidate.realisation || !Object.prototype.hasOwnProperty.call(GENESIS_T8_REALISATION_PRECEDENCE, candidate.realisation.state)) {
    throw new Error("GENESIS_T8_CE_R2_R5_VIOLATION:REALISATION_STATE");
  }
  for (const forbidden of ["score", "weight", "priorityWeight", "rankingWeight", "probability", "importance"]) {
    if (Object.prototype.hasOwnProperty.call(candidate as object, forbidden)) {
      throw new Error(`GENESIS_T8_CE_R2_R5_VIOLATION:FORBIDDEN_WEIGHTED_SCORE:${forbidden}`);
    }
  }
}

export function opportunityOrderingVector(candidate: GenesisT8OpportunityCandidate): GenesisT8OpportunityOrderingVector {
  assertOpportunityCandidateInvariant(candidate);
  const commercial = candidate.realisation.commercial;
  return Object.freeze({
    commercialCoherence: clamp01(commercial.commercialCoherence),
    commercialStability: clamp01(commercial.commercialStability),
    knowledgeSufficiency: clamp01(commercial.knowledgeSufficiency),
    reasoningConfidence: clamp01(commercial.reasoningConfidence),
    constraintHeadroom: clamp01(1 - commercial.constraintPressure),
  });
}

/**
 * Opportunity strength is conservative: the weakest commercial reality axis
 * governs. Strong coherence cannot average away proximity to a boundary or
 * heavy active pressure.
 */
export function commercialStrength(vector: GenesisT8OpportunityOrderingVector): number {
  return Math.min(vector.commercialCoherence, vector.commercialStability, vector.constraintHeadroom);
}

/** Knowledge and reasoning confidence are epistemic, not commercial-fit axes. */
export function decisionAssurance(vector: GenesisT8OpportunityOrderingVector): number {
  return Math.min(vector.knowledgeSufficiency, vector.reasoningConfidence);
}

/**
 * Maximin robustness is the distance to the weakest decision-relevant axis.
 * It is deliberately not a mean and therefore cannot hide one severe weakness
 * behind several strong dimensions.
 */
export function opportunityRobustness(vector: GenesisT8OpportunityOrderingVector): number {
  return Math.min(commercialStrength(vector), decisionAssurance(vector));
}

/**
 * Pareto dominance is only meaningful inside the same categorical realisation
 * state. A candidate dominates another when it is no worse on every axis and
 * strictly better on at least one. No weights are introduced.
 */
export function paretoDominates(a: GenesisT8OpportunityOrderingVector, b: GenesisT8OpportunityOrderingVector): boolean {
  const av = [a.commercialCoherence, a.commercialStability, a.knowledgeSufficiency, a.reasoningConfidence, a.constraintHeadroom];
  const bv = [b.commercialCoherence, b.commercialStability, b.knowledgeSufficiency, b.reasoningConfidence, b.constraintHeadroom];
  const noWorse = av.every((value, index) => value + EPSILON >= bv[index]);
  const strictlyBetter = av.some((value, index) => value > bv[index] + EPSILON);
  return noWorse && strictlyBetter;
}

function computeParetoFronts(candidates: readonly GenesisT8OpportunityCandidate[]): Map<string, number> {
  const fronts = new Map<string, number>();
  const byState = new Map<GenesisT8OpportunityRealisationState, GenesisT8OpportunityCandidate[]>();
  for (const candidate of candidates) {
    const list = byState.get(candidate.realisation.state) ?? [];
    list.push(candidate);
    byState.set(candidate.realisation.state, list);
  }

  for (const group of byState.values()) {
    let remaining = [...group].sort((a, b) => a.opportunityId.localeCompare(b.opportunityId));
    let front = 1;
    while (remaining.length) {
      const vectors = new Map(remaining.map((candidate) => [candidate.opportunityId, opportunityOrderingVector(candidate)]));
      const current = remaining.filter((candidate) => !remaining.some((other) =>
        other.opportunityId !== candidate.opportunityId && paretoDominates(vectors.get(other.opportunityId)!, vectors.get(candidate.opportunityId)!),
      ));
      // Defensive fail-closed guard; mathematically a finite partial order must
      // always expose at least one non-dominated member.
      if (!current.length) throw new Error("GENESIS_T8_CE_R2_R5_VIOLATION:PARETO_FRONT_EMPTY");
      for (const candidate of current) fronts.set(candidate.opportunityId, front);
      const ids = new Set(current.map((candidate) => candidate.opportunityId));
      remaining = remaining.filter((candidate) => !ids.has(candidate.opportunityId));
      front += 1;
    }
  }
  return fronts;
}

export function orderOpportunities(candidates: readonly GenesisT8OpportunityCandidate[]): GenesisT8OpportunityOrderingResult {
  const seenOpportunityIds = new Set<string>();
  const seenTargets = new Set<string>();
  for (const candidate of candidates) {
    assertOpportunityCandidateInvariant(candidate);
    if (seenOpportunityIds.has(candidate.opportunityId)) throw new Error("GENESIS_T8_CE_R2_R5_VIOLATION:DUPLICATE_OPPORTUNITY_ID");
    if (seenTargets.has(candidate.targetEntityId)) throw new Error("GENESIS_T8_CE_R2_R5_VIOLATION:DUPLICATE_TARGET_ENTITY");
    seenOpportunityIds.add(candidate.opportunityId);
    seenTargets.add(candidate.targetEntityId);
  }

  const paretoFronts = computeParetoFronts(candidates);
  const states = candidates.map((candidate) => {
    const vector = opportunityOrderingVector(candidate);
    return {
      opportunityId: candidate.opportunityId,
      targetEntityId: candidate.targetEntityId,
      realisationState: candidate.realisation.state,
      realisationPrecedence: GENESIS_T8_REALISATION_PRECEDENCE[candidate.realisation.state],
      vector,
      commercialStrength: commercialStrength(vector),
      decisionAssurance: decisionAssurance(vector),
      opportunityRobustness: opportunityRobustness(vector),
      paretoFront: paretoFronts.get(candidate.opportunityId) ?? Number.MAX_SAFE_INTEGER,
    };
  });

  states.sort((a, b) => {
    // 1. Reality/actionability is categorical and cannot be compensated by fit.
    if (a.realisationPrecedence !== b.realisationPrecedence) return b.realisationPrecedence - a.realisationPrecedence;
    // 2. Within the same realisation state, prefer the non-dominated frontier.
    if (a.paretoFront !== b.paretoFront) return a.paretoFront - b.paretoFront;
    // 3. Among incomparable peers, maximise the weakest relevant axis.
    if (Math.abs(a.opportunityRobustness - b.opportunityRobustness) > EPSILON) return b.opportunityRobustness - a.opportunityRobustness;
    // 4. Preserve commercial reality over epistemic convenience when robustness ties.
    if (Math.abs(a.commercialStrength - b.commercialStrength) > EPSILON) return b.commercialStrength - a.commercialStrength;
    if (Math.abs(a.decisionAssurance - b.decisionAssurance) > EPSILON) return b.decisionAssurance - a.decisionAssurance;
    // 5. No further mathematical preference exists: canonical IDs provide reproducibility only.
    return a.opportunityId.localeCompare(b.opportunityId);
  });

  const ordered = states.map((state, index) => Object.freeze({ ...state, rank: index + 1 }));
  return Object.freeze({
    ordered: Object.freeze(ordered),
    actionableCount: candidates.filter((candidate) => candidate.realisation.state === "ACTIONABLE" || candidate.realisation.state === "ACTIONABLE_WITHOUT_NAMED_CONTACT").length,
    unresolvedCount: candidates.filter((candidate) => candidate.realisation.state === "VIABLE_BUT_UNRESOLVED" || candidate.realisation.state === "COMMERCIAL_REALITY_UNRESOLVED").length,
    strandedCount: candidates.filter((candidate) => candidate.realisation.state === "STRANDED").length,
    notViableCount: candidates.filter((candidate) => candidate.realisation.state === "NOT_VIABLE").length,
  });
}

/** MarketRoute may take the first N results; R5 itself contains no free-tier policy. */
export function topOrderedOpportunities(result: GenesisT8OpportunityOrderingResult, limit: number): readonly GenesisT8OpportunityOrderState[] {
  if (!Number.isInteger(limit) || limit < 0) throw new Error("GENESIS_T8_CE_R2_R5_VIOLATION:TOP_LIMIT");
  return Object.freeze(result.ordered.slice(0, limit));
}

export const GENESIS_T8_R5_LAWS = Object.freeze([
  "REALISATION_PRECEDES_COMMERCIAL_STRENGTH",
  "COMMERCIAL_IMPOSSIBILITY_CANNOT_BE_OUTRANKED_BY_REACHABILITY",
  "PARETO_DOMINANCE_PRECEDES_MAXIMIN_TIE_BREAKING",
  "WEAKEST_AXIS_GOVERNS_ROBUSTNESS",
  "KNOWLEDGE_IS_ASSURANCE_NOT_FIT",
  "NO_WEIGHTED_AVERAGE_OR_NUMERIC_ROUTE_CONTACT_SCORE",
  "CANONICAL_ID_BREAKS_TRUE_MATHEMATICAL_TIES_ONLY",
  "APPLICATION_FREE_TIER_POLICY_IS_NOT_PART_OF_MATHEMATICS",
] as const);
