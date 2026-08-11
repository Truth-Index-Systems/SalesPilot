/**
 * Genesis T8 CE2 Evolution R4 — Commercial Reality State Machine.
 *
 * Additive post-freeze evolution over R1 Commercial Reality, R2 Epistemic
 * Mathematics and R3 Temporal Mathematics. The machine derives a commercial
 * decision state from already-qualified deterministic inputs. It does not rank
 * opportunities, routes, contacts or research and does not invent probability,
 * score, weight, time horizon or semantic criticality.
 */
import {
  assertCommercialRealityInvariant,
  type GenesisT8CommercialReality,
} from "./commercial-reality";
import {
  type GenesisT8EpistemicAssessment,
  type GenesisT8EpistemicProfile,
} from "./epistemic-mathematics";
import {
  type GenesisT8TemporalAssessment,
} from "./temporal-mathematics";

export const GENESIS_T8_CE2_EVOLUTION_R4_VERSION = "1.0.0" as const;
export const GENESIS_T8_CE2_EVOLUTION_R4_BUILD = "CE2-R4" as const;

export const GENESIS_T8_REALITY_DECISION_STATES = Object.freeze([
  "IMPOSSIBLE",
  "DORMANT",
  "EXPIRED",
  "UNRESOLVED",
  "CONTESTED",
  "POSSIBLE",
  "ESTABLISHED",
] as const);
export type GenesisT8RealityDecisionState = (typeof GENESIS_T8_REALITY_DECISION_STATES)[number];

export type GenesisT8RealityTimePressure = "NONE" | "WITHIN_DECISION_HORIZON";

export type GenesisT8RealityDecisionReason =
  | "COMMERCIAL_REALITY_ELIMINATED"
  | "TEMPORAL_WINDOW_NOT_YET_ACTIVE"
  | "TEMPORAL_WINDOW_EXPIRED"
  | "COMMERCIAL_VIABILITY_UNRESOLVED"
  | "DECISION_CRITICAL_KNOWLEDGE_UNRESOLVED"
  | "DECISION_CRITICAL_KNOWLEDGE_CONTRADICTORY"
  | "DECISION_CRITICAL_KNOWLEDGE_UNCERTAIN"
  | "COMMERCIAL_REALITY_ESTABLISHED";

export type GenesisT8RealityDecisionStateInput = Readonly<{
  reality: GenesisT8CommercialReality;
  epistemic: GenesisT8EpistemicProfile;
  temporal: GenesisT8TemporalAssessment;
  /**
   * Explicit semantic declaration only. R4 never infers that every unknown fact
   * is decision-critical. IDs must exist in the supplied epistemic profile.
   */
  decisionCriticalKnowledgeIds: readonly string[];
}>;

export type GenesisT8RealityDecisionStateAssessment = Readonly<{
  realityId: string;
  state: GenesisT8RealityDecisionState;
  reason: GenesisT8RealityDecisionReason;
  timePressure: GenesisT8RealityTimePressure;
  decisionCriticalKnowledgeIds: readonly string[];
  blockingKnowledgeIds: readonly string[];
  contradictoryKnowledgeIds: readonly string[];
  uncertainKnowledgeIds: readonly string[];
  establishedKnowledgeIds: readonly string[];
  deterministicReasons: readonly string[];
}>;

export type GenesisT8RealityTransitionReason =
  | "INITIAL_ASSESSMENT"
  | "NO_DECISION_STATE_CHANGE"
  | "COMMERCIAL_STATE_CHANGED"
  | "TEMPORAL_STATE_CHANGED"
  | "EPISTEMIC_STATE_CHANGED"
  | "MULTIPLE_GOVERNING_AXES_CHANGED";

