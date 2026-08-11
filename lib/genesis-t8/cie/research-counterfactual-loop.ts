/**
 * CIE-R7 Research + Counterfactual Closed Loop.
 *
 * This layer does not perform research and does not invent interventions.
 * It converts exact governed repair contracts into CE2-R6 research priorities,
 * and evaluates only explicitly authorised intervention effects through CE2-R8.
 */
import {
  buildEpistemicProfile,
  type GenesisT8EpistemicAssessmentInput,
  type GenesisT8EpistemicProfile,
} from "../ce2-evolution/epistemic-mathematics";
import {
  buildResearchPlan,
  type GenesisT8ResearchEvaluationInput,
  type GenesisT8ResearchPlan,
  type GenesisT8ResearchPriority,
} from "../ce2-evolution/research-calculus";
import {
  evaluateCounterfactualDecision,
  type GenesisT8CounterfactualAssessment,
  type GenesisT8CounterfactualCondition,
  type GenesisT8CounterfactualIntervention,
  type GenesisT8CounterfactualSearchLimits,
} from "../ce2-evolution/counterfactual-decision-calculus";
import type { GenesisT8RealityDecisionStateAssessment } from "../ce2-evolution/reality-state-machine";
import type { GenesisT8MultidimensionalStability } from "../ce2-evolution/multidimensional-stability";

export const GENESIS_T8_CIE_R7_VERSION = "1.0.0" as const;
export const GENESIS_T8_CIE_R7_BUILD = "CIE-R7" as const;
export const GENESIS_T8_CIE_R7_RESEARCH_AUTHORITY_MODE = "AUTHORITATIVE" as const;
export const GENESIS_T8_CIE_R7_RECOURSE_AUTHORITY_MODE = "ADVISORY" as const;

export type CieR7RepairMode =
  | "DISCOVER_MISSING_CLAIM"
  | "ADD_CORROBORATING_EVIDENCE"
  | "REFRESH_STALE_EVIDENCE"
  | "RESOLVE_LOW_CONFIDENCE"
  | "RESOLVE_CONTRADICTION";

export type CieR7RepairCandidate = Readonly<{
  repairId: string;
  claimId: string;
  claimKey: string;
  semanticQuestionKey: string;
  repairMode: CieR7RepairMode;
  blockingMode: "NON_BLOCKING" | "BLOCKING_BEFORE_USE";
  knownMonetaryCostUsd: number | null;
  knownDurationMs: number | null;
}>;

export type CieR7ResearchDirective = Readonly<{
  authorityMode: "AUTHORITATIVE";
  realityId: string;
  repairId: string;
  claimId: string;
  claimKey: string;
  impactClass: GenesisT8ResearchPriority["impactClass"];
  impactPrecedence: number;
  orderIndex: number;
  dispatchRequired: boolean;
  deterministicReasons: readonly string[];
}>;

export type CieR7ResearchLoop = Readonly<{
  authorityMode: "AUTHORITATIVE";
  realityId: string;
  researchRequired: boolean;
  nextRepairId: string | null;
  plan: GenesisT8ResearchPlan;
  directives: readonly CieR7ResearchDirective[];
}>;

export type CieR7CounterfactualLoop = Readonly<{
  authorityMode: "ADVISORY";
  assessment: GenesisT8CounterfactualAssessment;
  mayMutateReality: false;
  mayCreateEvidence: false;
}>;

function canonical(value: string, code: string): string {
  if (typeof value !== "string" || !value.trim() || value !== value.trim()) throw new Error(`GENESIS_T8_CIE_R7_VIOLATION:${code}`);
  return value;
}

