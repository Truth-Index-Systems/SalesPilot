import type { MrTi2RawClaimState } from "../claims";
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
}

export interface MrTi2DependencyConstraint {
  parentClaimKey: string;
  strength: number;
  parentProbability: number;
  ceiling: number;
}

export interface MrTi2RelationshipContradictionContribution {
  conflictingClaimKey: string;
  strength: number;
  conflictingProbability: number;
  contribution: number;
}

export interface MrTi2AdjustedClaimState extends MrTi2RawClaimState {
  rawProbability: number | null;
  relationshipContradictionStrength: number;
  combinedContradictionStrength: number;
  preDependencyProbability: number | null;
  dependencyConstraints: readonly MrTi2DependencyConstraint[];
  dependencyConstrained: boolean;
  probability: number | null;
}

export interface MrTi2MatrixTwoResult {
  claims: Readonly<Record<string, MrTi2AdjustedClaimState>>;
  dependencyOrder: readonly string[];
  relationships: readonly MrTi2ClaimRelationshipInput[];
}