export type GenesisT8RealityDecisionTransition = Readonly<{
  realityId: string;
  fromState: GenesisT8RealityDecisionState | null;
  toState: GenesisT8RealityDecisionState;
  changed: boolean;
  transitionReason: GenesisT8RealityTransitionReason;
  changedAxes: readonly ("COMMERCIAL" | "TEMPORAL" | "EPISTEMIC")[];
}>;

function canonicalId(value: string, code: string): string {
  if (typeof value !== "string" || !value.trim() || value !== value.trim()) {
    throw new Error(`GENESIS_T8_CE2_R4_VIOLATION:${code}`);
  }
  return value;
}

function canonicalIdSet(values: readonly string[], code: string): readonly string[] {
  const copy = values.map((value) => canonicalId(value, code));
  if (new Set(copy).size !== copy.length) throw new Error(`GENESIS_T8_CE2_R4_VIOLATION:DUPLICATE_${code}`);
  return Object.freeze(copy.sort((a, b) => a.localeCompare(b)));
}

function assessmentMap(profile: GenesisT8EpistemicProfile): ReadonlyMap<string, GenesisT8EpistemicAssessment> {
  const map = new Map<string, GenesisT8EpistemicAssessment>();
  for (const assessment of profile.assessments) {
    if (map.has(assessment.knowledgeId)) throw new Error("GENESIS_T8_CE2_R4_VIOLATION:DUPLICATE_EPISTEMIC_KNOWLEDGE_ID");
    map.set(assessment.knowledgeId, assessment);
  }
  return map;
}

function activeContradiction(assessment: GenesisT8EpistemicAssessment): boolean {
  return assessment.vector.contradiction === "CONTRADICTORY" && assessment.vector.temporalValidity !== "EXPIRED";
}

function noDirectionalForce(assessment: GenesisT8EpistemicAssessment): boolean {
  return assessment.commercialPermission === "NO_DIRECTIONAL_FORCE";
}

function uncertainDirectionalForce(assessment: GenesisT8EpistemicAssessment): boolean {
  return assessment.commercialPermission === "MAY_SUPPLY_DIRECTIONAL_FORCE_WITH_UNCERTAINTY";
}

function establishedDirectionalForce(assessment: GenesisT8EpistemicAssessment): boolean {
  return assessment.commercialPermission === "MAY_SUPPLY_DIRECTIONAL_FORCE";
}