function epistemicInputFor(candidate: CieR7RepairCandidate): GenesisT8EpistemicAssessmentInput {
  const knowledgeId = canonical(candidate.claimId, "CLAIM_ID");
  switch (candidate.repairMode) {
    case "DISCOVER_MISSING_CLAIM":
      return { knowledgeId, vector: { presence: "MISSING", verification: "NOT_APPLICABLE", resolution: "NOT_APPLICABLE", contradiction: "NOT_APPLICABLE", temporalValidity: "NOT_APPLICABLE" } };
    case "REFRESH_STALE_EVIDENCE":
      return { knowledgeId, vector: { presence: "PRESENT", verification: "VERIFIED", resolution: "UNKNOWN", contradiction: "CONSISTENT", temporalValidity: "EXPIRED" } };
    case "RESOLVE_CONTRADICTION":
      return { knowledgeId, vector: { presence: "PRESENT", verification: "VERIFIED", resolution: "UNCERTAIN", contradiction: "CONTRADICTORY", temporalValidity: "CURRENT" } };
    case "RESOLVE_LOW_CONFIDENCE":
      return { knowledgeId, vector: { presence: "PRESENT", verification: "VERIFIED", resolution: "UNCERTAIN", contradiction: "CONSISTENT", temporalValidity: "CURRENT" } };
    case "ADD_CORROBORATING_EVIDENCE":
      return { knowledgeId, vector: { presence: "PRESENT", verification: "UNVERIFIED", resolution: "UNKNOWN", contradiction: "CONSISTENT", temporalValidity: "CURRENT" } };
  }
}

function decisionFromRepairs(realityId: string, candidates: readonly CieR7RepairCandidate[]): GenesisT8RealityDecisionStateAssessment {
  const critical = candidates.filter((x) => x.blockingMode === "BLOCKING_BEFORE_USE").map((x) => x.claimId).sort();
  const contradictory = candidates.filter((x) => x.blockingMode === "BLOCKING_BEFORE_USE" && x.repairMode === "RESOLVE_CONTRADICTION").map((x) => x.claimId).sort();
  const uncertain = candidates.filter((x) => x.blockingMode === "BLOCKING_BEFORE_USE" && x.repairMode === "RESOLVE_LOW_CONFIDENCE").map((x) => x.claimId).sort();
  const blocking = critical.filter((id) => !contradictory.includes(id) && !uncertain.includes(id));
  const state = contradictory.length ? "CONTESTED" : blocking.length ? "UNRESOLVED" : uncertain.length ? "POSSIBLE" : "ESTABLISHED";
  return Object.freeze({
    realityId,
    state,
    reason: state === "CONTESTED" ? "DECISION_CRITICAL_KNOWLEDGE_CONTRADICTORY" : state === "UNRESOLVED" ? "DECISION_CRITICAL_KNOWLEDGE_UNRESOLVED" : state === "POSSIBLE" ? "DECISION_CRITICAL_KNOWLEDGE_UNCERTAIN" : "COMMERCIAL_REALITY_ESTABLISHED",
    timePressure: "NONE",
    decisionCriticalKnowledgeIds: Object.freeze(critical),
    blockingKnowledgeIds: Object.freeze(blocking),
    contradictoryKnowledgeIds: Object.freeze(contradictory),
    uncertainKnowledgeIds: Object.freeze(uncertain),
    establishedKnowledgeIds: Object.freeze([]),
    deterministicReasons: Object.freeze(["CIE_R7_DECISION_TRACE_DERIVED_FROM_EXACT_GOVERNED_REPAIR_CONTRACTS"]),
  }) as GenesisT8RealityDecisionStateAssessment;
}

