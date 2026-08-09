import type { GenesisG8EntityType as TruthEntityType } from "../../entity-types";
import type { MrTi2ClaimDefinition } from "../types";
import type { MrTi2AdjustedClaimState } from "../matrix-two";
import type { MrTi2ClaimReviewState } from "../claims";

export interface MrTi2EntityAggregationInput {
  entityType: TruthEntityType;
  claims: Readonly<Record<string, MrTi2AdjustedClaimState>>;
  definitions: readonly MrTi2ClaimDefinition[];
  calculatedAt?: string;
}

export interface MrTi2ClaimContribution {
  claimKey: string;
  impactClass: MrTi2ClaimDefinition["impactClass"];
  weight: number;
  represented: boolean;
  probability: number | null;
  weightedTruthMass: number;
  contradictionSeverity: number;
  reviewState: MrTi2ClaimReviewState;
  dependencyConstrained: boolean;
}

export interface MrTi2EntityStateVector {
  truthIndex: number;
  representedConfidence: number;
  coverage: number;
  foundationalIntegrity: number;
  foundationalIntegrityRepresented: boolean;
  foundationalModifier: number;
  baseTruth: number;
  maxContradictionSeverity: number;
  reviewState: MrTi2ClaimReviewState;
}

export interface MrTi2EntityDiagnostics {
  missingClaims: readonly string[];
  contradictedClaims: readonly string[];
  dependencyConstrainedClaims: readonly string[];
  limitingClaims: readonly string[];
  contributions: readonly MrTi2ClaimContribution[];
}

export interface MrTi2EntityTruthResult {
  engineVersion: "MR-TI-2.0";
  contractVersion: "MR-TI-2-CONTRACTS-1.0";
  entityType: TruthEntityType;
  state: MrTi2EntityStateVector;
  diagnostics: MrTi2EntityDiagnostics;
  calculatedAt: string;
}

export interface MrTi2SnapshotWrite {
  entityId: string;
  engineVersion: "MR-TI-2.0";
  contractVersion: "MR-TI-2-CONTRACTS-1.0";
  truthIndex: number;
  representedConfidence: number;
  coverage: number;
  foundationalIntegrity: number;
  maxContradictionSeverity: number;
  reviewState: MrTi2ClaimReviewState;
  result: MrTi2EntityTruthResult;
  calculatedAt: string;
}
