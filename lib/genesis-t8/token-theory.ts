/** Genesis T8 Commercial Token Theory v1.1 — CE-R1 Build 7 hardening. */
import { assertAuthorisedTruthAuthority } from "./authority-registry";
import { assertCanonicalValue, assertTemporalInterval, isIsoDateTime, stableFingerprint } from "./canonical-runtime";

export const GENESIS_T8_TOKEN_THEORY_VERSION = "1.1.0" as const;
export const GENESIS_T8_CE_TOKEN_THEORY_BUILD = "BUILD2" as const;

export const GENESIS_T8_TOKEN_KINDS = Object.freeze(["IDENTITY","CLASSIFICATION","CAPABILITY","STATE","QUANTITY","BEHAVIOUR","EVENT","CONSTRAINT","SIGNAL"] as const);
export type GenesisT8TokenKind = (typeof GENESIS_T8_TOKEN_KINDS)[number];
export const GENESIS_T8_TOKEN_MUTABILITIES = Object.freeze(["IMMUTABLE","VERY_STABLE","STABLE","DYNAMIC","HIGHLY_DYNAMIC","EVENT_BOUND"] as const);
export type GenesisT8TokenMutability = (typeof GENESIS_T8_TOKEN_MUTABILITIES)[number];
export const GENESIS_T8_TOKEN_LIFECYCLE_STATES = Object.freeze(["DISCOVERED","CANONICALISED","HARD_VALIDATED","TRUTH_QUALIFIED","ACTIVE","SUPERSEDED","RETIRED"] as const);
export type GenesisT8TokenLifecycleState = (typeof GENESIS_T8_TOKEN_LIFECYCLE_STATES)[number];
export const GENESIS_T8_CANONICAL_VALUE_TYPES = Object.freeze(["BOOLEAN","TEXT","ENUM","INTEGER","DECIMAL","MONEY","PERCENTAGE","DATE","DATETIME","DURATION","URL","DOMAIN","COUNTRY","REGION","ENTITY_REF","TOKEN_REF"] as const);
export type GenesisT8CanonicalValueType = (typeof GENESIS_T8_CANONICAL_VALUE_TYPES)[number];

export type GenesisT8TokenProvenance = Readonly<{
  evidenceIds: readonly string[];
  discoveredBy: "AI" | "DETERMINISTIC_IMPORT" | "HUMAN";
  discoveryRunId?: string;
}>;

export type GenesisT8TruthQualification = Readonly<{
  probability: number;
  confidence: number;
  coverage: number;
  assessedAt: string;
  truthAuthorityId: string;
  engineVersion: string;
  /** @deprecated compatibility marker for the frozen initial authority; new authorities need not emit it. */
  truthEngineVersion?: "TI-2.1.8";
}>;

export type GenesisT8CommercialToken = Readonly<{
  tokenId: string;
  subjectEntityId: string;
  predicate: string;
  predicateDefinitionFingerprint: string;
  kind: GenesisT8TokenKind;
  valueType: GenesisT8CanonicalValueType;
  value: unknown;
  canonicalValue: string;
  mutability: GenesisT8TokenMutability;
  lifecycle: GenesisT8TokenLifecycleState;
  validFrom?: string;
  validTo?: string;
  observedAt?: string;
  supersededByTokenId?: string;
  provenance: GenesisT8TokenProvenance;
  truth?: GenesisT8TruthQualification;
}>;

export type GenesisT8TokenRelation = Readonly<{
  relationId: string;
  fromTokenId: string;
  toTokenId: string;
  relationType: string;
  provenance: GenesisT8TokenProvenance;
}>;

export const GENESIS_T8_TOKEN_LIFECYCLE = Object.freeze({
  DISCOVERED: ["CANONICALISED", "RETIRED"] as const,
  CANONICALISED: ["HARD_VALIDATED", "RETIRED"] as const,
  HARD_VALIDATED: ["TRUTH_QUALIFIED", "RETIRED"] as const,
  TRUTH_QUALIFIED: ["ACTIVE", "RETIRED"] as const,
  ACTIVE: ["SUPERSEDED", "RETIRED"] as const,
  SUPERSEDED: ["RETIRED"] as const,
  RETIRED: [] as const,
} satisfies Record<GenesisT8TokenLifecycleState, readonly GenesisT8TokenLifecycleState[]>);

