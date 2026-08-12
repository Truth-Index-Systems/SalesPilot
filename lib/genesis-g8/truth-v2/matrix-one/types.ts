import type { MrTi2EvidenceDirection } from "../types";
import type { MrTi2EvidenceMathResult, MrTi2EvidencePrimitiveInput } from "../evidence/types";

export interface MrTi2MatrixOneEvidenceInput {
  evidenceKey: string;
  claimKey: string;
  direction: MrTi2EvidenceDirection;
  /** Common-origin / derivative family. Equal keys are dependent evidence. */
  dependenceFamilyKey?: string;
  primitive: MrTi2EvidencePrimitiveInput;
}

export interface MrTi2MatrixOneCell {
  evidenceKey: string;
  claimKey: string;
  direction: MrTi2EvidenceDirection;
  dependenceFamilyKey: string;
  math: MrTi2EvidenceMathResult;
  effectiveStrength: number;
}

export interface MrTi2MatrixOneDependenceFamily {
  dependenceFamilyKey:string;
  direction:MrTi2EvidenceDirection;
  memberEvidenceKeys:readonly string[];
  representativeStrength:number;
}

export interface MrTi2MatrixOneClaimAggregate {
  claimKey: string;
  cells: readonly MrTi2MatrixOneCell[];
  families: readonly MrTi2MatrixOneDependenceFamily[];
  supportStrength: number;
  contradictionStrength: number;
  evidenceSufficiency:number;
  undatedEvidenceCount:number;
  minimumFreshnessModifier:number;
}
