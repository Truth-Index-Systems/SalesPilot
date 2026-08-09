/**
 * Genesis T8 CE-R2 R7 — Explainable Commercial Reasoning.
 *
 * R7 does not invent a new conclusion. It deterministically projects the
 * already-computed R3-R6 state into an auditable reasoning trace. AI may render
 * this trace into natural language, but may not alter any mathematical state.
 */
import type { GenesisT8AIConstraintContract } from "./constraints";
import { assertCommercialRealityPropagationInvariant, type GenesisT8CommercialRealityPropagation } from "./constraint-propagation";
import { assertOpportunityCandidateInvariant, assertOpportunityOrderStateInvariant, type GenesisT8OpportunityCandidate, type GenesisT8OpportunityOrderState } from "./opportunity-mathematics";
import type { GenesisT8ResearchSelection } from "./research-intelligence";

export const GENESIS_T8_EXPLAINABLE_REASONING_VERSION = "1.0.0" as const;
export const GENESIS_T8_CE_R2_R7_BUILD = "R7-BUILD1" as const;

export const GENESIS_T8_CONSTRAINT_EXPLANATION_ROLES = Object.freeze([
  "ELIMINATING_BOUNDARY",
  "UNRESOLVED_BOUNDARY",
  "NEAREST_FAILURE_BOUNDARY",
  "SUPPORTING",
  "LIMITING",
  "CONTRADICTORY",
  "UNKNOWN",
  "NEUTRAL",
] as const);
export type GenesisT8ConstraintExplanationRole = (typeof GENESIS_T8_CONSTRAINT_EXPLANATION_ROLES)[number];

export type GenesisT8ConstraintExplanationTrace = Readonly<{
  constraintId: string;
  constraintClass: GenesisT8AIConstraintContract["constraintClass"];
  applicability: GenesisT8AIConstraintContract["applicability"];
  role: GenesisT8ConstraintExplanationRole;
  referencedTokenIds: readonly string[];
  referencedRelationshipIds: readonly string[];
  evidenceIds: readonly string[];
  effectiveSupportStrength: number;
  effectiveLimitingPressure: number;
  effectiveBoundaryEliminationSupport: number;
  effectiveBoundarySurvivalSupport: number;
  relevantContradictionUncertainty: number;
  effectiveKnowledgeDeficit: number;
  incomingDependencyIds: readonly string[];
}>;

export type GenesisT8OpportunityExplanationTrace = Readonly<{
  opportunityId: string;
  targetEntityId: string;
  viability: GenesisT8CommercialRealityPropagation["viability"];
  realisationState: GenesisT8OpportunityCandidate["realisation"]["state"];
  rank: number;
  commercialCoherence: number;
  commercialStability: number;
  constraintPressure: number;
  knowledgeSufficiency: number;
  reasoningConfidence: number;
  commercialStrength: number;
  decisionAssurance: number;
  opportunityRobustness: number;
  contactState: GenesisT8OpportunityCandidate["realisation"]["contactState"];
  routeState: GenesisT8OpportunityCandidate["realisation"]["routeState"];
  routeTargetMode: GenesisT8OpportunityCandidate["realisation"]["routeTargetMode"];
  realisationReasonCode: GenesisT8OpportunityCandidate["realisation"]["reasonCode"];
  eliminatingConstraintIds: readonly string[];
  unresolvedBoundaryConstraintIds: readonly string[];
  nearestFailureBoundaryConstraintIds: readonly string[];
  supportingConstraintIds: readonly string[];
  limitingConstraintIds: readonly string[];
  contradictoryConstraintIds: readonly string[];
  unknownConstraintIds: readonly string[];
  constraintTraces: readonly GenesisT8ConstraintExplanationTrace[];
  nextResearch?: Readonly<{
    researchId: string;
    semanticQuestionKey: string;
    impactClass: string;
    reasonCode: string;
  }>;
}>;

export type GenesisT8AIExplanationEnvelope = Readonly<{
  contractVersion: typeof GENESIS_T8_EXPLAINABLE_REASONING_VERSION;
  instruction: "EXPLAIN_TRACE_ONLY";
  trace: GenesisT8OpportunityExplanationTrace;
  forbiddenMutations: readonly [
    "VIABILITY",
    "REALISATION_STATE",
    "RANK",
    "MATHEMATICAL_VALUES",
    "CONSTRAINT_ROLES",
    "RESEARCH_PRIORITY"
  ];
}>;

const EPSILON = 1e-12;
const isPositive = (value: number): boolean => Number.isFinite(value) && value > EPSILON;

function sortedUnique(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values)].sort((a, b) => a.localeCompare(b)));
}