export const GENESIS_T8_TOKEN_LAWS = Object.freeze([
  "ONE_TOKEN_ONE_ATOMIC_ASSERTION","ONE_TOKEN_ONE_SUBJECT","TOKEN_VALUE_IS_CANONICAL_NOT_NARRATIVE","TOKEN_IDENTITY_IS_SEPARATE_FROM_EVIDENCE","AI_MAY_DISCOVER_AND_CANONICALISE_BUT_NOT_ASSIGN_TRUTH","TI_2_1_8_IS_SOLE_TRUTH_QUALIFIER","EVIDENCE_IS_REFERENCED_NOT_EMBEDDED_AS_REASONING","RELATIONSHIPS_ARE_FIRST_CLASS_NOT_HIDDEN_IN_VALUES","MISSING_KNOWLEDGE_IS_ABSENCE_NOT_A_NEGATIVE_TOKEN","CONTRADICTION_IS_EXPLICIT_KNOWLEDGE_NOT_STRING_OVERWRITE","CURRENT_STATE_NEVER_DESTROYS_HISTORY","SUPERSESSION_REPLACES_AUTHORITY_NOT_PROVENANCE","TOKENS_STORE_FACTS_NOT_MATCH_OR_OPPORTUNITY_SCORES","DIMENSIONAL_POSITION_BELONGS_TO_THE_GRAPH_NOT_TOKEN_IDENTITY",
  "OBJECT_ID_IS_NOT_SEMANTIC_IDENTITY","CANONICAL_VALUES_ARE_TYPE_VALIDATED","QUALIFIED_TRUTH_REQUIRES_AUTHORISED_TRUTH_AUTHORITY"
] as const);
export type GenesisT8TokenLaw = (typeof GENESIS_T8_TOKEN_LAWS)[number];

export function canonicalTokenIdentityKey(token: Pick<GenesisT8CommercialToken,"subjectEntityId"|"predicate"|"canonicalValue"|"validFrom"|"validTo">): string {
  return stableFingerprint([token.subjectEntityId.trim(), token.predicate.trim().toLowerCase(), token.canonicalValue, token.validFrom ?? "", token.validTo ?? ""]);
}

export function canTransitionTokenLifecycle(from: GenesisT8TokenLifecycleState, to: GenesisT8TokenLifecycleState): boolean {
  if (!GENESIS_T8_TOKEN_LIFECYCLE_STATES.includes(from) || !GENESIS_T8_TOKEN_LIFECYCLE_STATES.includes(to)) return false;
  return GENESIS_T8_TOKEN_LIFECYCLE[from].includes(to as never);
}

export function assertTokenProvenanceInvariant(provenance: GenesisT8TokenProvenance): void {
  if (!provenance || !["AI","DETERMINISTIC_IMPORT","HUMAN"].includes(provenance.discoveredBy)) throw new Error("GENESIS_T8_TOKEN_VIOLATION:PROVENANCE_SOURCE");
  if (provenance.evidenceIds.some((id) => typeof id !== "string" || !id.trim())) throw new Error("GENESIS_T8_TOKEN_VIOLATION:BLANK_EVIDENCE_ID");
  if (new Set(provenance.evidenceIds).size !== provenance.evidenceIds.length) throw new Error("GENESIS_T8_TOKEN_VIOLATION:DUPLICATE_EVIDENCE_ID");
  if (provenance.discoveredBy === "AI" && !provenance.evidenceIds.length) throw new Error("GENESIS_T8_TOKEN_VIOLATION:AI_DISCOVERY_REQUIRES_EVIDENCE_REFERENCE");
}