export function evaluateRealityDecisionState(input: GenesisT8RealityDecisionStateInput): GenesisT8RealityDecisionStateAssessment {
  assertCommercialRealityInvariant(input.reality);
  if (input.temporal.subjectId !== input.reality.realityId) {
    throw new Error("GENESIS_T8_CE2_R4_VIOLATION:TEMPORAL_REALITY_ID_MISMATCH");
  }

  const criticalIds = canonicalIdSet(input.decisionCriticalKnowledgeIds, "DECISION_CRITICAL_KNOWLEDGE_ID");
  const byId = assessmentMap(input.epistemic);
  const critical = criticalIds.map((id) => {
    const assessment = byId.get(id);
    if (!assessment) throw new Error(`GENESIS_T8_CE2_R4_VIOLATION:CRITICAL_KNOWLEDGE_NOT_IN_PROFILE:${id}`);
    return assessment;
  });

  const blockingKnowledgeIds = Object.freeze(critical.filter(noDirectionalForce).map((a) => a.knowledgeId).sort((a, b) => a.localeCompare(b)));
  const contradictoryKnowledgeIds = Object.freeze(critical.filter(activeContradiction).map((a) => a.knowledgeId).sort((a, b) => a.localeCompare(b)));
  const uncertainKnowledgeIds = Object.freeze(critical.filter(uncertainDirectionalForce).map((a) => a.knowledgeId).sort((a, b) => a.localeCompare(b)));
  const establishedKnowledgeIds = Object.freeze(critical.filter(establishedDirectionalForce).map((a) => a.knowledgeId).sort((a, b) => a.localeCompare(b)));

  let state: GenesisT8RealityDecisionState;
  let reason: GenesisT8RealityDecisionReason;

  // Constitutional precedence: commercial impossibility and time bounds are
  // stronger than epistemic readiness. Epistemic states then resolve whether a
  // surviving, current reality is contested, unresolved, possible or established.
  if (input.reality.commercial.viability === "ELIMINATED") {
    state = "IMPOSSIBLE";
    reason = "COMMERCIAL_REALITY_ELIMINATED";
  } else if (input.temporal.state === "EXPIRED") {
    state = "EXPIRED";
    reason = "TEMPORAL_WINDOW_EXPIRED";
  } else if (input.temporal.state === "NOT_YET_ACTIVE") {
    state = "DORMANT";
    reason = "TEMPORAL_WINDOW_NOT_YET_ACTIVE";
  } else if (input.reality.commercial.viability === "UNRESOLVED") {
    state = "UNRESOLVED";
    reason = "COMMERCIAL_VIABILITY_UNRESOLVED";
  } else if (contradictoryKnowledgeIds.length > 0) {
    state = "CONTESTED";
    reason = "DECISION_CRITICAL_KNOWLEDGE_CONTRADICTORY";
  } else if (blockingKnowledgeIds.length > 0) {
    state = "UNRESOLVED";
    reason = "DECISION_CRITICAL_KNOWLEDGE_UNRESOLVED";
  } else if (uncertainKnowledgeIds.length > 0) {
    state = "POSSIBLE";
    reason = "DECISION_CRITICAL_KNOWLEDGE_UNCERTAIN";
  } else {
    state = "ESTABLISHED";
    reason = "COMMERCIAL_REALITY_ESTABLISHED";
  }

  const timePressure: GenesisT8RealityTimePressure = input.temporal.state === "EXPIRING"
    ? "WITHIN_DECISION_HORIZON"
    : "NONE";

  const deterministicReasons = Object.freeze([
    `REALITY_ID:${input.reality.realityId}`,
    `COMMERCIAL_VIABILITY:${input.reality.commercial.viability}`,
    `TEMPORAL_STATE:${input.temporal.state}`,
    `DECISION_STATE:${state}`,
    `DECISION_REASON:${reason}`,
    `TIME_PRESSURE:${timePressure}`,
    `CRITICAL_KNOWLEDGE_COUNT:${criticalIds.length}`,
    `BLOCKING_KNOWLEDGE_COUNT:${blockingKnowledgeIds.length}`,
    `CONTRADICTORY_KNOWLEDGE_COUNT:${contradictoryKnowledgeIds.length}`,
    `UNCERTAIN_KNOWLEDGE_COUNT:${uncertainKnowledgeIds.length}`,
  ]);

  return Object.freeze({
    realityId: input.reality.realityId,
    state,
    reason,
    timePressure,
    decisionCriticalKnowledgeIds: criticalIds,
    blockingKnowledgeIds,
    contradictoryKnowledgeIds,
    uncertainKnowledgeIds,
    establishedKnowledgeIds,
    deterministicReasons,
  });
}

