/**
 * Genesis T8 CE-R2 R6 — Research Intelligence.
 *
 * R6 chooses the single unresolved fact whose resolution would most improve
 * the current commercial decision. It does not interpret semantics, invent
 * research questions, or alter commercial fit. AI supplies canonical research
 * candidates; R6 orders them deterministically by decision impact and unresolved
 * information already present in R3/R4 state.
 */
import { assertCommercialRealityPropagationInvariant, type GenesisT8CommercialRealityPropagation } from "./constraint-propagation";
import { assertOpportunityCandidateInvariant, type GenesisT8OpportunityCandidate } from "./opportunity-mathematics";

export const GENESIS_T8_RESEARCH_INTELLIGENCE_VERSION = "1.0.0" as const;
export const GENESIS_T8_CE_R2_R6_BUILD = "R6-BUILD1" as const;

export const GENESIS_T8_RESEARCH_CANDIDATE_KINDS = Object.freeze([
  "CONSTRAINT",
  "CONTRADICTION",
  "CONTACT",
  "ROUTE",
] as const);
export type GenesisT8ResearchCandidateKind = (typeof GENESIS_T8_RESEARCH_CANDIDATE_KINDS)[number];

/** AI owns the semantics of what to research. No numeric importance is allowed. */
export type GenesisT8ResearchCandidate = Readonly<{
  researchId: string;
  kind: GenesisT8ResearchCandidateKind;
  semanticQuestionKey: string;
  constraintId?: string;
  referencedTokenIds: readonly string[];
  referencedRelationshipIds: readonly string[];
}>;

export const GENESIS_T8_RESEARCH_IMPACT_CLASSES = Object.freeze([
  "NO_DECISION_VALUE",
  "ASSURANCE_GAP",
  "STABILITY_PIVOTAL",
  "REALISATION_PIVOTAL",
  "VIABILITY_PIVOTAL",
] as const);
export type GenesisT8ResearchImpactClass = (typeof GENESIS_T8_RESEARCH_IMPACT_CLASSES)[number];

export const GENESIS_T8_RESEARCH_IMPACT_PRECEDENCE = Object.freeze({
  NO_DECISION_VALUE: 0,
  ASSURANCE_GAP: 1,
  STABILITY_PIVOTAL: 2,
  REALISATION_PIVOTAL: 3,
  VIABILITY_PIVOTAL: 4,
} satisfies Readonly<Record<GenesisT8ResearchImpactClass, number>>);

export type GenesisT8ResearchPriorityState = Readonly<{
  researchId: string;
  semanticQuestionKey: string;
  kind: GenesisT8ResearchCandidateKind;
  constraintId?: string;
  impactClass: GenesisT8ResearchImpactClass;
  impactPrecedence: number;
  unresolvedMass: number;
  nearestFailureBoundary: boolean;
  reasonCode:
    | "UNRESOLVED_BOUNDARY_CAN_CHANGE_VIABILITY"
    | "CONTACT_CAN_CHANGE_REALISATION"
    | "ROUTE_CAN_CHANGE_REALISATION"
    | "NEAREST_BOUNDARY_HAS_UNRESOLVED_KNOWLEDGE"
    | "ACTIVE_CONSTRAINT_HAS_KNOWLEDGE_DEFICIT"
    | "ACTIVE_CONTRADICTION_REMAINS_UNRESOLVED"
    | "DECISION_ALREADY_RESOLVED_OR_RESEARCH_NOT_APPLICABLE";
}>;

export type GenesisT8ResearchSelection = Readonly<{
  opportunityId: string;
  targetEntityId: string;
  next?: GenesisT8ResearchPriorityState;
  orderedCandidates: readonly GenesisT8ResearchPriorityState[];
  researchRequired: boolean;
}>;

export type GenesisT8PortfolioResearchSelection = Readonly<{
  next?: Readonly<GenesisT8ResearchPriorityState & { opportunityId: string; targetEntityId: string }>;
  researchRequired: boolean;
  opportunitySelections: readonly GenesisT8ResearchSelection[];
}>;

const EPSILON = 1e-12;
const clamp01 = (value: number): number => Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));

