/** CE-R2 constitutional definitions for commercial realities and opportunities. */
export const GENESIS_T8_OPPORTUNITY_CONSTITUTION_VERSION = "1.0.0" as const;

export type GenesisT8CommercialRealityIdentity = Readonly<{
  sellerEntityId: string;
  offeringEntityId: string;
  targetEntityId: string;
  graphSnapshotId: string;
  truthAuthorityId: string;
  temporalScopeKey: string;
}>;

export type GenesisT8CommercialRealityStatus =
  | "UNEVALUATED"
  | "SURVIVES_BOUNDARY_CONSTRAINTS"
  | "ELIMINATED_BY_BOUNDARY_CONSTRAINT"
  | "INSUFFICIENTLY_KNOWN";

export const GENESIS_T8_OPPORTUNITY_DEFINITION =
  "A truth-qualified commercial reality between a seller, an offering and a target organisation that survives all applicable boundary constraints and exhibits sufficient commercial coherence to justify engagement." as const;

export const GENESIS_T8_COMMERCIAL_REALITY_LAWS = Object.freeze([
  "NO_ORGANISATION_IS_INTRINSICALLY_A_GOOD_OPPORTUNITY",
  "OPPORTUNITY_IS_RELATIONAL_NOT_INTRINSIC",
  "SELLER_OFFERING_TARGET_TRUTH_AND_TIME_DEFINE_THE_REASONING_CONTEXT",
  "SURVIVAL_PRECEDES_OPPORTUNITY_ORDERING",
  "ELIMINATION_REQUIRES_AN_APPLICABLE_BOUNDARY_CONSTRAINT",
  "UNKNOWN_DOES_NOT_EQUAL_FALSE",
] as const);

export function assertCommercialRealityIdentity(value: GenesisT8CommercialRealityIdentity): void {
  for (const [key, candidate] of Object.entries(value)) {
    if (typeof candidate !== "string" || !candidate.trim()) {
      throw new Error(`GENESIS_T8_CE_R2_REALITY_VIOLATION:${key.toUpperCase()}_REQUIRED`);
    }
  }
}
