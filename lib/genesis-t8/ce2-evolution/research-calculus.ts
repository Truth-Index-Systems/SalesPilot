/**
 * Genesis T8 CE2 Evolution R6 — Deterministic Research Calculus.
 *
 * Research-led additive evolution over frozen CE-R2 v1 and CE2 R1-R5.
 * R6 adopts the decision-theoretic principle behind Value of Information:
 * information is valuable because it can improve a decision. It deliberately
 * does not calculate expected utility, Bayesian information gain, entropy, or
 * probability-weighted value because CE2 does not own the required utilities or
 * outcome probabilities. Instead it orders research lexicographically by known
 * decision effect, then stability relevance, then explicit known acquisition cost.
 *
 * AI may propose/canonicalise the semantic research question only. It may not
 * assign impact class, cost, numeric priority, probability, utility, entropy or
 * information value.
 */
import type { GenesisT8EpistemicAssessment, GenesisT8EpistemicProfile } from "./epistemic-mathematics";
import type { GenesisT8RealityDecisionStateAssessment } from "./reality-state-machine";
import type { GenesisT8MultidimensionalStability, GenesisT8StabilityDimension } from "./multidimensional-stability";

export const GENESIS_T8_CE2_EVOLUTION_R6_VERSION = "1.0.0" as const;
export const GENESIS_T8_CE2_EVOLUTION_R6_BUILD = "CE2-R6" as const;

export const GENESIS_T8_RESEARCH_DECISION_IMPACT_CLASSES = Object.freeze([
  "NO_DECISION_VALUE",
  "ENRICHMENT",
  "ASSURANCE_RELEVANT",
  "STABILITY_RELEVANT",
  "DECISION_SHARPENING",
  "DECISION_BLOCKING",
] as const);
export type GenesisT8ResearchDecisionImpactClass = (typeof GENESIS_T8_RESEARCH_DECISION_IMPACT_CLASSES)[number];

export const GENESIS_T8_RESEARCH_DECISION_IMPACT_PRECEDENCE = Object.freeze({
  NO_DECISION_VALUE: 0,
  ENRICHMENT: 1,
  ASSURANCE_RELEVANT: 2,
  STABILITY_RELEVANT: 3,
  DECISION_SHARPENING: 4,
  DECISION_BLOCKING: 5,
} satisfies Readonly<Record<GenesisT8ResearchDecisionImpactClass, number>>);

export type GenesisT8ResearchCost = Readonly<{
  /** Known direct monetary acquisition cost. null means not known; it is never guessed. */
  monetaryUsd: number | null;
  /** Known acquisition duration in milliseconds. null means not known; it is never guessed. */
  durationMs: number | null;
}>;

/** Semantic proposal. No AI-authored numeric importance fields are permitted. */
export type GenesisT8ResearchQuestion = Readonly<{
  researchId: string;
  knowledgeId: string;
  semanticQuestionKey: string;
  relatedConstraintIds: readonly string[];
  relatedDimensions: readonly GenesisT8StabilityDimension[];
  referencedTokenIds: readonly string[];
  referencedRelationshipIds: readonly string[];
}>;

export type GenesisT8ResearchEvaluationInput = Readonly<{
  question: GenesisT8ResearchQuestion;
  epistemic: GenesisT8EpistemicProfile;
  decision: GenesisT8RealityDecisionStateAssessment;
  stability: GenesisT8MultidimensionalStability;
  /** Cost comes from an external deterministic accounting/operations boundary. */
  knownCost: GenesisT8ResearchCost;
}>;

export type GenesisT8ResearchPriority = Readonly<{
  researchId: string;
  knowledgeId: string;
  semanticQuestionKey: string;
  impactClass: GenesisT8ResearchDecisionImpactClass;
  impactPrecedence: number;
  researchDisposition: GenesisT8EpistemicAssessment["researchDisposition"];
  decisionCritical: boolean;
  blocking: boolean;
  contradictory: boolean;
  uncertain: boolean;
  criticalStabilityDimension: boolean;
  criticalDimensionCount: number;
  relatedDimensions: readonly GenesisT8StabilityDimension[];
  knownCost: GenesisT8ResearchCost;
  deterministicReasons: readonly string[];
}>;

