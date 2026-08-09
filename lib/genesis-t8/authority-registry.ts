/** Genesis T8 truth-authority abstraction. TI-2.1.8 remains the sole active authority. */
export const GENESIS_T8_TRUTH_AUTHORITY_CONTRACT_VERSION = "1.0.0" as const;

export type GenesisT8TruthAuthority = Readonly<{
  truthAuthorityId: string;
  engineFamily: string;
  engineVersion: string;
  contractVersion: string;
  active: boolean;
}>;

export const GENESIS_T8_TRUTH_AUTHORITIES = Object.freeze([
  Object.freeze({
    truthAuthorityId: "truth-index:ti-2.1.8",
    engineFamily: "TRUTH_INDEX",
    engineVersion: "TI-2.1.8",
    contractVersion: GENESIS_T8_TRUTH_AUTHORITY_CONTRACT_VERSION,
    active: true,
  }),
] as const);

export const GENESIS_T8_ACTIVE_TRUTH_AUTHORITY_ID = "truth-index:ti-2.1.8" as const;

export function getTruthAuthority(id: string): GenesisT8TruthAuthority | undefined {
  return GENESIS_T8_TRUTH_AUTHORITIES.find((authority) => authority.truthAuthorityId === id);
}

export function assertAuthorisedTruthAuthority(id: string): GenesisT8TruthAuthority {
  const authority = getTruthAuthority(id);
  if (!authority || !authority.active) {
    throw new Error(`GENESIS_T8_TRUTH_AUTHORITY_VIOLATION:UNAUTHORISED:${id}`);
  }
  return authority;
}
