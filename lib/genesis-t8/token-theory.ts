/**
 * Genesis T8 Commercial Token Theory v1.0
 *
 * CE Release 1 / Build 2
 *
 * This module defines the canonical atomic knowledge unit used by Genesis T8.
 * It is intentionally persistence- and application-agnostic. Build 3 will place
 * these tokens inside the 9D Commercial Graph; this build only defines what a
 * token is, what it is not, and the invariants it must obey.
 */

export const GENESIS_T8_TOKEN_THEORY_VERSION = "1.0.0" as const;
export const GENESIS_T8_CE_BUILD = "BUILD2" as const;

/** A token is always an atomic assertion about one subject. */
export type GenesisT8TokenKind =
  | "IDENTITY"
  | "CLASSIFICATION"
  | "CAPABILITY"
  | "STATE"
  | "QUANTITY"
  | "BEHAVIOUR"
  | "EVENT"
  | "CONSTRAINT"
  | "SIGNAL";

/**
 * Mutability describes how intrinsically changeable the represented reality is.
 * It is not itself a refresh schedule. Refresh policy is derived later.
 */
export type GenesisT8TokenMutability =
  | "IMMUTABLE"
  | "VERY_STABLE"
  | "STABLE"
  | "DYNAMIC"
  | "HIGHLY_DYNAMIC"
  | "EVENT_BOUND";

export type GenesisT8TokenLifecycleState =
  | "DISCOVERED"
  | "CANONICALISED"
  | "HARD_VALIDATED"
  | "TRUTH_QUALIFIED"
  | "ACTIVE"
  | "SUPERSEDED"
  | "RETIRED";

export type GenesisT8CanonicalValueType =
  | "BOOLEAN"
  | "TEXT"
  | "ENUM"
  | "INTEGER"
  | "DECIMAL"
  | "MONEY"
  | "PERCENTAGE"
  | "DATE"
  | "DATETIME"
  | "DURATION"
  | "URL"
  | "DOMAIN"
  | "COUNTRY"
  | "REGION"
  | "ENTITY_REF"
  | "TOKEN_REF";

export type GenesisT8TokenProvenance = Readonly<{
  /** Identifiers only. Evidence content remains owned by the evidence/truth layer. */
  evidenceIds: readonly string[];
  discoveredBy: "AI" | "DETERMINISTIC_IMPORT" | "HUMAN";
  discoveryRunId?: string;
}>;

/**
 * The atomic unit carried into the future Commercial Token Graph.
 *
 * `predicate` is a stable ontology identifier, e.g. `operations.has_warehouse`.
 * `value` is the canonical value, never an explanation or recommendation.
 * Truth outputs are attached only after TI qualification and must never be
 * invented by AI or by the token contract itself.
 */
export type GenesisT8CommercialToken = Readonly<{
  tokenId: string;
  subjectEntityId: string;
  predicate: string;
  kind: GenesisT8TokenKind;
  valueType: GenesisT8CanonicalValueType;
  value: unknown;
  canonicalValue: string;
  mutability: GenesisT8TokenMutability;
  lifecycle: GenesisT8TokenLifecycleState;
  validFrom?: string;
  validTo?: string;
  observedAt?: string;
  provenance: GenesisT8TokenProvenance;
  /** Present only once the existing TI-2.1.8 engine has qualified the assertion. */
  truth?: Readonly<{
    probability: number;
    confidence: number;
    coverage: number;
    assessedAt: string;
    truthEngineVersion: "TI-2.1.8";
  }>;
}>;

/**
 * Relationships are first-class graph objects. They are never hidden inside a
 * token's value. Build 3 defines the dimensional/graph semantics of these edges.
 */
export type GenesisT8TokenRelation = Readonly<{
  relationId: string;
  fromTokenId: string;
  toTokenId: string;
  relationType: string;
  provenance: GenesisT8TokenProvenance;
}>;

export const GENESIS_T8_TOKEN_LIFECYCLE = Object.freeze({
  DISCOVERED: Object.freeze(["CANONICALISED", "RETIRED"] as const),
  CANONICALISED: Object.freeze(["HARD_VALIDATED", "RETIRED"] as const),
  HARD_VALIDATED: Object.freeze(["TRUTH_QUALIFIED", "RETIRED"] as const),
  TRUTH_QUALIFIED: Object.freeze(["ACTIVE", "RETIRED"] as const),
  ACTIVE: Object.freeze(["SUPERSEDED", "RETIRED"] as const),
  SUPERSEDED: Object.freeze(["RETIRED"] as const),
  RETIRED: Object.freeze([] as const),
} satisfies Record<GenesisT8TokenLifecycleState, readonly GenesisT8TokenLifecycleState[]>);

