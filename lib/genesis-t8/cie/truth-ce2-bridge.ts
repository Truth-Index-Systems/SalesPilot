/**
 * CIE-R3 Truth -> CE2 Composition Bridge (shadow).
 *
 * This module composes CIE-R2 truth output with CE2 R1-R4 without inventing
 * truth thresholds, temporal defaults, commercial force, or decision-critical
 * semantics. It is an assume/guarantee boundary, not a new truth model.
 */
import {
  evaluateCieTruthNext,
  type CieTruthCalibrationProfile,
  type CieTruthEvidenceAggregate,
  type CieTruthNextEvidence,
} from "./truth-next";
import {
  buildEpistemicProfile,
  type GenesisT8EpistemicAssessment,
  type GenesisT8EpistemicAssessmentInput,
  type GenesisT8EpistemicProfile,
  type GenesisT8EpistemicResolution,
  type GenesisT8EpistemicVector,
} from "../ce2-evolution/epistemic-mathematics";
import {
  evaluateTemporalState,
  type GenesisT8TemporalAssessment,
  type GenesisT8TemporalInterval,
  type GenesisT8TemporalPolicy,
} from "../ce2-evolution/temporal-mathematics";
import {
  evaluateCommercialReality,
  type GenesisT8CommercialReality,
  type GenesisT8CommercialRealityIdentity,
} from "../ce2-evolution/commercial-reality";
import {
  evaluateRealityDecisionState,
  type GenesisT8RealityDecisionStateAssessment,
} from "../ce2-evolution/reality-state-machine";
import type { GenesisT8CommercialCoherenceState } from "../mathematics/commercial-coherence";

export const CIE_R3_VERSION = "0.1.0-shadow" as const;
export const CIE_R3_AUTHORITY_MODE = "SHADOW" as const;

/**
 * Truth owns this categorical qualification. R3 refuses to infer it from a
 * numeric raw balance or probability threshold.
 */
export type CieR3TruthQualification =
  | "KNOWN"
  | "UNCERTAIN"
  | "UNKNOWN"
  | "UNVERIFIED";

export type CieR3KnowledgeInput = Readonly<{
  knowledgeId: string;
  evidence: readonly CieTruthNextEvidence[];
  calibrationProfile?: CieTruthCalibrationProfile | null;
  /** Explicit upstream truth qualification; never derived from a hidden threshold. */
  truthQualification: CieR3TruthQualification;
  /** Explicit upstream contradiction qualification; evidence presence alone is insufficient. */
  contradictionQualified: boolean;
  /** Distinguishes a missing required proposition from an unknown proposition. */
  presence: "PRESENT" | "MISSING";
  interval: GenesisT8TemporalInterval;
}>;

export type CieR3RealityInput = Readonly<{
  identity: GenesisT8CommercialRealityIdentity;
  commercial: GenesisT8CommercialCoherenceState;
  governingConstraintIds: readonly string[];
  supportingEvidenceTokenIds?: readonly string[];
  previousReality?: GenesisT8CommercialReality;
  knowledge: readonly CieR3KnowledgeInput[];
  decisionCriticalKnowledgeIds: readonly string[];
  realityInterval: GenesisT8TemporalInterval;
  referenceTime: string;
  temporalPolicy?: GenesisT8TemporalPolicy;
}>;

export type CieR3KnowledgeComposition = Readonly<{
  knowledgeId: string;
  truth: CieTruthEvidenceAggregate | null;
  temporal: GenesisT8TemporalAssessment | null;
  epistemic: GenesisT8EpistemicAssessment;
  deterministicReasons: readonly string[];
}>;

export type CieR3CompositionResult = Readonly<{
  authorityMode: "SHADOW";
  reality: GenesisT8CommercialReality;
  epistemic: GenesisT8EpistemicProfile;
  realityTemporal: GenesisT8TemporalAssessment;
  decision: GenesisT8RealityDecisionStateAssessment;
  knowledge: readonly CieR3KnowledgeComposition[];
  deterministicReasons: readonly string[];
}>;

function canonicalId(value: string, code: string): string {
  if (typeof value !== "string" || !value.trim() || value !== value.trim()) {
    throw new Error(`CIE_R3_VIOLATION:${code}`);
  }
  return value;
}