function roleForConstraint(
  constraintId: string,
  contract: GenesisT8AIConstraintContract,
  propagation: GenesisT8CommercialRealityPropagation,
  nearest: ReadonlySet<string>,
): GenesisT8ConstraintExplanationRole {
  const state = propagation.states.find((item) => item.constraintId === constraintId);
  if (!state) throw new Error("GENESIS_T8_CE_R2_R7_VIOLATION:PROPAGATED_STATE_MISSING");
  if (propagation.eliminatingConstraintIds.includes(constraintId)) return "ELIMINATING_BOUNDARY";
  if (propagation.unresolvedBoundaryConstraintIds.includes(constraintId)) return "UNRESOLVED_BOUNDARY";
  if (nearest.has(constraintId)) return "NEAREST_FAILURE_BOUNDARY";
  if (isPositive(state.relevantContradictionUncertainty)) return "CONTRADICTORY";
  if (isPositive(state.effectiveLimitingPressure)) return "LIMITING";
  if (isPositive(state.effectiveSupportStrength) || isPositive(state.effectiveBoundarySurvivalSupport)) return "SUPPORTING";
  if (isPositive(state.effectiveKnowledgeDeficit) || contract.constraintClass === "UNKNOWN" || contract.applicability === "UNRESOLVED") return "UNKNOWN";
  return "NEUTRAL";
}

export function assertExplanationInputsInvariant(
  opportunity: GenesisT8OpportunityCandidate,
  orderState: GenesisT8OpportunityOrderState,
  propagation: GenesisT8CommercialRealityPropagation,
  contracts: readonly GenesisT8AIConstraintContract[],
): void {
  assertOpportunityCandidateInvariant(opportunity);
  assertOpportunityOrderStateInvariant(opportunity, orderState);
  assertCommercialRealityPropagationInvariant(propagation);
  if (orderState.opportunityId !== opportunity.opportunityId || orderState.targetEntityId !== opportunity.targetEntityId) {
    throw new Error("GENESIS_T8_CE_R2_R7_VIOLATION:ORDER_IDENTITY_MISMATCH");
  }
  if (opportunity.realisation.commercial.viability !== propagation.viability) {
    throw new Error("GENESIS_T8_CE_R2_R7_VIOLATION:VIABILITY_MISMATCH");
  }
  if (orderState.realisationState !== opportunity.realisation.state) {
    throw new Error("GENESIS_T8_CE_R2_R7_VIOLATION:REALISATION_MISMATCH");
  }
  const propagatedIds = new Set(propagation.states.map((state) => state.constraintId));
  const contractIds = new Set<string>();
  for (const contract of contracts) {
    if (!contract.constraintId?.trim()) throw new Error("GENESIS_T8_CE_R2_R7_VIOLATION:CONSTRAINT_ID");
    if (contractIds.has(contract.constraintId)) throw new Error("GENESIS_T8_CE_R2_R7_VIOLATION:DUPLICATE_CONSTRAINT_CONTRACT");
    contractIds.add(contract.constraintId);
    if (!propagatedIds.has(contract.constraintId)) throw new Error("GENESIS_T8_CE_R2_R7_VIOLATION:CONTRACT_NOT_PROPAGATED");
  }
  if (contractIds.size !== propagatedIds.size) throw new Error("GENESIS_T8_CE_R2_R7_VIOLATION:INCOMPLETE_CONSTRAINT_TRACE");
}