function assertUniqueNonBlank(values: readonly string[], code: string): void {
  if (!Array.isArray(values) || values.some((v) => typeof v !== "string" || !v.trim()) || new Set(values).size !== values.length) {
    throw new Error(`GENESIS_T8_CE_R2_R6_VIOLATION:${code}`);
  }
}

export function assertResearchCandidateInvariant(candidate: GenesisT8ResearchCandidate): void {
  if (!candidate.researchId?.trim()) throw new Error("GENESIS_T8_CE_R2_R6_VIOLATION:RESEARCH_ID");
  if (!GENESIS_T8_RESEARCH_CANDIDATE_KINDS.includes(candidate.kind)) throw new Error("GENESIS_T8_CE_R2_R6_VIOLATION:KIND");
  if (!candidate.semanticQuestionKey?.trim()) throw new Error("GENESIS_T8_CE_R2_R6_VIOLATION:SEMANTIC_QUESTION_KEY");
  if ((candidate.kind === "CONSTRAINT" || candidate.kind === "CONTRADICTION") && !candidate.constraintId?.trim()) {
    throw new Error("GENESIS_T8_CE_R2_R6_VIOLATION:CONSTRAINT_ID_REQUIRED");
  }
  if ((candidate.kind === "CONTACT" || candidate.kind === "ROUTE") && candidate.constraintId !== undefined) {
    throw new Error("GENESIS_T8_CE_R2_R6_VIOLATION:REALISATION_CANDIDATE_CONSTRAINT_ID");
  }
  assertUniqueNonBlank(candidate.referencedTokenIds, "TOKEN_REFERENCE_SET");
  assertUniqueNonBlank(candidate.referencedRelationshipIds, "RELATIONSHIP_REFERENCE_SET");
  for (const forbidden of ["weight", "score", "priority", "importance", "probability", "confidence", "expectedValue", "utility"]) {
    if (Object.prototype.hasOwnProperty.call(candidate as object, forbidden)) {
      throw new Error(`GENESIS_T8_CE_R2_R6_VIOLATION:AI_NUMERIC_RESEARCH_WEIGHT:${forbidden}`);
    }
  }
}

function propagatedStateById(propagation: GenesisT8CommercialRealityPropagation): Map<string, GenesisT8CommercialRealityPropagation["states"][number]> {
  return new Map(propagation.states.map((state) => [state.constraintId, state]));
}

/**
 * Research value is a lexicographic state, never a weighted sum:
 *   (decision-impact class, nearest-boundary relevance, unresolved information mass)
 * Higher categorical decision impact always wins. Numeric uncertainty is used
 * only inside the same decision class.
 */