function mapTruthToResolution(q: CieR3TruthQualification): GenesisT8EpistemicResolution {
  if (q === "KNOWN") return "KNOWN";
  if (q === "UNCERTAIN") return "UNCERTAIN";
  return "UNKNOWN";
}

function composeKnowledge(input: CieR3KnowledgeInput, referenceTime: string, policy?: GenesisT8TemporalPolicy): CieR3KnowledgeComposition {
  const knowledgeId = canonicalId(input.knowledgeId, "KNOWLEDGE_ID");

  if (input.presence === "MISSING") {
    if (input.evidence.length > 0) throw new Error(`CIE_R3_VIOLATION:MISSING_KNOWLEDGE_HAS_EVIDENCE:${knowledgeId}`);
    const epistemic = buildEpistemicProfile([{ knowledgeId, vector: {
      presence: "MISSING",
      verification: "NOT_APPLICABLE",
      resolution: "NOT_APPLICABLE",
      contradiction: "NOT_APPLICABLE",
      temporalValidity: "NOT_APPLICABLE",
    }}]).assessments[0];
    return Object.freeze({
      knowledgeId,
      truth: null,
      temporal: null,
      epistemic,
      deterministicReasons: Object.freeze(["PRESENCE:MISSING", "TRUTH_NOT_EVALUATED", "TIME_NOT_EVALUATED"]),
    });
  }

  const truth = evaluateCieTruthNext(input.evidence, input.calibrationProfile);
  const temporal = evaluateTemporalState({ subjectId: knowledgeId, interval: input.interval, referenceTime, policy });

  let verification: GenesisT8EpistemicVector["verification"] = input.truthQualification === "UNVERIFIED" ? "UNVERIFIED" : "VERIFIED";
  let resolution: GenesisT8EpistemicResolution = mapTruthToResolution(input.truthQualification);
  let temporalValidity: GenesisT8EpistemicVector["temporalValidity"] = temporal.epistemicTemporalValidity;

  // Future-dated knowledge is not current evidence. R2 has no PRE_ACTIVE state,
  // so composition fails closed to UNKNOWN + UNASSESSED until activation.
  if (temporal.state === "NOT_YET_ACTIVE") {
    resolution = "UNKNOWN";
    temporalValidity = "UNASSESSED";
  }

  // Time-unbounded means currentness has not been bounded, not that the fact is
  // expired. Preserve R3's explicit UNASSESSED qualification.
  if (temporal.state === "TIME_UNBOUNDED") temporalValidity = "UNASSESSED";

  // A contradiction is authority-bearing only when Truth explicitly qualifies
  // it. R3 never infers contradiction merely from contradictionStrength > 0.
  const contradiction: GenesisT8EpistemicVector["contradiction"] = input.contradictionQualified ? "CONTRADICTORY" : "CONSISTENT";
  if (contradiction === "CONTRADICTORY" && verification !== "VERIFIED") {
    throw new Error(`CIE_R3_VIOLATION:UNVERIFIED_CONTRADICTION:${knowledgeId}`);
  }

  const assessmentInput: GenesisT8EpistemicAssessmentInput = {
    knowledgeId,
    vector: { presence: "PRESENT", verification, resolution, contradiction, temporalValidity },
  };
  const epistemic = buildEpistemicProfile([assessmentInput]).assessments[0];
  return Object.freeze({
    knowledgeId,
    truth,
    temporal,
    epistemic,
    deterministicReasons: Object.freeze([
      `TRUTH_QUALIFICATION:${input.truthQualification}`,
      `TRUTH_PROBABILITY_STATE:${truth.probabilityState}`,
      `CONTRADICTION_QUALIFIED:${input.contradictionQualified}`,
      `TEMPORAL_STATE:${temporal.state}`,
      `EPISTEMIC_STATE:${epistemic.primaryState}`,
    ]),
  });
}