export const GENESIS_T8_TOKEN_LAWS = Object.freeze([
  "ONE_TOKEN_ONE_ATOMIC_ASSERTION",
  "ONE_TOKEN_ONE_SUBJECT",
  "TOKEN_VALUE_IS_CANONICAL_NOT_NARRATIVE",
  "TOKEN_IDENTITY_IS_SEPARATE_FROM_EVIDENCE",
  "AI_MAY_DISCOVER_AND_CANONICALISE_BUT_NOT_ASSIGN_TRUTH",
  "TI_2_1_8_IS_SOLE_TRUTH_QUALIFIER",
  "EVIDENCE_IS_REFERENCED_NOT_EMBEDDED_AS_REASONING",
  "RELATIONSHIPS_ARE_FIRST_CLASS_NOT_HIDDEN_IN_VALUES",
  "MISSING_KNOWLEDGE_IS_ABSENCE_NOT_A_NEGATIVE_TOKEN",
  "CONTRADICTION_IS_EXPLICIT_KNOWLEDGE_NOT_STRING_OVERWRITE",
  "CURRENT_STATE_NEVER_DESTROYS_HISTORY",
  "SUPERSESSION_REPLACES_AUTHORITY_NOT_PROVENANCE",
  "TOKENS_STORE_FACTS_NOT_MATCH_OR_OPPORTUNITY_SCORES",
  "DIMENSIONAL_POSITION_BELONGS_TO_THE_GRAPH_NOT_TOKEN_IDENTITY",
] as const);

export type GenesisT8TokenLaw = (typeof GENESIS_T8_TOKEN_LAWS)[number];

/**
 * Canonical identity is deterministic and intentionally excludes evidence,
 * truth scores, lifecycle state and graph position. Those may change without
 * changing what proposition the token represents.
 */
export function canonicalTokenIdentityKey(token: Pick<
  GenesisT8CommercialToken,
  "subjectEntityId" | "predicate" | "canonicalValue" | "validFrom" | "validTo"
>): string {
  return [
    token.subjectEntityId.trim().toLowerCase(),
    token.predicate.trim().toLowerCase(),
    token.canonicalValue.trim().toLowerCase(),
    token.validFrom ?? "",
    token.validTo ?? "",
  ].join("|");
}

export function canTransitionTokenLifecycle(
  from: GenesisT8TokenLifecycleState,
  to: GenesisT8TokenLifecycleState,
): boolean {
  return GENESIS_T8_TOKEN_LIFECYCLE[from].includes(to as never);
}

export function assertCommercialTokenInvariant(token: GenesisT8CommercialToken): void {
  if (!token.tokenId.trim()) throw new Error("GENESIS_T8_TOKEN_VIOLATION:TOKEN_ID_REQUIRED");
  if (!token.subjectEntityId.trim()) throw new Error("GENESIS_T8_TOKEN_VIOLATION:SUBJECT_REQUIRED");
  if (!token.predicate.trim()) throw new Error("GENESIS_T8_TOKEN_VIOLATION:PREDICATE_REQUIRED");
  if (!token.canonicalValue.trim()) throw new Error("GENESIS_T8_TOKEN_VIOLATION:CANONICAL_VALUE_REQUIRED");
  if (!token.provenance.evidenceIds.length && token.provenance.discoveredBy === "AI") {
    throw new Error("GENESIS_T8_TOKEN_VIOLATION:AI_DISCOVERY_REQUIRES_EVIDENCE_REFERENCE");
  }
  if (token.lifecycle === "DISCOVERED" && token.truth) {
    throw new Error("GENESIS_T8_TOKEN_VIOLATION:DISCOVERED_TOKEN_CANNOT_HAVE_TRUTH");
  }
  if (["TRUTH_QUALIFIED", "ACTIVE", "SUPERSEDED"].includes(token.lifecycle) && !token.truth) {
    throw new Error("GENESIS_T8_TOKEN_VIOLATION:QUALIFIED_STATE_REQUIRES_TI_OUTPUT");
  }
  if (token.truth) {
    if (token.truth.truthEngineVersion !== "TI-2.1.8") {
      throw new Error("GENESIS_T8_TOKEN_VIOLATION:TRUTH_ENGINE_VERSION");
    }
    for (const value of [token.truth.probability, token.truth.confidence, token.truth.coverage]) {
      if (!Number.isFinite(value) || value < 0 || value > 1) {
        throw new Error("GENESIS_T8_TOKEN_VIOLATION:TRUTH_BOUND");
      }
    }
  }
}

export function assertTokenRelationInvariant(relation: GenesisT8TokenRelation): void {
  if (!relation.relationId.trim()) throw new Error("GENESIS_T8_RELATION_VIOLATION:RELATION_ID_REQUIRED");
  if (!relation.fromTokenId.trim() || !relation.toTokenId.trim()) {
    throw new Error("GENESIS_T8_RELATION_VIOLATION:ENDPOINT_REQUIRED");
  }
  if (relation.fromTokenId === relation.toTokenId) {
    throw new Error("GENESIS_T8_RELATION_VIOLATION:SELF_RELATION_REQUIRES_EXPLICIT_FUTURE_SEMANTICS");
  }
  if (!relation.relationType.trim()) throw new Error("GENESIS_T8_RELATION_VIOLATION:TYPE_REQUIRED");
}
