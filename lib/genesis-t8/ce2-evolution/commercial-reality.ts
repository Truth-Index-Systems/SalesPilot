/**
 * Genesis T8 CE2 Evolution R1 — Commercial Reality Mathematics.
 *
 * Additive post-freeze evolution over UDOSIB 1.0.0. The frozen CE-R2 kernel is
 * consumed read-only. This layer gives the commercial reality that UDOSIB was
 * already evaluating a deterministic identity, lifecycle and projection
 * boundary. Opportunity remains a projection of reality, never its source.
 */
import {
  assertCommercialCoherenceStateInvariant,
  assertOpportunityRealisationInvariant,
  type GenesisT8CommercialCoherenceState,
  type GenesisT8OpportunityRealisation,
} from "../mathematics/commercial-coherence";
import type { GenesisT8OpportunityCandidate } from "../mathematics/opportunity-mathematics";

export const GENESIS_T8_CE2_EVOLUTION_R1_VERSION = "1.0.0" as const;
export const GENESIS_T8_CE2_EVOLUTION_R1_BUILD = "CE2-R1" as const;

export type GenesisT8CommercialRealityIdentity = Readonly<{
  sellerEntityId: string;
  offeringEntityId: string;
  targetEntityId: string;
  commercialObjectiveId: string;
}>;

export const GENESIS_T8_COMMERCIAL_REALITY_LIFECYCLE_STATES = Object.freeze([
  "EMERGING",
  "ESTABLISHED",
  "CHANGING",
  "RESOLVED",
] as const);
export type GenesisT8CommercialRealityLifecycleState = (typeof GENESIS_T8_COMMERCIAL_REALITY_LIFECYCLE_STATES)[number];

export type GenesisT8CommercialRealityStateReason =
  | "VIABILITY_NOT_YET_RESOLVED"
  | "SURVIVING_REALITY_ESTABLISHED"
  | "CANONICAL_STATE_CHANGED"
  | "COMMERCIAL_REALITY_ELIMINATED";

export type GenesisT8CommercialRealityTrace = Readonly<{
  stateReason: GenesisT8CommercialRealityStateReason;
  governingConstraintIds: readonly string[];
  supportingEvidenceTokenIds: readonly string[];
  nearestFailureBoundaryConstraintIds: readonly string[];
  deterministicRules: readonly string[];
}>;

export type GenesisT8CommercialReality = Readonly<{
  realityId: string;
  identity: GenesisT8CommercialRealityIdentity;
  lifecycleState: GenesisT8CommercialRealityLifecycleState;
  commercial: GenesisT8CommercialCoherenceState;
  governingConstraintIds: readonly string[];
  supportingEvidenceTokenIds: readonly string[];
  mathematicalFingerprint: string;
  trace: GenesisT8CommercialRealityTrace;
}>;

export type GenesisT8CommercialRealityInput = Readonly<{
  identity: GenesisT8CommercialRealityIdentity;
  commercial: GenesisT8CommercialCoherenceState;
  governingConstraintIds: readonly string[];
  supportingEvidenceTokenIds?: readonly string[];
  previousReality?: GenesisT8CommercialReality;
}>;

export type GenesisT8OpportunityProjectionInput = Readonly<{
  opportunityId: string;
  realisation: GenesisT8OpportunityRealisation;
}>;

const FORBIDDEN_NUMERIC_AUTHORITY_FIELDS = Object.freeze([
  "score",
  "weight",
  "importance",
  "priorityWeight",
  "rankingWeight",
  "probability",
] as const);

function assertCanonicalId(value: string, code: string): void {
  if (typeof value !== "string" || !value.trim() || value !== value.trim()) {
    throw new Error(`GENESIS_T8_CE2_R1_VIOLATION:${code}`);
  }
}

function assertNoForbiddenAuthorityFields(value: object, scope: string): void {
  for (const field of FORBIDDEN_NUMERIC_AUTHORITY_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(value, field)) {
      throw new Error(`GENESIS_T8_CE2_R1_VIOLATION:FORBIDDEN_AUTHORITY_FIELD:${scope}:${field}`);
    }
  }
}

