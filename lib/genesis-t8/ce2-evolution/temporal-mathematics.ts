/**
 * Genesis T8 CE2 Evolution R3 — Temporal Mathematics.
 *
 * Additive post-freeze evolution over Commercial Reality and Epistemic Mathematics.
 * This layer treats time as a deterministic axis. It does not calculate truth
 * confidence, freshness probability, opportunity ranking or arbitrary decay.
 * "Expiring" exists only relative to an explicit caller-supplied decision horizon.
 */
import {
  assertCommercialRealityInvariant,
  type GenesisT8CommercialReality,
} from "./commercial-reality";
import type { GenesisT8EpistemicTemporalValidity } from "./epistemic-mathematics";

export const GENESIS_T8_CE2_EVOLUTION_R3_VERSION = "1.0.0" as const;
export const GENESIS_T8_CE2_EVOLUTION_R3_BUILD = "CE2-R3" as const;

export const GENESIS_T8_TEMPORAL_STATES = Object.freeze([
  "NOT_YET_ACTIVE",
  "ACTIVE",
  "EXPIRING",
  "EXPIRED",
  "TIME_UNBOUNDED",
] as const);
export type GenesisT8TemporalState = (typeof GENESIS_T8_TEMPORAL_STATES)[number];

export type GenesisT8TemporalInterval = Readonly<{
  validFrom?: string | null;
  validTo?: string | null;
}>;

export type GenesisT8TemporalPolicy = Readonly<{
  /** Explicit decision window only. R3 never invents a default horizon. */
  decisionHorizonMs?: number | null;
}>;

export type GenesisT8TemporalAssessmentInput = Readonly<{
  subjectId: string;
  interval: GenesisT8TemporalInterval;
  referenceTime: string;
  policy?: GenesisT8TemporalPolicy;
}>;

export type GenesisT8TemporalCommercialPermission =
  | "BLOCKED_UNTIL_ACTIVE"
  | "MAY_PROCEED"
  | "MAY_PROCEED_WITH_TIME_PRESSURE"
  | "NO_LONGER_CURRENT"
  | "MAY_PROCEED_TIME_UNBOUNDED";

export type GenesisT8TemporalAgeClass =
  | "PRE_ACTIVE"
  | "ACTIVE_CURRENT"
  | "ACTIVE_WITHIN_DECISION_HORIZON"
  | "POST_EXPIRY"
  | "UNBOUNDED";

export type GenesisT8TemporalAssessment = Readonly<{
  subjectId: string;
  referenceTime: string;
  interval: Readonly<{ validFrom: string | null; validTo: string | null }>;
  state: GenesisT8TemporalState;
  ageClass: GenesisT8TemporalAgeClass;
  commercialPermission: GenesisT8TemporalCommercialPermission;
  epistemicTemporalValidity: GenesisT8EpistemicTemporalValidity;
  elapsedSinceActivationMs: number | null;
  remainingUntilActivationMs: number | null;
  remainingUntilExpiryMs: number | null;
  decisionHorizonMs: number | null;
  deterministicReasons: readonly string[];
}>;

export type GenesisT8TemporallyQualifiedCommercialReality = Readonly<{
  reality: GenesisT8CommercialReality;
  temporal: GenesisT8TemporalAssessment;
}>;

export type GenesisT8ClosedTemporalInterval = Readonly<{
  start: string;
  end: string;
}>;

export type GenesisT8TemporalIntervalRelation =
  | "BEFORE"
  | "MEETS"
  | "OVERLAPS"
  | "STARTS"
  | "DURING"
  | "FINISHES"
  | "EQUALS"
  | "FINISHED_BY"
  | "CONTAINS"
  | "STARTED_BY"
  | "OVERLAPPED_BY"
  | "MET_BY"
  | "AFTER";

function assertCanonicalId(value: string): void {
  if (typeof value !== "string" || !value.trim() || value !== value.trim()) {
    throw new Error("GENESIS_T8_CE2_R3_VIOLATION:SUBJECT_ID");
  }
}

const RFC3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;

function instantMs(value: string, code: string): number {
  if (typeof value !== "string" || !RFC3339.test(value)) {
    throw new Error(`GENESIS_T8_CE2_R3_VIOLATION:${code}_RFC3339`);
  }
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) throw new Error(`GENESIS_T8_CE2_R3_VIOLATION:${code}_INVALID`);
  return ms;
}