export function assertCommercialTokenInvariant(token: GenesisT8CommercialToken): void {
  if (!token.tokenId?.trim()) throw new Error("GENESIS_T8_TOKEN_VIOLATION:TOKEN_ID_REQUIRED");
  if (!token.subjectEntityId?.trim()) throw new Error("GENESIS_T8_TOKEN_VIOLATION:SUBJECT_REQUIRED");
  if (!/^gen:[a-z0-9][a-z0-9:_-]{5,}$/i.test(token.subjectEntityId)) throw new Error("GENESIS_T8_TOKEN_VIOLATION:GLOBAL_SUBJECT_ID_REQUIRED");
  if (!token.predicate?.trim()) throw new Error("GENESIS_T8_TOKEN_VIOLATION:PREDICATE_REQUIRED");
  if (!token.predicateDefinitionFingerprint?.trim()) throw new Error("GENESIS_T8_TOKEN_VIOLATION:PREDICATE_DEFINITION_FINGERPRINT_REQUIRED");
  if (!GENESIS_T8_TOKEN_KINDS.includes(token.kind)) throw new Error("GENESIS_T8_TOKEN_VIOLATION:KIND");
  if (!GENESIS_T8_CANONICAL_VALUE_TYPES.includes(token.valueType)) throw new Error("GENESIS_T8_TOKEN_VIOLATION:VALUE_TYPE");
  if (!GENESIS_T8_TOKEN_MUTABILITIES.includes(token.mutability)) throw new Error("GENESIS_T8_TOKEN_VIOLATION:MUTABILITY");
  if (!GENESIS_T8_TOKEN_LIFECYCLE_STATES.includes(token.lifecycle)) throw new Error("GENESIS_T8_TOKEN_VIOLATION:LIFECYCLE");
  if (!token.canonicalValue?.trim()) throw new Error("GENESIS_T8_TOKEN_VIOLATION:CANONICAL_VALUE_REQUIRED");
  assertCanonicalValue(token.valueType, token.value, token.canonicalValue);
  assertTemporalInterval(token.validFrom, token.validTo);
  if (token.observedAt && !isIsoDateTime(token.observedAt)) throw new Error("GENESIS_T8_TOKEN_VIOLATION:OBSERVED_AT");
  assertTokenProvenanceInvariant(token.provenance);
  if (token.lifecycle === "DISCOVERED" && token.truth) throw new Error("GENESIS_T8_TOKEN_VIOLATION:DISCOVERED_TOKEN_CANNOT_HAVE_TRUTH");
  if (["TRUTH_QUALIFIED","ACTIVE","SUPERSEDED"].includes(token.lifecycle) && !token.truth) throw new Error("GENESIS_T8_TOKEN_VIOLATION:QUALIFIED_STATE_REQUIRES_TI_OUTPUT");
  if (token.lifecycle === "SUPERSEDED" && !token.supersededByTokenId?.trim()) throw new Error("GENESIS_T8_TOKEN_VIOLATION:SUPERSEDED_REQUIRES_SUCCESSOR");
  if (token.supersededByTokenId === token.tokenId) throw new Error("GENESIS_T8_TOKEN_VIOLATION:SELF_SUPERSESSION");
  if (token.truth) {
    const authority = assertAuthorisedTruthAuthority(token.truth.truthAuthorityId);
    if (authority.engineVersion !== token.truth.engineVersion) throw new Error("GENESIS_T8_TOKEN_VIOLATION:TRUTH_ENGINE_VERSION");
    if (!isIsoDateTime(token.truth.assessedAt)) throw new Error("GENESIS_T8_TOKEN_VIOLATION:TRUTH_ASSESSED_AT");
    for (const value of [token.truth.probability, token.truth.confidence, token.truth.coverage]) if (!Number.isFinite(value) || value < 0 || value > 1) throw new Error("GENESIS_T8_TOKEN_VIOLATION:TRUTH_BOUND");
  }
}

export function assertTokenRelationInvariant(relation: GenesisT8TokenRelation): void {
  if (!relation.relationId?.trim()) throw new Error("GENESIS_T8_RELATION_VIOLATION:RELATION_ID_REQUIRED");
  if (!relation.fromTokenId?.trim() || !relation.toTokenId?.trim()) throw new Error("GENESIS_T8_RELATION_VIOLATION:ENDPOINT_REQUIRED");
  if (relation.fromTokenId === relation.toTokenId) throw new Error("GENESIS_T8_RELATION_VIOLATION:SELF_RELATION_REQUIRES_EXPLICIT_FUTURE_SEMANTICS");
  if (!relation.relationType?.trim()) throw new Error("GENESIS_T8_RELATION_VIOLATION:TYPE_REQUIRED");
  assertTokenProvenanceInvariant(relation.provenance);
}