function canonicalIdSet(values: readonly string[], code: string): readonly string[] {
  const result = [...values];
  for (const value of result) assertCanonicalId(value, code);
  if (new Set(result).size !== result.length) throw new Error(`GENESIS_T8_CE2_R1_VIOLATION:DUPLICATE_${code}`);
  return Object.freeze(result.sort((a, b) => a.localeCompare(b)));
}

export function assertCommercialRealityIdentityInvariant(identity: GenesisT8CommercialRealityIdentity): void {
  assertNoForbiddenAuthorityFields(identity as object, "IDENTITY");
  assertCanonicalId(identity.sellerEntityId, "SELLER_ENTITY_ID");
  assertCanonicalId(identity.offeringEntityId, "OFFERING_ENTITY_ID");
  assertCanonicalId(identity.targetEntityId, "TARGET_ENTITY_ID");
  assertCanonicalId(identity.commercialObjectiveId, "COMMERCIAL_OBJECTIVE_ID");
}

function encodeIdentityPart(value: string): string {
  return encodeURIComponent(value);
}

/** Identity is semantic and time-independent. The same reality keeps this ID as its state evolves. */
export function commercialRealityId(identity: GenesisT8CommercialRealityIdentity): string {
  assertCommercialRealityIdentityInvariant(identity);
  return [
    "genesis-t8",
    "commercial-reality",
    "v1",
    encodeIdentityPart(identity.sellerEntityId),
    encodeIdentityPart(identity.offeringEntityId),
    encodeIdentityPart(identity.targetEntityId),
    encodeIdentityPart(identity.commercialObjectiveId),
  ].join(":");
}

function commercialCanonicalState(commercial: GenesisT8CommercialCoherenceState): string {
  assertCommercialCoherenceStateInvariant(commercial);
  const channels = commercial.knowledgeChannels;
  const dimensions = [...commercial.dimensions]
    .sort((a, b) => a.dimension.localeCompare(b.dimension))
    .map((dimension) => [
      dimension.dimension,
      dimension.support,
      dimension.pressure,
      dimension.coherence,
      [...dimension.contributingConstraintIds].sort((a, b) => a.localeCompare(b)),
    ]);
  return JSON.stringify([
    commercial.viability,
    commercial.commercialCoherence,
    commercial.constraintPressure,
    commercial.commercialStability,
    commercial.knowledgeSufficiency,
    channels ? [channels.viability, channels.stability, channels.enrichment] : null,
    commercial.reasoningConfidence,
    dimensions,
    [...commercial.nearestFailureBoundaryConstraintIds].sort((a, b) => a.localeCompare(b)),
  ]);
}

/**
 * Dependency-free FNV-1a 64-bit fingerprint. This is an integrity/equality
 * fingerprint, not truth, confidence or commercial scoring mathematics.
 */
function fingerprintCanonicalText(text: string): string {
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= BigInt(text.charCodeAt(i));
    hash = (hash * prime) & mask;
  }
  return hash.toString(16).padStart(16, "0");
}

export function commercialRealityFingerprint(
  identity: GenesisT8CommercialRealityIdentity,
  commercial: GenesisT8CommercialCoherenceState,
  governingConstraintIds: readonly string[],
  supportingEvidenceTokenIds: readonly string[] = [],
): string {
  assertCommercialRealityIdentityInvariant(identity);
  const constraints = canonicalIdSet(governingConstraintIds, "GOVERNING_CONSTRAINT_ID");
  const evidence = canonicalIdSet(supportingEvidenceTokenIds, "SUPPORTING_EVIDENCE_TOKEN_ID");
  return fingerprintCanonicalText(JSON.stringify([
    commercialRealityId(identity),
    commercialCanonicalState(commercial),
    constraints,
    evidence,
  ]));
}

function lifecycleFor(
  commercial: GenesisT8CommercialCoherenceState,
  currentFingerprint: string,
  previousReality?: GenesisT8CommercialReality,
): Readonly<{ state: GenesisT8CommercialRealityLifecycleState; reason: GenesisT8CommercialRealityStateReason }> {
  if (commercial.viability === "ELIMINATED") {
    return Object.freeze({ state: "RESOLVED", reason: "COMMERCIAL_REALITY_ELIMINATED" });
  }
  if (previousReality && previousReality.mathematicalFingerprint !== currentFingerprint) {
    return Object.freeze({ state: "CHANGING", reason: "CANONICAL_STATE_CHANGED" });
  }
  if (commercial.viability === "UNRESOLVED") {
    return Object.freeze({ state: "EMERGING", reason: "VIABILITY_NOT_YET_RESOLVED" });
  }
  return Object.freeze({ state: "ESTABLISHED", reason: "SURVIVING_REALITY_ESTABLISHED" });
}

