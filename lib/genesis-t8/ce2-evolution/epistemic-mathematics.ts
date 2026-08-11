/**
 * Genesis T8 CE2 Evolution R2 — Epistemic Mathematics.
 *
 * Additive post-freeze evolution over Commercial Reality and UDOSIB 1.0.0.
 * This layer does not calculate truth probability, confidence, freshness or
 * commercial force. It consumes categorical epistemic qualifications and
 * preserves them as orthogonal axes so missing, unknown, uncertain,
 * unverified, contradictory and expired knowledge cannot collapse into one
 * generic deficit state.
 */
import {
  assertCommercialRealityInvariant,
  type GenesisT8CommercialReality,
} from "./commercial-reality";

export const GENESIS_T8_CE2_EVOLUTION_R2_VERSION = "1.0.0" as const;
export const GENESIS_T8_CE2_EVOLUTION_R2_BUILD = "CE2-R2" as const;

export const GENESIS_T8_EPISTEMIC_PRIMARY_STATES = Object.freeze([
  "KNOWN",
  "UNCERTAIN",
  "UNKNOWN",
  "UNVERIFIED",
  "CONTRADICTORY",
  "EXPIRED",
  "MISSING",
] as const);
export type GenesisT8EpistemicPrimaryState = (typeof GENESIS_T8_EPISTEMIC_PRIMARY_STATES)[number];

export type GenesisT8EpistemicPresence = "PRESENT" | "MISSING";
export type GenesisT8EpistemicVerification = "VERIFIED" | "UNVERIFIED" | "NOT_APPLICABLE";
export type GenesisT8EpistemicResolution = "KNOWN" | "UNCERTAIN" | "UNKNOWN" | "NOT_APPLICABLE";
export type GenesisT8EpistemicContradiction = "CONSISTENT" | "CONTRADICTORY" | "NOT_APPLICABLE";
export type GenesisT8EpistemicTemporalValidity = "CURRENT" | "EXPIRED" | "UNASSESSED" | "NOT_APPLICABLE";

export type GenesisT8EpistemicVector = Readonly<{
  presence: GenesisT8EpistemicPresence;
  verification: GenesisT8EpistemicVerification;
  resolution: GenesisT8EpistemicResolution;
  contradiction: GenesisT8EpistemicContradiction;
  temporalValidity: GenesisT8EpistemicTemporalValidity;
}>;

export type GenesisT8EpistemicResearchDisposition =
  | "NONE"
  | "ACQUIRE_MISSING_KNOWLEDGE"
  | "DISCOVER_UNKNOWN_KNOWLEDGE"
  | "RESOLVE_UNCERTAINTY"
  | "VERIFY_CLAIM"
  | "RESOLVE_CONTRADICTION"
  | "REFRESH_EXPIRED_KNOWLEDGE";

export type GenesisT8EpistemicCommercialPermission =
  | "MAY_SUPPLY_DIRECTIONAL_FORCE"
  | "MAY_SUPPLY_DIRECTIONAL_FORCE_WITH_UNCERTAINTY"
  | "CONTRADICTION_CHANNEL_ONLY"
  | "NO_DIRECTIONAL_FORCE";

export type GenesisT8EpistemicAssessmentInput = Readonly<{
  knowledgeId: string;
  vector: GenesisT8EpistemicVector;
}>;

export type GenesisT8EpistemicAssessment = Readonly<{
  knowledgeId: string;
  vector: GenesisT8EpistemicVector;
  primaryState: GenesisT8EpistemicPrimaryState;
  commercialPermission: GenesisT8EpistemicCommercialPermission;
  researchDisposition: GenesisT8EpistemicResearchDisposition;
  deterministicReasons: readonly string[];
}>;

export type GenesisT8EpistemicProfile = Readonly<{
  assessments: readonly GenesisT8EpistemicAssessment[];
  counts: Readonly<Record<GenesisT8EpistemicPrimaryState, number>>;
  unresolvedKnowledgeIds: readonly string[];
  contradictionKnowledgeIds: readonly string[];
  expiredKnowledgeIds: readonly string[];
  researchRequiredKnowledgeIds: readonly string[];
}>;

export type GenesisT8EpistemicallyQualifiedCommercialReality = Readonly<{
  reality: GenesisT8CommercialReality;
  epistemic: GenesisT8EpistemicProfile;
}>;

function assertCanonicalId(value: string): void {
  if (typeof value !== "string" || !value.trim() || value !== value.trim()) {
    throw new Error("GENESIS_T8_CE2_R2_VIOLATION:KNOWLEDGE_ID");
  }
}