function nullableInstant(value: string | null | undefined, code: string): Readonly<{ value: string | null; ms: number | null }> {
  if (value == null) return Object.freeze({ value: null, ms: null });
  return Object.freeze({ value, ms: instantMs(value, code) });
}

function decisionHorizonMs(policy?: GenesisT8TemporalPolicy): number | null {
  const value = policy?.decisionHorizonMs;
  if (value == null) return null;
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error("GENESIS_T8_CE2_R3_VIOLATION:DECISION_HORIZON");
  }
  return value;
}

export function assertTemporalIntervalInvariant(interval: GenesisT8TemporalInterval): void {
  const from = nullableInstant(interval.validFrom, "VALID_FROM");
  const to = nullableInstant(interval.validTo, "VALID_TO");
  if (from.ms != null && to.ms != null && from.ms > to.ms) {
    throw new Error("GENESIS_T8_CE2_R3_VIOLATION:INVERTED_INTERVAL");
  }
}

export function evaluateTemporalState(input: GenesisT8TemporalAssessmentInput): GenesisT8TemporalAssessment {
  assertCanonicalId(input.subjectId);
  assertTemporalIntervalInvariant(input.interval);
  const referenceMs = instantMs(input.referenceTime, "REFERENCE_TIME");
  const from = nullableInstant(input.interval.validFrom, "VALID_FROM");
  const to = nullableInstant(input.interval.validTo, "VALID_TO");
  const horizon = decisionHorizonMs(input.policy);

  let state: GenesisT8TemporalState;
  if (from.ms == null && to.ms == null) state = "TIME_UNBOUNDED";
  else if (from.ms != null && referenceMs < from.ms) state = "NOT_YET_ACTIVE";
  else if (to.ms != null && referenceMs > to.ms) state = "EXPIRED";
  else if (to.ms != null && horizon != null && to.ms - referenceMs <= horizon) state = "EXPIRING";
  else state = "ACTIVE";

  const ageClass: GenesisT8TemporalAgeClass =
    state === "NOT_YET_ACTIVE" ? "PRE_ACTIVE" :
    state === "EXPIRING" ? "ACTIVE_WITHIN_DECISION_HORIZON" :
    state === "EXPIRED" ? "POST_EXPIRY" :
    state === "TIME_UNBOUNDED" ? "UNBOUNDED" :
    "ACTIVE_CURRENT";

  const commercialPermission: GenesisT8TemporalCommercialPermission =
    state === "NOT_YET_ACTIVE" ? "BLOCKED_UNTIL_ACTIVE" :
    state === "EXPIRING" ? "MAY_PROCEED_WITH_TIME_PRESSURE" :
    state === "EXPIRED" ? "NO_LONGER_CURRENT" :
    state === "TIME_UNBOUNDED" ? "MAY_PROCEED_TIME_UNBOUNDED" :
    "MAY_PROCEED";

  const epistemicTemporalValidity: GenesisT8EpistemicTemporalValidity =
    state === "EXPIRED" ? "EXPIRED" :
    state === "TIME_UNBOUNDED" ? "UNASSESSED" :
    "CURRENT";

  const elapsedSinceActivationMs = from.ms == null || referenceMs < from.ms ? null : referenceMs - from.ms;
  const remainingUntilActivationMs = from.ms == null || referenceMs >= from.ms ? null : from.ms - referenceMs;
  const remainingUntilExpiryMs = to.ms == null || referenceMs > to.ms ? null : to.ms - referenceMs;

  const deterministicReasons = Object.freeze([
    `TEMPORAL_STATE:${state}`,
    `AGE_CLASS:${ageClass}`,
    `COMMERCIAL_PERMISSION:${commercialPermission}`,
    `EPISTEMIC_TEMPORAL_VALIDITY:${epistemicTemporalValidity}`,
    `VALID_FROM:${from.value ?? "UNBOUNDED"}`,
    `VALID_TO:${to.value ?? "UNBOUNDED"}`,
    `REFERENCE_TIME:${input.referenceTime}`,
    `DECISION_HORIZON_MS:${horizon ?? "NONE"}`,
  ]);

  return Object.freeze({
    subjectId: input.subjectId,
    referenceTime: input.referenceTime,
    interval: Object.freeze({ validFrom: from.value, validTo: to.value }),
    state,
    ageClass,
    commercialPermission,
    epistemicTemporalValidity,
    elapsedSinceActivationMs,
    remainingUntilActivationMs,
    remainingUntilExpiryMs,
    decisionHorizonMs: horizon,
    deterministicReasons,
  });
}