export function composeTruthIntoCommercialReality(input: CieR3RealityInput): CieR3CompositionResult {
  const knowledgeIds = input.knowledge.map((k) => canonicalId(k.knowledgeId, "KNOWLEDGE_ID"));
  if (new Set(knowledgeIds).size !== knowledgeIds.length) throw new Error("CIE_R3_VIOLATION:DUPLICATE_KNOWLEDGE_ID");

  const critical = [...input.decisionCriticalKnowledgeIds].map((id) => canonicalId(id, "DECISION_CRITICAL_KNOWLEDGE_ID"));
  if (new Set(critical).size !== critical.length) throw new Error("CIE_R3_VIOLATION:DUPLICATE_DECISION_CRITICAL_KNOWLEDGE_ID");
  const knowledgeSet = new Set(knowledgeIds);
  for (const id of critical) if (!knowledgeSet.has(id)) throw new Error(`CIE_R3_VIOLATION:CRITICAL_KNOWLEDGE_NOT_SUPPLIED:${id}`);

  const composedKnowledge = Object.freeze(input.knowledge.map((k) => composeKnowledge(k, input.referenceTime, input.temporalPolicy))
    .sort((a,b) => a.knowledgeId.localeCompare(b.knowledgeId)));
  const epistemic = buildEpistemicProfile(composedKnowledge.map((k) => ({ knowledgeId: k.knowledgeId, vector: k.epistemic.vector })));

  const reality = evaluateCommercialReality({
    identity: input.identity,
    commercial: input.commercial,
    governingConstraintIds: input.governingConstraintIds,
    supportingEvidenceTokenIds: input.supportingEvidenceTokenIds,
    previousReality: input.previousReality,
  });
  const realityTemporal = evaluateTemporalState({
    subjectId: reality.realityId,
    interval: input.realityInterval,
    referenceTime: input.referenceTime,
    policy: input.temporalPolicy,
  });
  const decision = evaluateRealityDecisionState({
    reality,
    epistemic,
    temporal: realityTemporal,
    decisionCriticalKnowledgeIds: critical,
  });

  return Object.freeze({
    authorityMode: CIE_R3_AUTHORITY_MODE,
    reality,
    epistemic,
    realityTemporal,
    decision,
    knowledge: composedKnowledge,
    deterministicReasons: Object.freeze([
      "TRUTH_QUALIFICATION_IS_CONSUMED_NOT_INFERRED_FROM_NUMERIC_THRESHOLD",
      "DEPENDENCE_AWARE_TRUTH_IS_COMPOSED_BEFORE_EPISTEMIC_PERMISSION",
      "KNOWLEDGE_TIME_IS_EVALUATED_BEFORE_DIRECTIONAL_PERMISSION",
      "FUTURE_KNOWLEDGE_FAILS_CLOSED_TO_UNKNOWN_UNASSESSED",
      "COMMERCIAL_COHERENCE_IS_CONSUMED_FROM_UDOSIB_NOT_RECALCULATED_HERE",
      "REALITY_DECISION_IS_DERIVED_BY_CE2_R4",
      "CIE_R3_REMAINS_SHADOW_AND_CANNOT_CONTROL_MARKETROUTE",
    ]),
  });
}

export const CIE_R3_COMPOSITION_LAWS = Object.freeze([
  "NO_NUMERIC_TRUTH_THRESHOLD_IS_INVENTED_BY_THE_BRIDGE",
  "TRUTH_OWNS_TRUTH_QUALIFICATION_AND_CONTRADICTION_QUALIFICATION",
  "R3_OWNS_TEMPORAL_STATE",
  "R2_OWNS_EPISTEMIC_PERMISSION",
  "R1_OWNS_COMMERCIAL_REALITY_IDENTITY",
  "R4_OWNS_REALITY_DECISION_STATE",
  "MISSING_UNKNOWN_UNVERIFIED_UNCERTAIN_CONTRADICTORY_AND_EXPIRED_REMAIN_DISTINCT",
  "NOT_YET_ACTIVE_KNOWLEDGE_CANNOT_SUPPLY_CURRENT_DIRECTIONAL_FORCE",
  "UNCALIBRATED_TRUTH_OUTPUT_CANNOT_SILENTLY_BECOME_A_PROBABILITY",
  "SHADOW_OUTPUT_CANNOT_CONTROL_LIVE_BEHAVIOUR",
] as const);