export type GenesisT8ResearchPlan = Readonly<{
  realityId: string;
  researchRequired: boolean;
  next: GenesisT8ResearchPriority | null;
  ordered: readonly GenesisT8ResearchPriority[];
}>;

const canonicalId = (value: string, code: string): string => {
  if (typeof value !== "string" || !value.trim() || value !== value.trim()) throw new Error(`GENESIS_T8_CE2_R6_VIOLATION:${code}`);
  return value;
};

function uniqueSorted(values: readonly string[], code: string): readonly string[] {
  const copy = values.map((value) => canonicalId(value, code));
  if (new Set(copy).size !== copy.length) throw new Error(`GENESIS_T8_CE2_R6_VIOLATION:DUPLICATE_${code}`);
  return Object.freeze(copy.sort((a, b) => a.localeCompare(b)));
}

function canonicalDimensions(values: readonly GenesisT8StabilityDimension[]): readonly GenesisT8StabilityDimension[] {
  const allowed = new Set<string>(["SEMANTIC", "STRUCTURAL", "OPERATIONAL", "COMMERCIAL", "TECHNOLOGICAL", "STRATEGIC"]);
  const copy = values.map((value) => {
    if (!allowed.has(value)) throw new Error("GENESIS_T8_CE2_R6_VIOLATION:STABILITY_DIMENSION");
    return value;
  });
  if (new Set(copy).size !== copy.length) throw new Error("GENESIS_T8_CE2_R6_VIOLATION:DUPLICATE_STABILITY_DIMENSION");
  return Object.freeze([...copy].sort((a, b) => a.localeCompare(b)));
}

export function assertResearchQuestionInvariant(question: GenesisT8ResearchQuestion): void {
  canonicalId(question.researchId, "RESEARCH_ID");
  canonicalId(question.knowledgeId, "KNOWLEDGE_ID");
  canonicalId(question.semanticQuestionKey, "SEMANTIC_QUESTION_KEY");
  uniqueSorted(question.relatedConstraintIds, "RELATED_CONSTRAINT_ID");
  canonicalDimensions(question.relatedDimensions);
  uniqueSorted(question.referencedTokenIds, "TOKEN_ID");
  uniqueSorted(question.referencedRelationshipIds, "RELATIONSHIP_ID");
  for (const forbidden of ["weight", "score", "priority", "importance", "probability", "confidence", "expectedValue", "expectedUtility", "utility", "entropy", "informationGain", "valueOfInformation", "costUsd"]) {
    if (Object.prototype.hasOwnProperty.call(question as object, forbidden)) {
      throw new Error(`GENESIS_T8_CE2_R6_VIOLATION:AI_RESEARCH_AUTHORITY_LEAK:${forbidden}`);
    }
  }
}

export function assertResearchCostInvariant(cost: GenesisT8ResearchCost): void {
  if (cost.monetaryUsd !== null && (!Number.isFinite(cost.monetaryUsd) || cost.monetaryUsd < 0)) throw new Error("GENESIS_T8_CE2_R6_VIOLATION:MONETARY_COST");
  if (cost.durationMs !== null && (!Number.isFinite(cost.durationMs) || cost.durationMs < 0 || !Number.isInteger(cost.durationMs))) throw new Error("GENESIS_T8_CE2_R6_VIOLATION:DURATION_COST");
}

function assessmentById(profile: GenesisT8EpistemicProfile, knowledgeId: string): GenesisT8EpistemicAssessment {
  const matches = profile.assessments.filter((assessment) => assessment.knowledgeId === knowledgeId);
  if (matches.length !== 1) throw new Error(`GENESIS_T8_CE2_R6_VIOLATION:KNOWLEDGE_ASSESSMENT_NOT_UNIQUE:${knowledgeId}`);
  return matches[0];
}

function intersects<T extends string>(a: readonly T[], b: readonly T[]): boolean {
  const set = new Set<string>(a);
  return b.some((value) => set.has(value));
}

/**
 * Decision-impact derivation is categorical and non-compensatory.
 * A more uncertain enrichment fact can never outrank a decision-blocking fact.
 */