export function qualifyCommercialRealityTemporally(
  reality: GenesisT8CommercialReality,
  input: Omit<GenesisT8TemporalAssessmentInput, "subjectId">,
): GenesisT8TemporallyQualifiedCommercialReality {
  assertCommercialRealityInvariant(reality);
  const temporal = evaluateTemporalState({ ...input, subjectId: reality.realityId });
  return Object.freeze({ reality, temporal });
}

function closedIntervalMs(interval: GenesisT8ClosedTemporalInterval, side: "A" | "B"): Readonly<{ start: number; end: number }> {
  const start = instantMs(interval.start, `${side}_START`);
  const end = instantMs(interval.end, `${side}_END`);
  if (start > end) throw new Error(`GENESIS_T8_CE2_R3_VIOLATION:${side}_INVERTED_INTERVAL`);
  return Object.freeze({ start, end });
}

/** Deterministic closed-interval relation for dependency/route reasoning. */
export function temporalIntervalRelation(
  a: GenesisT8ClosedTemporalInterval,
  b: GenesisT8ClosedTemporalInterval,
): GenesisT8TemporalIntervalRelation {
  const A = closedIntervalMs(a, "A");
  const B = closedIntervalMs(b, "B");
  if (A.end < B.start) return "BEFORE";
  if (A.end === B.start && A.start < B.start) return "MEETS";
  if (A.start > B.end) return "AFTER";
  if (A.start === B.end && A.end > B.end) return "MET_BY";
  if (A.start === B.start && A.end === B.end) return "EQUALS";
  if (A.start === B.start && A.end < B.end) return "STARTS";
  if (A.start === B.start && A.end > B.end) return "STARTED_BY";
  if (A.end === B.end && A.start > B.start) return "FINISHES";
  if (A.end === B.end && A.start < B.start) return "FINISHED_BY";
  if (A.start > B.start && A.end < B.end) return "DURING";
  if (A.start < B.start && A.end > B.end) return "CONTAINS";
  if (A.start < B.start && A.end > B.start && A.end < B.end) return "OVERLAPS";
  return "OVERLAPPED_BY";
}

export const GENESIS_T8_CE2_R3_TEMPORAL_LAWS = Object.freeze([
  "TIME_IS_A_FIRST_CLASS_DETERMINISTIC_AXIS_OF_COMMERCIAL_REALITY",
  "TEMPORAL_MATHEMATICS_NEVER_CHANGES_TRUTH_INDEX_PROBABILITY_OR_CONFIDENCE",
  "NO_EXPONENTIAL_LINEAR_OR_HIDDEN_DECAY_FUNCTION_IS_PERMITTED",
  "EXPIRING_EXISTS_ONLY_RELATIVE_TO_AN_EXPLICIT_DECISION_HORIZON",
  "NO_DEFAULT_DECISION_HORIZON_IS_INVENTED_BY_CE2_R3",
  "VALIDITY_INTERVALS_ARE_EXPLICIT_AND_RFC3339_QUALIFIED",
  "NOT_YET_ACTIVE_AND_EXPIRED_ARE_DISTINCT_COMMERCIAL_TEMPORAL_STATES",
  "TIME_UNBOUNDED_IS_NOT_EQUIVALENT_TO_CURRENT_VERIFIED_FRESHNESS",
  "EXPIRED_TEMPORAL_STATE_MAPS_TO_EXPIRED_EPISTEMIC_TEMPORAL_VALIDITY",
  "TEMPORAL_QUALIFICATION_DOES_NOT_MUTATE_FROZEN_UDOSIB_COMMERCIAL_COHERENCE",
  "TEMPORAL_INTERVAL_RELATIONS_ARE_DETERMINISTIC_AND_WEIGHT_FREE",
  "CE2_R3_DOES_NOT_RANK_OPPORTUNITIES_ROUTES_CONTACTS_OR_RESEARCH",
] as const);
