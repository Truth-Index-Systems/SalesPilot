/** CE-R1 Build 7 aggregate freeze invariant. */
import { assertCommercialGenomeOntologyInvariant, GENESIS_T8_COMMERCIAL_GENOME_PREDICATES, predicateDefinitionFingerprint } from "./commercial-genome-ontology";
import { GENESIS_T8_RELATIONSHIP_CATALOGUE } from "./relationship-catalogue";
import { GENESIS_T8_TRUTH_AUTHORITIES } from "./authority-registry";

export const GENESIS_T8_CE_R1_FREEZE_VERSION = "CKR-1.0.0" as const;
export const GENESIS_T8_CE_R1_BUILD = "BUILD7" as const;
export const GENESIS_T8_CE_R1_FREEZE_STATUS = "FROZEN" as const;

export function ontologySemanticFingerprint(): string {
  return GENESIS_T8_COMMERCIAL_GENOME_PREDICATES.map(predicateDefinitionFingerprint).sort().join("\n");
}

export function assertGenesisT8CeR1FreezeInvariant(): void {
  assertCommercialGenomeOntologyInvariant();
  if (!GENESIS_T8_TRUTH_AUTHORITIES.some((authority)=>authority.active)) throw new Error("GENESIS_T8_FREEZE_VIOLATION:NO_ACTIVE_TRUTH_AUTHORITY");
  if (new Set(GENESIS_T8_RELATIONSHIP_CATALOGUE.map((relation)=>relation.relationType)).size !== GENESIS_T8_RELATIONSHIP_CATALOGUE.length) throw new Error("GENESIS_T8_FREEZE_VIOLATION:DUPLICATE_RELATION_TYPE");
}

assertGenesisT8CeR1FreezeInvariant();