export function buildOpportunityExplanationTrace(
  opportunity: GenesisT8OpportunityCandidate,
  orderState: GenesisT8OpportunityOrderState,
  propagation: GenesisT8CommercialRealityPropagation,
  contracts: readonly GenesisT8AIConstraintContract[],
  research?: GenesisT8ResearchSelection,
): GenesisT8OpportunityExplanationTrace {
  assertExplanationInputsInvariant(opportunity, orderState, propagation, contracts);
  if (research && (research.opportunityId !== opportunity.opportunityId || research.targetEntityId !== opportunity.targetEntityId)) {
    throw new Error("GENESIS_T8_CE_R2_R7_VIOLATION:RESEARCH_IDENTITY_MISMATCH");
  }

  const contractById = new Map(contracts.map((contract) => [contract.constraintId, contract]));
  const nearest = new Set(opportunity.realisation.commercial.nearestFailureBoundaryConstraintIds);
  const traces = propagation.states.map((state) => {
    const contract = contractById.get(state.constraintId)!;
    return Object.freeze({
      constraintId: state.constraintId,
      constraintClass: contract.constraintClass,
      applicability: contract.applicability,
      role: roleForConstraint(state.constraintId, contract, propagation, nearest),
      referencedTokenIds: sortedUnique([...contract.canonicalSubjectTokenIds, ...contract.canonicalTargetTokenIds]),
      referencedRelationshipIds: sortedUnique(contract.canonicalRelationshipIds),
      evidenceIds: sortedUnique(contract.evidenceIds),
      effectiveSupportStrength: state.effectiveSupportStrength,
      effectiveLimitingPressure: state.effectiveLimitingPressure,
      effectiveBoundaryEliminationSupport: state.effectiveBoundaryEliminationSupport,
      effectiveBoundarySurvivalSupport: state.effectiveBoundarySurvivalSupport,
      relevantContradictionUncertainty: state.relevantContradictionUncertainty,
      effectiveKnowledgeDeficit: state.effectiveKnowledgeDeficit,
      incomingDependencyIds: sortedUnique(state.incomingDependencyIds),
    });
  });

  const idsByRole = (role: GenesisT8ConstraintExplanationRole): readonly string[] =>
    Object.freeze(traces.filter((trace) => trace.role === role).map((trace) => trace.constraintId).sort((a, b) => a.localeCompare(b)));

  const commercial = opportunity.realisation.commercial;
  return Object.freeze({
    opportunityId: opportunity.opportunityId,
    targetEntityId: opportunity.targetEntityId,
    viability: propagation.viability,
    realisationState: opportunity.realisation.state,
    rank: orderState.rank,
    commercialCoherence: commercial.commercialCoherence,
    commercialStability: commercial.commercialStability,
    constraintPressure: commercial.constraintPressure,
    knowledgeSufficiency: commercial.knowledgeSufficiency,
    reasoningConfidence: commercial.reasoningConfidence,
    commercialStrength: orderState.commercialStrength,
    decisionAssurance: orderState.decisionAssurance,
    opportunityRobustness: orderState.opportunityRobustness,
    contactState: opportunity.realisation.contactState,
    routeState: opportunity.realisation.routeState,
    routeTargetMode: opportunity.realisation.routeTargetMode,
    realisationReasonCode: opportunity.realisation.reasonCode,
    eliminatingConstraintIds: sortedUnique(propagation.eliminatingConstraintIds),
    unresolvedBoundaryConstraintIds: sortedUnique(propagation.unresolvedBoundaryConstraintIds),
    nearestFailureBoundaryConstraintIds: sortedUnique(commercial.nearestFailureBoundaryConstraintIds),
    supportingConstraintIds: idsByRole("SUPPORTING"),
    limitingConstraintIds: idsByRole("LIMITING"),
    contradictoryConstraintIds: idsByRole("CONTRADICTORY"),
    unknownConstraintIds: idsByRole("UNKNOWN"),
    constraintTraces: Object.freeze(traces),
    nextResearch: research?.next ? Object.freeze({
      researchId: research.next.researchId,
      semanticQuestionKey: research.next.semanticQuestionKey,
      impactClass: research.next.impactClass,
      reasonCode: research.next.reasonCode,
    }) : undefined,
  });
}

export function createAIExplanationEnvelope(trace: GenesisT8OpportunityExplanationTrace): GenesisT8AIExplanationEnvelope {
  return Object.freeze({
    contractVersion: GENESIS_T8_EXPLAINABLE_REASONING_VERSION,
    instruction: "EXPLAIN_TRACE_ONLY",
    trace,
    forbiddenMutations: Object.freeze([
      "VIABILITY",
      "REALISATION_STATE",
      "RANK",
      "MATHEMATICAL_VALUES",
      "CONSTRAINT_ROLES",
      "RESEARCH_PRIORITY",
    ] as const),
  });
}

export const GENESIS_T8_R7_LAWS = Object.freeze([
  "R7_EXPLAINS_EXISTING_DETERMINISTIC_STATE_AND_NEVER_CREATES_A_NEW_CONCLUSION",
  "EVERY_EXPLAINED_CONSTRAINT_IS_TRACEABLE_TO_CANONICAL_TOKENS_RELATIONSHIPS_AND_EVIDENCE",
  "AI_MAY_RENDER_LANGUAGE_BUT_MAY_NOT_CHANGE_VIABILITY_REALISATION_RANK_OR_MATHEMATICAL_VALUES",
  "ELIMINATION_AND_UNRESOLVED_BOUNDARIES_ARE_EXPLICITLY_IDENTIFIED",
  "COMMERCIAL_SUPPORT_LIMITATION_CONTRADICTION_AND_UNKNOWNNESS_REMAIN_SEPARATE_CHANNELS",
  "CONTACT_AND_ROUTE_EXPLAIN_REALISATION_AND_NEVER_REWRITE_COMMERCIAL_VIABILITY",
  "RESEARCH_EXPLANATION_MUST_USE_THE_R6_SELECTED_NEXT_UNKNOWN_WITHOUT_REPRIORITISATION",
  "TRACE_ORDER_IS_DETERMINISTIC_AND_COMPLETE_FOR_ALL_PROPAGATED_CONSTRAINTS",
  "NARRATIVE_LANGUAGE_IS_NON_AUTHORITATIVE_PRESENTATION_OVER_THE_TRACE",
] as const);