export function evaluateResearchPriority(input: GenesisT8ResearchEvaluationInput): GenesisT8ResearchPriority {
  assertResearchQuestionInvariant(input.question);
  assertResearchCostInvariant(input.knownCost);
  if (!input.decision.realityId?.trim()) throw new Error("GENESIS_T8_CE2_R6_VIOLATION:REALITY_ID");

  const assessment = assessmentById(input.epistemic, input.question.knowledgeId);
  const decisionCritical = input.decision.decisionCriticalKnowledgeIds.includes(input.question.knowledgeId);
  const blocking = input.decision.blockingKnowledgeIds.includes(input.question.knowledgeId);
  const contradictory = input.decision.contradictoryKnowledgeIds.includes(input.question.knowledgeId);
  const uncertain = input.decision.uncertainKnowledgeIds.includes(input.question.knowledgeId);
  const dimensions = canonicalDimensions(input.question.relatedDimensions);
  const criticalDimensionCount = dimensions.filter((dimension) => input.stability.criticalDimensions.includes(dimension)).length;
  const criticalStabilityDimension = criticalDimensionCount > 0;

  let impactClass: GenesisT8ResearchDecisionImpactClass;
  if (assessment.researchDisposition === "NONE") {
    impactClass = "NO_DECISION_VALUE";
  } else if (decisionCritical && (blocking || contradictory)) {
    impactClass = "DECISION_BLOCKING";
  } else if (decisionCritical && uncertain) {
    impactClass = "DECISION_SHARPENING";
  } else if (criticalStabilityDimension) {
    impactClass = "STABILITY_RELEVANT";
  } else if (decisionCritical) {
    impactClass = "ASSURANCE_RELEVANT";
  } else {
    impactClass = "ENRICHMENT";
  }

  const deterministicReasons = Object.freeze([
    `RESEARCH_ID:${input.question.researchId}`,
    `KNOWLEDGE_ID:${input.question.knowledgeId}`,
    `EPISTEMIC_STATE:${assessment.primaryState}`,
    `RESEARCH_DISPOSITION:${assessment.researchDisposition}`,
    `DECISION_CRITICAL:${decisionCritical}`,
    `BLOCKING:${blocking}`,
    `CONTRADICTORY:${contradictory}`,
    `UNCERTAIN:${uncertain}`,
    `CRITICAL_STABILITY_DIMENSION:${criticalStabilityDimension}`,
    `CRITICAL_DIMENSION_COUNT:${criticalDimensionCount}`,
    `IMPACT_CLASS:${impactClass}`,
    `KNOWN_MONETARY_COST_USD:${input.knownCost.monetaryUsd === null ? "UNKNOWN" : input.knownCost.monetaryUsd}`,
    `KNOWN_DURATION_MS:${input.knownCost.durationMs === null ? "UNKNOWN" : input.knownCost.durationMs}`,
  ]);

  return Object.freeze({
    researchId: input.question.researchId,
    knowledgeId: input.question.knowledgeId,
    semanticQuestionKey: input.question.semanticQuestionKey,
    impactClass,
    impactPrecedence: GENESIS_T8_RESEARCH_DECISION_IMPACT_PRECEDENCE[impactClass],
    researchDisposition: assessment.researchDisposition,
    decisionCritical,
    blocking,
    contradictory,
    uncertain,
    criticalStabilityDimension,
    criticalDimensionCount,
    relatedDimensions: dimensions,
    knownCost: Object.freeze({ ...input.knownCost }),
    deterministicReasons,
  });
}