export function assertEpistemicVectorInvariant(vector: GenesisT8EpistemicVector): void {
  const presence = ["PRESENT", "MISSING"] as const;
  const verification = ["VERIFIED", "UNVERIFIED", "NOT_APPLICABLE"] as const;
  const resolution = ["KNOWN", "UNCERTAIN", "UNKNOWN", "NOT_APPLICABLE"] as const;
  const contradiction = ["CONSISTENT", "CONTRADICTORY", "NOT_APPLICABLE"] as const;
  const temporal = ["CURRENT", "EXPIRED", "UNASSESSED", "NOT_APPLICABLE"] as const;
  if (!presence.includes(vector.presence)) throw new Error("GENESIS_T8_CE2_R2_VIOLATION:PRESENCE");
  if (!verification.includes(vector.verification)) throw new Error("GENESIS_T8_CE2_R2_VIOLATION:VERIFICATION");
  if (!resolution.includes(vector.resolution)) throw new Error("GENESIS_T8_CE2_R2_VIOLATION:RESOLUTION");
  if (!contradiction.includes(vector.contradiction)) throw new Error("GENESIS_T8_CE2_R2_VIOLATION:CONTRADICTION");
  if (!temporal.includes(vector.temporalValidity)) throw new Error("GENESIS_T8_CE2_R2_VIOLATION:TEMPORAL_VALIDITY");

  if (vector.presence === "MISSING") {
    if (vector.verification !== "NOT_APPLICABLE" || vector.resolution !== "NOT_APPLICABLE" || vector.contradiction !== "NOT_APPLICABLE" || vector.temporalValidity !== "NOT_APPLICABLE") {
      throw new Error("GENESIS_T8_CE2_R2_VIOLATION:MISSING_REQUIRES_NON_APPLICABLE_AXES");
    }
    return;
  }

  if (vector.verification === "NOT_APPLICABLE" || vector.resolution === "NOT_APPLICABLE" || vector.contradiction === "NOT_APPLICABLE" || vector.temporalValidity === "NOT_APPLICABLE") {
    throw new Error("GENESIS_T8_CE2_R2_VIOLATION:PRESENT_REQUIRES_APPLICABLE_AXES");
  }
  if (vector.contradiction === "CONTRADICTORY" && vector.verification !== "VERIFIED") {
    throw new Error("GENESIS_T8_CE2_R2_VIOLATION:CONTRADICTION_REQUIRES_VERIFIED_KNOWLEDGE");
  }
  if (vector.resolution === "KNOWN" && vector.verification !== "VERIFIED") {
    throw new Error("GENESIS_T8_CE2_R2_VIOLATION:KNOWN_REQUIRES_VERIFIED_KNOWLEDGE");
  }
}

/**
 * Primary state is a control label only. The full vector remains authoritative
 * so orthogonal conditions are never discarded by precedence.
 */
export function deriveEpistemicPrimaryState(vector: GenesisT8EpistemicVector): GenesisT8EpistemicPrimaryState {
  assertEpistemicVectorInvariant(vector);
  if (vector.presence === "MISSING") return "MISSING";
  if (vector.temporalValidity === "EXPIRED") return "EXPIRED";
  if (vector.verification === "UNVERIFIED") return "UNVERIFIED";
  if (vector.contradiction === "CONTRADICTORY") return "CONTRADICTORY";
  if (vector.resolution === "UNKNOWN") return "UNKNOWN";
  if (vector.resolution === "UNCERTAIN") return "UNCERTAIN";
  return "KNOWN";
}

export function commercialPermissionForEpistemicState(state: GenesisT8EpistemicPrimaryState): GenesisT8EpistemicCommercialPermission {
  switch (state) {
    case "KNOWN": return "MAY_SUPPLY_DIRECTIONAL_FORCE";
    case "UNCERTAIN": return "MAY_SUPPLY_DIRECTIONAL_FORCE_WITH_UNCERTAINTY";
    case "CONTRADICTORY": return "CONTRADICTION_CHANNEL_ONLY";
    case "UNKNOWN":
    case "UNVERIFIED":
    case "EXPIRED":
    case "MISSING":
      return "NO_DIRECTIONAL_FORCE";
  }
}

export function researchDispositionForEpistemicState(state: GenesisT8EpistemicPrimaryState): GenesisT8EpistemicResearchDisposition {
  switch (state) {
    case "KNOWN": return "NONE";
    case "UNCERTAIN": return "RESOLVE_UNCERTAINTY";
    case "UNKNOWN": return "DISCOVER_UNKNOWN_KNOWLEDGE";
    case "UNVERIFIED": return "VERIFY_CLAIM";
    case "CONTRADICTORY": return "RESOLVE_CONTRADICTION";
    case "EXPIRED": return "REFRESH_EXPIRED_KNOWLEDGE";
    case "MISSING": return "ACQUIRE_MISSING_KNOWLEDGE";
  }
}