export function buildCieR7ResearchLoop(input: {
  realityId: string;
  repairs: readonly CieR7RepairCandidate[];
  stability: GenesisT8MultidimensionalStability;
}): CieR7ResearchLoop {
  const realityId = canonical(input.realityId, "REALITY_ID");
  if (!input.repairs.length) throw new Error("GENESIS_T8_CIE_R7_VIOLATION:EMPTY_REPAIR_SET");
  const ids = input.repairs.map((x) => canonical(x.repairId, "REPAIR_ID"));
  if (new Set(ids).size !== ids.length) throw new Error("GENESIS_T8_CIE_R7_VIOLATION:DUPLICATE_REPAIR_ID");

  const epistemic: GenesisT8EpistemicProfile = buildEpistemicProfile(input.repairs.map(epistemicInputFor));
  const decision = decisionFromRepairs(realityId, input.repairs);
  const evaluations: GenesisT8ResearchEvaluationInput[] = input.repairs.map((candidate) => ({
    question: {
      researchId: candidate.repairId,
      knowledgeId: candidate.claimId,
      semanticQuestionKey: canonical(candidate.semanticQuestionKey, "SEMANTIC_QUESTION_KEY"),
      relatedConstraintIds: Object.freeze([]),
      relatedDimensions: Object.freeze([]),
      referencedTokenIds: Object.freeze([]),
      referencedRelationshipIds: Object.freeze([]),
    },
    epistemic,
    decision,
    stability: input.stability,
    knownCost: { monetaryUsd: candidate.knownMonetaryCostUsd, durationMs: candidate.knownDurationMs },
  }));
  const plan = buildResearchPlan(evaluations);
  const byRepair = new Map(input.repairs.map((x) => [x.repairId, x] as const));
  const directives = Object.freeze(plan.ordered.map((priority, index) => {
    const repair = byRepair.get(priority.researchId);
    if (!repair) throw new Error("GENESIS_T8_CIE_R7_VIOLATION:PLAN_REPAIR_MISMATCH");
    return Object.freeze({
      authorityMode: GENESIS_T8_CIE_R7_RESEARCH_AUTHORITY_MODE,
      realityId,
      repairId: repair.repairId,
      claimId: repair.claimId,
      claimKey: repair.claimKey,
      impactClass: priority.impactClass,
      impactPrecedence: priority.impactPrecedence,
      orderIndex: index,
      dispatchRequired: priority.impactClass !== "NO_DECISION_VALUE",
      deterministicReasons: Object.freeze([...priority.deterministicReasons, "EXISTING_G8_REPAIR_QUEUE_REMAINS_EXECUTION_OWNER"]),
    });
  }));
  return Object.freeze({ authorityMode: GENESIS_T8_CIE_R7_RESEARCH_AUTHORITY_MODE, realityId, researchRequired: plan.researchRequired, nextRepairId: plan.next?.researchId ?? null, plan, directives });
}

export function buildCieR7CounterfactualLoop(input: {
  realityId: string;
  targetKey: string;
  conditions: readonly GenesisT8CounterfactualCondition[];
  interventions: readonly GenesisT8CounterfactualIntervention[];
  limits: GenesisT8CounterfactualSearchLimits;
}): CieR7CounterfactualLoop {
  const assessment = evaluateCounterfactualDecision({
    realityId: canonical(input.realityId, "REALITY_ID"),
    targetKey: canonical(input.targetKey, "TARGET_KEY"),
    conditions: input.conditions,
    interventions: input.interventions,
    limits: input.limits,
  });
  return Object.freeze({ authorityMode: GENESIS_T8_CIE_R7_RECOURSE_AUTHORITY_MODE, assessment, mayMutateReality: false, mayCreateEvidence: false });
}

export const GENESIS_T8_CIE_R7_LAWS = Object.freeze([
  "RESEARCH_PRIORITY_IS_OWNED_BY_CE2_R6_AND_EXECUTION_REMAINS_WITH_EXISTING_G8_REPAIR_WORKERS",
  "EXACT_REPAIR_CONTRACTS_ARE_REPRIORITISED_NOT_WIDENED",
  "BLOCKING_DECISION_VALUE_PRECEDES_NON_BLOCKING_RESEARCH",
  "RESEARCH_COMPLETION_MUST_REENTER_TRUTH_AND_RECOMPUTE_COMMERCIAL_REALITY",
  "STALE_DIRECTIVES_HAVE_NO_AUTHORITY_AFTER_THE_GOVERNING_REPAIR_OR_DECISION_STATE_CHANGES",
  "COUNTERFACTUAL_RECOURSE_CONSUMES_ONLY_EXPLICIT_AUTHORISED_INTERVENTION_EFFECTS",
  "COUNTERFACTUAL_PLANS_ARE_ADVISORY_AND_CANNOT_MUTATE_REALITY_OR_CREATE_EVIDENCE",
  "NO_AI_SCORE_WEIGHT_OR_LEGACY_RESEARCH_PRIORITY_MAY_OVERRIDE_CIE_R7_RESEARCH_AUTHORITY",
] as const);
