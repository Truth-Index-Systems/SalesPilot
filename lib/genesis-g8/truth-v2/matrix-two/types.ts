import type { MrTi2CalibrationProfile, MrTi2ProbabilityState, MrTi2RawClaimState } from "../claims";
import type { MrTi2RelationshipType } from "../types";

export interface MrTi2ClaimRelationshipInput {
  fromClaimKey: string;
  toClaimKey: string;
  relationshipType: MrTi2RelationshipType;
  strength: number;
}

export interface MrTi2MatrixTwoInput {
  claims: Readonly<Record<string, MrTi2RawClaimState>>;
  relationships: readonly MrTi2ClaimRelationshipInput[];
  calibrationProfile?:MrTi2CalibrationProfile|null;
}

export interface MrTi2DependencyConstraint {
  parentClaimKey: string;
  strength: number;
  parentEvidenceBalance: number;
  ceiling: number;
}

export interface MrTi2RelationshipContradictionContribution {
  conflictingClaimKey: string;
  strength: number;
  conflictingEvidenceBalance: number;
  contribution: number;
}

export interface MrTi2AdjustedClaimState extends MrTi2RawClaimState {
  rawEvidenceBalance: number | null;
  relationshipContradictionStrength: number;
  combinedContradictionStrength: number;
  preDependencyEvidenceBalance: number | null;
  dependencyConstraints: readonly MrTi2DependencyConstraint[];
  dependencyConstrained: boolean;
  evidenceBalance: number | null;
  truthProbability:number|null;
  probabilityState:MrTi2ProbabilityState;
}

export interface MrTi2MatrixTwoResult {
  claims: Readonly<Record<string, MrTi2AdjustedClaimState>>;
  dependencyOrder: readonly string[];
  relationships: readonly MrTi2ClaimRelationshipInput[];
}