export function deriveRealityDecisionTransition(
  previous: GenesisT8RealityDecisionStateAssessment | null,
  next: GenesisT8RealityDecisionStateAssessment,
  previousInput: GenesisT8RealityDecisionStateInput | null,
  nextInput: GenesisT8RealityDecisionStateInput,
): GenesisT8RealityDecisionTransition {
  if (next.realityId !== nextInput.reality.realityId) throw new Error("GENESIS_T8_CE2_R4_VIOLATION:NEXT_ASSESSMENT_INPUT_MISMATCH");
  if (previous === null || previousInput === null) {
    if (previous !== null || previousInput !== null) throw new Error("GENESIS_T8_CE2_R4_VIOLATION:PARTIAL_PREVIOUS_STATE");
    return Object.freeze({ realityId: next.realityId, fromState: null, toState: next.state, changed: true, transitionReason: "INITIAL_ASSESSMENT", changedAxes: Object.freeze([]) });
  }
  if (previous.realityId !== next.realityId || previousInput.reality.realityId !== nextInput.reality.realityId || previous.realityId !== previousInput.reality.realityId) {
    throw new Error("GENESIS_T8_CE2_R4_VIOLATION:REALITY_IDENTITY_CHANGED_ACROSS_TRANSITION");
  }

  const changedAxes: ("COMMERCIAL" | "TEMPORAL" | "EPISTEMIC")[] = [];
  if (previousInput.reality.mathematicalFingerprint !== nextInput.reality.mathematicalFingerprint) changedAxes.push("COMMERCIAL");
  if (previousInput.temporal.state !== nextInput.temporal.state || previousInput.temporal.referenceTime !== nextInput.temporal.referenceTime || previousInput.temporal.decisionHorizonMs !== nextInput.temporal.decisionHorizonMs) changedAxes.push("TEMPORAL");
  if (JSON.stringify(previousInput.epistemic.assessments) !== JSON.stringify(nextInput.epistemic.assessments) || previous.decisionCriticalKnowledgeIds.join("\u0000") !== next.decisionCriticalKnowledgeIds.join("\u0000")) changedAxes.push("EPISTEMIC");

  const changed = previous.state !== next.state || previous.timePressure !== next.timePressure;
  let transitionReason: GenesisT8RealityTransitionReason;
  if (!changed) transitionReason = "NO_DECISION_STATE_CHANGE";
  else if (changedAxes.length > 1) transitionReason = "MULTIPLE_GOVERNING_AXES_CHANGED";
  else if (changedAxes[0] === "COMMERCIAL") transitionReason = "COMMERCIAL_STATE_CHANGED";
  else if (changedAxes[0] === "TEMPORAL") transitionReason = "TEMPORAL_STATE_CHANGED";
  else transitionReason = "EPISTEMIC_STATE_CHANGED";

  return Object.freeze({
    realityId: next.realityId,
    fromState: previous.state,
    toState: next.state,
    changed,
    transitionReason,
    changedAxes: Object.freeze(changedAxes),
  });
}

export const GENESIS_T8_CE2_R4_STATE_MACHINE_LAWS = Object.freeze([
  "COMMERCIAL_REALITY_DECISION_STATE_IS_DERIVED_NOT_AI_AUTHORED",
  "COMMERCIAL_ELIMINATION_PRECEDES_TEMPORAL_AND_EPISTEMIC_READINESS",
  "EXPIRED_AND_NOT_YET_ACTIVE_REALITIES_CANNOT_BE_ESTABLISHED",
  "ONLY_EXPLICIT_DECISION_CRITICAL_KNOWLEDGE_CAN_BLOCK_REALITY_READINESS",
  "OPTIONAL_ENRICHMENT_KNOWLEDGE_CANNOT_DOWNGRADE_AN_ESTABLISHED_REALITY",
  "ACTIVE_DECISION_CRITICAL_CONTRADICTION_PRODUCES_CONTESTED_NOT_FALSE_CERTAINTY",
  "VERIFIED_DECISION_CRITICAL_UNCERTAINTY_PRODUCES_POSSIBLE_NOT_ESTABLISHED",
  "EXPIRING_IS_ORTHOGONAL_TIME_PRESSURE_NOT_A_REPLACEMENT_DECISION_STATE",
  "STATE_TRANSITIONS_PRESERVE_COMMERCIAL_REALITY_IDENTITY",
  "TRANSITION_CAUSE_IS_DERIVED_FROM_CHANGED_GOVERNING_AXES",
  "NO_SCORE_WEIGHT_PROBABILITY_OR_HIDDEN_THRESHOLD_IS_PERMITTED",
  "CE2_R4_DOES_NOT_RANK_OPPORTUNITIES_ROUTES_CONTACTS_OR_RESEARCH",
] as const);