export function assertCommercialRealityInvariant(reality: GenesisT8CommercialReality): void {
  assertNoForbiddenAuthorityFields(reality as object, "REALITY");
  assertCommercialRealityIdentityInvariant(reality.identity);
  assertCommercialCoherenceStateInvariant(reality.commercial);
  if (reality.realityId !== commercialRealityId(reality.identity)) throw new Error("GENESIS_T8_CE2_R1_VIOLATION:REALITY_IDENTITY_MISMATCH");
  if (!GENESIS_T8_COMMERCIAL_REALITY_LIFECYCLE_STATES.includes(reality.lifecycleState)) throw new Error("GENESIS_T8_CE2_R1_VIOLATION:LIFECYCLE_STATE");
  const constraints = canonicalIdSet(reality.governingConstraintIds, "GOVERNING_CONSTRAINT_ID");
  const evidence = canonicalIdSet(reality.supportingEvidenceTokenIds, "SUPPORTING_EVIDENCE_TOKEN_ID");
  if (constraints.join("\u0000") !== reality.governingConstraintIds.join("\u0000")) throw new Error("GENESIS_T8_CE2_R1_VIOLATION:CONSTRAINT_ORDER");
  if (evidence.join("\u0000") !== reality.supportingEvidenceTokenIds.join("\u0000")) throw new Error("GENESIS_T8_CE2_R1_VIOLATION:EVIDENCE_ORDER");
  const expectedFingerprint = commercialRealityFingerprint(reality.identity, reality.commercial, constraints, evidence);
  if (expectedFingerprint !== reality.mathematicalFingerprint) throw new Error("GENESIS_T8_CE2_R1_VIOLATION:FINGERPRINT_MISMATCH");
  if (reality.lifecycleState === "ESTABLISHED" && reality.commercial.viability !== "SURVIVES") throw new Error("GENESIS_T8_CE2_R1_VIOLATION:ESTABLISHED_REQUIRES_SURVIVAL");
  if (reality.lifecycleState === "RESOLVED" && reality.commercial.viability !== "ELIMINATED") throw new Error("GENESIS_T8_CE2_R1_VIOLATION:RESOLVED_REQUIRES_ELIMINATION");
  if (reality.trace.governingConstraintIds.join("\u0000") !== reality.governingConstraintIds.join("\u0000")) throw new Error("GENESIS_T8_CE2_R1_VIOLATION:TRACE_CONSTRAINT_MISMATCH");
  if (reality.trace.supportingEvidenceTokenIds.join("\u0000") !== reality.supportingEvidenceTokenIds.join("\u0000")) throw new Error("GENESIS_T8_CE2_R1_VIOLATION:TRACE_EVIDENCE_MISMATCH");
}

