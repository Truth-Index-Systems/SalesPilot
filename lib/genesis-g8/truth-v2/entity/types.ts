import type { GenesisG8EntityType as TruthEntityType } from "../../entity-types";
import type { MrTi2ClaimDefinition } from "../types";
import type { MrTi2AdjustedClaimState } from "../matrix-two";
import type { MrTi2ClaimReviewState, MrTi2ProbabilityState } from "../claims";
import type { MR_TI_2_TRUTH_SEMANTICS_VERSION } from "../types";

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
  /** Directional evidence index; never a probability. */
  evidenceBalance: number | null;
  evidenceSufficiency:number;
  truthProbability:number|null;
  probabilityState:MrTi2ProbabilityState;
  weightedEvidenceBalanceMass: number;
  contradictionSeverity: number;
  reviewState: MrTi2ClaimReviewState;
  dependencyConstrained: boolean;
  evidenceCount:number;
  dependenceFamilyCount:number;
  undatedEvidenceCount:number;
  minimumFreshnessModifier:number;
}

export type MrTi2EntityProbabilityState="UNCALIBRATED"|"PARTIALLY_CALIBRATED"|"EMPIRICALLY_CALIBRATED";

export interface MrTi2EntityStateVector {
  truthIndex: number;
  /** Explicit evidence quantity, independent of evidence direction. */
  evidenceSufficiency:number;
  /** Legacy schema/API compatibility mirror of evidenceSufficiency. */
  representedConfidence: number;
  coverage: number;
  foundationalIntegrity: number;
  foundationalIntegrityRepresented: boolean;
  foundationalModifier: number;
  baseTruth: number;
  maxContradictionSeverity: number;
  reviewState: MrTi2ClaimReviewState;
  calibratedProbabilityCoverage:number;
  probabilityState:MrTi2EntityProbabilityState;
}

export interface MrTi2EntityDiagnostics {
  missingClaims: readonly string[];
  contradictedClaims: readonly string[];
  dependencyConstrainedClaims: readonly string[];
  limitingClaims: readonly string[];
  temporallyUncertainClaims:readonly string[];
  contributions: readonly MrTi2ClaimContribution[];
}

export interface MrTi2EntityTruthResult {
  engineVersion: "MR-TI-2.0";
  contractVersion: "MR-TI-2-CONTRACTS-1.0";
  truthSemanticsVersion:typeof MR_TI_2_TRUTH_SEMANTICS_VERSION;
  entityType: TruthEntityType;
  state: MrTi2EntityStateVector;
  diagnostics: MrTi2EntityDiagnostics;
  calculatedAt: string;
}

export interface MrTi2SnapshotWrite {
  entityId: string;
  engineVersion: "MR-TI-2.0";
  contractVersion: "MR-TI-2-CONTRACTS-1.0";
  truthSemanticsVersion:typeof MR_TI_2_TRUTH_SEMANTICS_VERSION;
  truthIndex: number;
  evidenceSufficiency:number;
  representedConfidence: number;
  coverage: number;
  foundationalIntegrity: number;
  maxContradictionSeverity: number;
  reviewState: MrTi2ClaimReviewState;
  calibratedProbabilityCoverage:number;
  probabilityState:MrTi2EntityProbabilityState;
  result: MrTi2EntityTruthResult;
  calculatedAt: string;
}