export function evaluateResearchCandidate(
  opportunity: GenesisT8OpportunityCandidate,
  propagation: GenesisT8CommercialRealityPropagation,
  candidate: GenesisT8ResearchCandidate,
): GenesisT8ResearchPriorityState {
  assertOpportunityCandidateInvariant(opportunity);
  assertCommercialRealityPropagationInvariant(propagation);
  assertResearchCandidateInvariant(candidate);
  const states = propagatedStateById(propagation);
  const commercial = opportunity.realisation.commercial;
  const nearest = new Set(commercial.nearestFailureBoundaryConstraintIds);

  let impactClass: GenesisT8ResearchImpactClass = "NO_DECISION_VALUE";
  let unresolvedMass = 0;
  let reasonCode: GenesisT8ResearchPriorityState["reasonCode"] = "DECISION_ALREADY_RESOLVED_OR_RESEARCH_NOT_APPLICABLE";
  let nearestFailureBoundary = false;

  if (candidate.kind === "CONTACT") {
    const contactUnresolved = opportunity.realisation.contactState === "UNKNOWN" || opportunity.realisation.contactState === "INAPPROPRIATE";
    const personRoute = opportunity.realisation.routeTargetMode === "PERSON";
    if (commercial.viability === "SURVIVES" && personRoute && contactUnresolved) {
      impactClass = "REALISATION_PIVOTAL";
      unresolvedMass = 1;
      reasonCode = "CONTACT_CAN_CHANGE_REALISATION";
    }
  } else if (candidate.kind === "ROUTE") {
    const routeUnresolved = ["UNKNOWN", "WEAK", "BLOCKED"].includes(opportunity.realisation.routeState);
    if (commercial.viability === "SURVIVES" && routeUnresolved) {
      impactClass = "REALISATION_PIVOTAL";
      unresolvedMass = 1;
      reasonCode = "ROUTE_CAN_CHANGE_REALISATION";
    }
  } else {
    const state = states.get(candidate.constraintId!);
    if (!state) throw new Error("GENESIS_T8_CE_R2_R6_VIOLATION:CONSTRAINT_NOT_IN_PROPAGATION");
    nearestFailureBoundary = nearest.has(state.constraintId);

    if (candidate.kind === "CONTRADICTION") {
      unresolvedMass = clamp01(state.relevantContradictionUncertainty);
    } else {
      unresolvedMass = clamp01(state.effectiveKnowledgeDeficit);
    }

    if (propagation.unresolvedBoundaryConstraintIds.includes(state.constraintId) && unresolvedMass > EPSILON) {
      impactClass = "VIABILITY_PIVOTAL";
      reasonCode = "UNRESOLVED_BOUNDARY_CAN_CHANGE_VIABILITY";
    } else if (commercial.viability === "SURVIVES" && nearestFailureBoundary && unresolvedMass > EPSILON) {
      impactClass = "STABILITY_PIVOTAL";
      reasonCode = "NEAREST_BOUNDARY_HAS_UNRESOLVED_KNOWLEDGE";
    } else if (unresolvedMass > EPSILON && state.local.applicability !== "NOT_APPLICABLE") {
      impactClass = "ASSURANCE_GAP";
      reasonCode = candidate.kind === "CONTRADICTION"
        ? "ACTIVE_CONTRADICTION_REMAINS_UNRESOLVED"
        : "ACTIVE_CONSTRAINT_HAS_KNOWLEDGE_DEFICIT";
    }
  }

  return Object.freeze({
    researchId: candidate.researchId,
    semanticQuestionKey: candidate.semanticQuestionKey,
    kind: candidate.kind,
    constraintId: candidate.constraintId,
    impactClass,
    impactPrecedence: GENESIS_T8_RESEARCH_IMPACT_PRECEDENCE[impactClass],
    unresolvedMass,
    nearestFailureBoundary,
    reasonCode,
  });
}

function comparePriority(a: GenesisT8ResearchPriorityState, b: GenesisT8ResearchPriorityState): number {
  if (a.impactPrecedence !== b.impactPrecedence) return b.impactPrecedence - a.impactPrecedence;
  if (a.nearestFailureBoundary !== b.nearestFailureBoundary) return a.nearestFailureBoundary ? -1 : 1;
  if (Math.abs(a.unresolvedMass - b.unresolvedMass) > EPSILON) return b.unresolvedMass - a.unresolvedMass;
  return a.researchId.localeCompare(b.researchId);
}

export function selectNextResearchForOpportunity(
  opportunity: GenesisT8OpportunityCandidate,
  propagation: GenesisT8CommercialRealityPropagation,
  candidates: readonly GenesisT8ResearchCandidate[],
): GenesisT8ResearchSelection {
  const ids = new Set<string>();
  const questions = new Set<string>();
  for (const candidate of candidates) {
    assertResearchCandidateInvariant(candidate);
    if (ids.has(candidate.researchId)) throw new Error("GENESIS_T8_CE_R2_R6_VIOLATION:DUPLICATE_RESEARCH_ID");
    ids.add(candidate.researchId);
    // Same semantic unknown should not be researched twice under different IDs.
    if (questions.has(candidate.semanticQuestionKey)) throw new Error("GENESIS_T8_CE_R2_R6_VIOLATION:DUPLICATE_SEMANTIC_QUESTION");
    questions.add(candidate.semanticQuestionKey);
  }

  const orderedCandidates = Object.freeze(candidates
    .map((candidate) => evaluateResearchCandidate(opportunity, propagation, candidate))
    .sort(comparePriority));
  const next = orderedCandidates.find((candidate) => candidate.impactClass !== "NO_DECISION_VALUE");
  return Object.freeze({
    opportunityId: opportunity.opportunityId,
    targetEntityId: opportunity.targetEntityId,
    next,
    orderedCandidates,
    researchRequired: Boolean(next),
  });
}