function compareKnownNullableAscending(a: number | null, b: number | null): number {
  // Unknown cost never pretends to be cheap. A known cost wins only against a
  // known higher cost; otherwise cost cannot decide the ordering.
  if (a === null || b === null) return 0;
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/**
 * Lexicographic research ordering:
 * 1. decision impact;
 * 2. number of currently critical stability dimensions affected;
 * 3. direct known monetary cost;
 * 4. direct known duration;
 * 5. canonical research id.
 *
 * Cost can only break ties inside equal decision value. Cheap irrelevant
 * research can never outrank expensive decision-blocking research.
 */
export function compareResearchPriority(a: GenesisT8ResearchPriority, b: GenesisT8ResearchPriority): number {
  if (a.impactPrecedence !== b.impactPrecedence) return b.impactPrecedence - a.impactPrecedence;
  if (a.criticalDimensionCount !== b.criticalDimensionCount) return b.criticalDimensionCount - a.criticalDimensionCount;
  const money = compareKnownNullableAscending(a.knownCost.monetaryUsd, b.knownCost.monetaryUsd);
  if (money !== 0) return money;
  const time = compareKnownNullableAscending(a.knownCost.durationMs, b.knownCost.durationMs);
  if (time !== 0) return time;
  return a.researchId.localeCompare(b.researchId);
}

export function buildResearchPlan(inputs: readonly GenesisT8ResearchEvaluationInput[]): GenesisT8ResearchPlan {
  if (!inputs.length) throw new Error("GENESIS_T8_CE2_R6_VIOLATION:EMPTY_RESEARCH_INPUTS");
  const realityIds = new Set(inputs.map((input) => input.decision.realityId));
  if (realityIds.size !== 1) throw new Error("GENESIS_T8_CE2_R6_VIOLATION:MULTIPLE_REALITIES");

  const researchIds = new Set<string>();
  const semanticQuestions = new Set<string>();
  for (const input of inputs) {
    assertResearchQuestionInvariant(input.question);
    if (researchIds.has(input.question.researchId)) throw new Error("GENESIS_T8_CE2_R6_VIOLATION:DUPLICATE_RESEARCH_ID");
    if (semanticQuestions.has(input.question.semanticQuestionKey)) throw new Error("GENESIS_T8_CE2_R6_VIOLATION:DUPLICATE_SEMANTIC_QUESTION");
    researchIds.add(input.question.researchId);
    semanticQuestions.add(input.question.semanticQuestionKey);
  }

  const ordered = Object.freeze(inputs.map(evaluateResearchPriority).sort(compareResearchPriority));
  const next = ordered.find((candidate) => candidate.impactClass !== "NO_DECISION_VALUE") ?? null;
  return Object.freeze({
    realityId: inputs[0].decision.realityId,
    researchRequired: next !== null,
    next,
    ordered,
  });
}

export const GENESIS_T8_CE2_R6_RESEARCH_LAWS = Object.freeze([
  "RESEARCH_VALUE_EXISTS_ONLY_THROUGH_POTENTIAL_DECISION_EFFECT_OR_DECISION_ASSURANCE",
  "STANDARD_EXPECTED_VALUE_OF_INFORMATION_IS_NOT_CALCULATED_WITHOUT_AUTHORISED_UTILITIES_AND_OUTCOME_PROBABILITIES",
  "ENTROPY_OR_UNCERTAINTY_REDUCTION_ALONE_CANNOT_GOVERN_RESEARCH_PRIORITY",
  "DECISION_BLOCKING_RESEARCH_PRECEDES_DECISION_SHARPENING_STABILITY_ASSURANCE_AND_ENRICHMENT",
  "CHEAP_IRRELEVANT_RESEARCH_CANNOT_OUTRANK_COSTLY_DECISION_CRITICAL_RESEARCH",
  "COST_IS_A_TIE_BREAK_ONLY_WITHIN_EQUAL_DECISION_VALUE",
  "UNKNOWN_COST_IS_NOT_ASSUMED_ZERO_OR_CHEAP",
  "R5_CRITICAL_STABILITY_DIMENSIONS_MAY_REFINE_EQUAL_NON_BLOCKING_RESEARCH_VALUE",
  "R2_EPISTEMIC_RESEARCH_DISPOSITION_DETERMINES_WHAT_KIND_OF_KNOWLEDGE_ACTION_IS_REQUIRED",
  "R4_DECISION_CRITICALITY_DETERMINES_WHETHER_UNRESOLVED_KNOWLEDGE_CAN_BLOCK_OR_SHARPEN_THE_DECISION",
  "AI_MAY_PROPOSE_SEMANTICS_BUT_MAY_NOT_ASSIGN_RESEARCH_VALUE_PRIORITY_COST_PROBABILITY_UTILITY_OR_INFORMATION_GAIN",
  "RESEARCH_SELECTION_IS_DETERMINISTIC_EXPLAINABLE_AND_REPRODUCIBLE",
  "COUNTERFACTUAL_DECISION_SET_CONTRACTION_IS_DEFERRED_UNTIL_CE2_HAS_AN_AUTHORISED_COUNTERFACTUAL_ENGINE",
  "CE2_R6_DOES_NOT_RANK_OPPORTUNITIES_ROUTES_OR_CONTACTS",
] as const);
