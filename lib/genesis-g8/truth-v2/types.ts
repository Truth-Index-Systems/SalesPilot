import type { GenesisG8EntityType as TruthEntityType } from "../entity-types";

export const MR_TI_2_ENGINE_VERSION = "MR-TI-2.0" as const;
export const MR_TI_2_CONTRACT_VERSION = "MR-TI-2-CONTRACTS-1.0" as const;

export type MrTi2ImpactClass = "FOUNDATIONAL" | "COMMERCIAL" | "SUPPORTING" | "OPTIONAL";
export type MrTi2RelationshipType = "DEPENDS_ON" | "CONTRADICTS";
export type MrTi2EvidenceDirection = "SUPPORT" | "CONTRADICT";

export interface MrTi2ClaimDefinition {
  key: string;
  label: string;
  proposition: string;
  impactClass: MrTi2ImpactClass;
  weight: number;
  freshnessHalfLifeDays: number;
  countsTowardCoverage: boolean;
  allowedRelationshipTypes: readonly MrTi2RelationshipType[];
}

export interface MrTi2ClaimContract {
  entityType: TruthEntityType;
  version: typeof MR_TI_2_CONTRACT_VERSION;
  claims: readonly MrTi2ClaimDefinition[];
}