/**
 * Across a portfolio, choose one next research action. Opportunity order from R5
 * is respected categorically before comparing R6 research vectors, so research
 * spend is concentrated on the highest-ranked unresolved commercial realities.
 */
export function selectNextPortfolioResearch(
  orderedOpportunities: readonly GenesisT8OpportunityCandidate[],
  propagationsByOpportunityId: ReadonlyMap<string, GenesisT8CommercialRealityPropagation>,
  candidatesByOpportunityId: ReadonlyMap<string, readonly GenesisT8ResearchCandidate[]>,
): GenesisT8PortfolioResearchSelection {
  const opportunitySelections: GenesisT8ResearchSelection[] = [];
  for (const opportunity of orderedOpportunities) {
    const propagation = propagationsByOpportunityId.get(opportunity.opportunityId);
    if (!propagation) throw new Error("GENESIS_T8_CE_R2_R6_VIOLATION:PROPAGATION_MISSING");
    const candidates = candidatesByOpportunityId.get(opportunity.opportunityId) ?? [];
    opportunitySelections.push(selectNextResearchForOpportunity(opportunity, propagation, candidates));
  }

  const rankedNext = opportunitySelections
    .map((selection, rankIndex) => selection.next ? ({ selection, rankIndex, next: selection.next }) : undefined)
    .filter((item): item is { selection: GenesisT8ResearchSelection; rankIndex: number; next: GenesisT8ResearchPriorityState } => Boolean(item))
    .sort((a, b) => {
      const priority = comparePriority(a.next, b.next);
      if (priority !== 0) return priority;
      // Current R5 order is a deterministic tie-break only inside the same
      // research-impact class/vector; it may never outrank decision impact.
      if (a.rankIndex !== b.rankIndex) return a.rankIndex - b.rankIndex;
      return a.selection.opportunityId.localeCompare(b.selection.opportunityId);
    });

  const chosen = rankedNext[0];
  if (chosen) {
    return Object.freeze({
      next: Object.freeze({ ...chosen.next, opportunityId: chosen.selection.opportunityId, targetEntityId: chosen.selection.targetEntityId }),
      researchRequired: true,
      opportunitySelections: Object.freeze(opportunitySelections),
    });
  }
  return Object.freeze({ researchRequired: false, opportunitySelections: Object.freeze(opportunitySelections) });
}

export const GENESIS_T8_R6_LAWS = Object.freeze([
  "RESEARCH_RESOLVES_DECISION_UNCERTAINTY_AND_NEVER_CHANGES_FIT_DIRECTLY",
  "AI_OWNS_THE_SEMANTIC_RESEARCH_QUESTION_BUT_NOT_ITS_PRIORITY_WEIGHT",
  "RESEARCH_VALUE_IS_LEXICOGRAPHIC_NOT_A_WEIGHTED_EXPECTED_VALUE_SCORE",
  "VIABILITY_PIVOTAL_UNKNOWN_PRECEDES_REALISATION_PIVOTAL_UNKNOWN",
  "REALISATION_PIVOTAL_UNKNOWN_PRECEDES_STABILITY_AND_ASSURANCE_GAPS",
  "UNKNOWN_INFORMATION_NEVER_COUNTS_AS_NEGATIVE_COMMERCIAL_EVIDENCE",
  "TI_CONTRADICTION_MAGNITUDE_IS_CONSUMED_WITHOUT_REINTERPRETATION",
  "DEFINITIVE_NOT_VIABLE_REALITIES_DO_NOT_RECEIVE_SPECULATIVE_RESEARCH_PRIORITY",
  "DUPLICATE_SEMANTIC_RESEARCH_QUESTIONS_CANNOT_MULTIPLY_PRIORITY",
  "THE_SINGLE_NEXT_RESEARCH_TARGET_IS_DETERMINISTIC",
  "PORTFOLIO_RESEARCH_IMPACT_CLASS_PRECEDES_CURRENT_R5_RANK",
  "CURRENT_R5_RANK_BREAKS_TIES_ONLY_INSIDE_EQUAL_RESEARCH_PRIORITY",
] as const);