export function evaluateCommercialReality(input: GenesisT8CommercialRealityInput): GenesisT8CommercialReality {
  assertNoForbiddenAuthorityFields(input as object, "INPUT");
  assertCommercialRealityIdentityInvariant(input.identity);
  assertCommercialCoherenceStateInvariant(input.commercial);
  const governingConstraintIds = canonicalIdSet(input.governingConstraintIds, "GOVERNING_CONSTRAINT_ID");
  if (!governingConstraintIds.length) throw new Error("GENESIS_T8_CE2_R1_VIOLATION:COMMERCIAL_REALITY_REQUIRES_GOVERNING_CONSTRAINT");
  const supportingEvidenceTokenIds = canonicalIdSet(input.supportingEvidenceTokenIds ?? [], "SUPPORTING_EVIDENCE_TOKEN_ID");
  const realityId = commercialRealityId(input.identity);

  if (input.previousReality) {
    assertCommercialRealityInvariant(input.previousReality);
    if (input.previousReality.realityId !== realityId) throw new Error("GENESIS_T8_CE2_R1_VIOLATION:PREVIOUS_REALITY_IDENTITY_MISMATCH");
  }

  const mathematicalFingerprint = commercialRealityFingerprint(input.identity, input.commercial, governingConstraintIds, supportingEvidenceTokenIds);
  const lifecycle = lifecycleFor(input.commercial, mathematicalFingerprint, input.previousReality);
  const deterministicRules = Object.freeze([
    "REALITY_ID_DERIVES_ONLY_FROM_CANONICAL_PARTICIPANTS_AND_COMMERCIAL_OBJECTIVE",
    "COMMERCIAL_STATE_IS_CONSUMED_FROM_FROZEN_UDOSIB_1_0_0",
    "OPPORTUNITY_DOES_NOT_CREATE_COMMERCIAL_REALITY",
    "ESTABLISHED_REQUIRES_SURVIVING_COMMERCIAL_COHERENCE",
    "ELIMINATED_COMMERCIAL_REALITY_IS_RESOLVED",
    "CANONICAL_STATE_CHANGE_IS_DETECTED_BY_DETERMINISTIC_FINGERPRINT",
  ] as const);

  const reality = Object.freeze({
    realityId,
    identity: Object.freeze({ ...input.identity }),
    lifecycleState: lifecycle.state,
    commercial: input.commercial,
    governingConstraintIds,
    supportingEvidenceTokenIds,
    mathematicalFingerprint,
    trace: Object.freeze({
      stateReason: lifecycle.reason,
      governingConstraintIds,
      supportingEvidenceTokenIds,
      nearestFailureBoundaryConstraintIds: Object.freeze([...input.commercial.nearestFailureBoundaryConstraintIds].sort((a, b) => a.localeCompare(b))),
      deterministicRules,
    }),
  } satisfies GenesisT8CommercialReality);
  assertCommercialRealityInvariant(reality);
  return reality;
}

/**
 * Compatibility projection. R1 intentionally does not alter R4/R5 realisation
 * or ranking. It proves that the legacy opportunity candidate is downstream of
 * a first-class Commercial Reality with an identical commercial state.
 */
export function projectOpportunityFromCommercialReality(
  reality: GenesisT8CommercialReality,
  input: GenesisT8OpportunityProjectionInput,
): GenesisT8OpportunityCandidate {
  assertCommercialRealityInvariant(reality);
  assertOpportunityRealisationInvariant(input.realisation);
  assertCanonicalId(input.opportunityId, "OPPORTUNITY_ID");
  if (commercialCanonicalState(input.realisation.commercial) !== commercialCanonicalState(reality.commercial)) {
    throw new Error("GENESIS_T8_CE2_R1_VIOLATION:OPPORTUNITY_PROJECTION_COMMERCIAL_STATE_MISMATCH");
  }
  return Object.freeze({
    opportunityId: input.opportunityId,
    targetEntityId: reality.identity.targetEntityId,
    realisation: input.realisation,
  });
}

export const GENESIS_T8_CE2_R1_COMMERCIAL_REALITY_LAWS = Object.freeze([
  "COMMERCIAL_REALITY_IS_PRIMARY_OPPORTUNITY_IS_A_PROJECTION",
  "COMMERCIAL_REALITY_IDENTITY_IS_DETERMINISTIC_AND_TIME_INDEPENDENT",
  "COMMERCIAL_OBJECTIVE_IS_REQUIRED_FOR_REALITY_IDENTITY",
  "COMMERCIAL_REALITY_REQUIRES_AT_LEAST_ONE_GOVERNING_CONSTRAINT",
  "FROZEN_UDOSIB_1_0_0_IS_CONSUMED_READ_ONLY",
  "NO_AI_NUMERIC_AUTHORITY_IS_ACCEPTED",
  "NO_OPPORTUNITY_RANKING_IS_IMPLEMENTED_IN_R1",
  "ESTABLISHED_REALITY_REQUIRES_SURVIVING_COHERENCE",
  "CHANGING_MEANS_CANONICAL_STATE_CHANGED_FOR_THE_SAME_REALITY_IDENTITY",
  "RESOLVED_MEANS_FROZEN_UDOSIB_ELIMINATED_THE_COMMERCIAL_REALITY",
  "OPPORTUNITY_PROJECTION_MUST_PRESERVE_THE_REALITY_COMMERCIAL_STATE_EXACTLY",
  "EVERY_REALITY_STATE_EXPOSES_A_DETERMINISTIC_TRACE",
] as const);