export function evaluateEpistemicState(input: GenesisT8EpistemicAssessmentInput): GenesisT8EpistemicAssessment {
  assertCanonicalId(input.knowledgeId);
  assertEpistemicVectorInvariant(input.vector);
  const primaryState = deriveEpistemicPrimaryState(input.vector);
  const commercialPermission = commercialPermissionForEpistemicState(primaryState);
  const researchDisposition = researchDispositionForEpistemicState(primaryState);
  const deterministicReasons = Object.freeze([
    `PRESENCE:${input.vector.presence}`,
    `VERIFICATION:${input.vector.verification}`,
    `RESOLUTION:${input.vector.resolution}`,
    `CONTRADICTION:${input.vector.contradiction}`,
    `TEMPORAL_VALIDITY:${input.vector.temporalValidity}`,
    `PRIMARY_STATE:${primaryState}`,
    `COMMERCIAL_PERMISSION:${commercialPermission}`,
    `RESEARCH_DISPOSITION:${researchDisposition}`,
  ]);
  return Object.freeze({
    knowledgeId: input.knowledgeId,
    vector: Object.freeze({ ...input.vector }),
    primaryState,
    commercialPermission,
    researchDisposition,
    deterministicReasons,
  });
}

function canonicalAssessments(assessments: readonly GenesisT8EpistemicAssessment[]): readonly GenesisT8EpistemicAssessment[] {
  const ids = assessments.map((assessment) => assessment.knowledgeId);
  if (new Set(ids).size !== ids.length) throw new Error("GENESIS_T8_CE2_R2_VIOLATION:DUPLICATE_KNOWLEDGE_ID");
  return Object.freeze([...assessments].sort((a, b) => a.knowledgeId.localeCompare(b.knowledgeId)));
}

export function buildEpistemicProfile(inputs: readonly GenesisT8EpistemicAssessmentInput[]): GenesisT8EpistemicProfile {
  const assessments = canonicalAssessments(inputs.map(evaluateEpistemicState));
  const counts: Record<GenesisT8EpistemicPrimaryState, number> = {
    KNOWN: 0, UNCERTAIN: 0, UNKNOWN: 0, UNVERIFIED: 0, CONTRADICTORY: 0, EXPIRED: 0, MISSING: 0,
  };
  for (const assessment of assessments) counts[assessment.primaryState] += 1;
  const unresolvedKnowledgeIds = Object.freeze(assessments.filter((a) => a.primaryState !== "KNOWN").map((a) => a.knowledgeId));
  const contradictionKnowledgeIds = Object.freeze(assessments.filter((a) => a.primaryState === "CONTRADICTORY").map((a) => a.knowledgeId));
  const expiredKnowledgeIds = Object.freeze(assessments.filter((a) => a.primaryState === "EXPIRED").map((a) => a.knowledgeId));
  const researchRequiredKnowledgeIds = Object.freeze(assessments.filter((a) => a.researchDisposition !== "NONE").map((a) => a.knowledgeId));
  return Object.freeze({
    assessments,
    counts: Object.freeze(counts),
    unresolvedKnowledgeIds,
    contradictionKnowledgeIds,
    expiredKnowledgeIds,
    researchRequiredKnowledgeIds,
  });
}

export function qualifyCommercialRealityEpistemically(
  reality: GenesisT8CommercialReality,
  inputs: readonly GenesisT8EpistemicAssessmentInput[],
): GenesisT8EpistemicallyQualifiedCommercialReality {
  assertCommercialRealityInvariant(reality);
  return Object.freeze({ reality, epistemic: buildEpistemicProfile(inputs) });
}

export const GENESIS_T8_CE2_R2_EPISTEMIC_LAWS = Object.freeze([
  "EPISTEMIC_STATE_IS_ORTHOGONAL_TO_COMMERCIAL_CONSTRAINT_ROLE",
  "PRIMARY_STATE_IS_DERIVED_CONTROL_METADATA_THE_FULL_EPISTEMIC_VECTOR_IS_RETAINED",
  "MISSING_UNKNOWN_UNCERTAIN_UNVERIFIED_CONTRADICTORY_AND_EXPIRED_ARE_DISTINCT",
  "TI_REMAINS_SOLE_OWNER_OF_TRUTH_PROBABILITY_CONFIDENCE_CONTRADICTION_AND_FRESHNESS",
  "CE2_R2_DOES_NOT_INVENT_PROBABILITY_THRESHOLDS_OR_DECAY_FUNCTIONS",
  "EXPIRED_IS_CONSUMED_AS_AN_UPSTREAM_TEMPORAL_QUALIFICATION_TIME_CALCULATION_IS_DEFERRED",
  "UNKNOWN_UNVERIFIED_EXPIRED_AND_MISSING_KNOWLEDGE_SUPPLY_ZERO_DIRECTIONAL_COMMERCIAL_FORCE",
  "UNCERTAIN_VERIFIED_KNOWLEDGE_MAY_RETAIN_FROZEN_UDOSIB_DIRECTIONAL_FORCE_WITH_UNCERTAINTY",
  "CONTRADICTORY_KNOWLEDGE_USES_THE_CONTRADICTION_CHANNEL_ONLY",
  "RESEARCH_DISPOSITION_IS_CATEGORICAL_AND_DETERMINISTIC_NOT_A_PRIORITY_SCORE",
  "COMMERCIAL_REALITY_IS_QUALIFIED_NOT_REPLACED_BY_EPISTEMIC_STATE",
  "FROZEN_UDOSIB_1_0_0_AND_TI_2_1_8_ARE_CONSUMED_READ_ONLY",
] as const);
