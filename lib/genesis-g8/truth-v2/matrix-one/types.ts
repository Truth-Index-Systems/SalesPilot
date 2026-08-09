import type { MrTi2EvidenceDirection } from "../types";
import type { MrTi2EvidenceMathResult, MrTi2EvidencePrimitiveInput } from "../evidence/types";

export interface MrTi2MatrixOneEvidenceInput {
  evidenceKey: string;
  claimKey: string;
  direction: MrTi2EvidenceDirection;
  primitive: MrTi2EvidencePrimitiveInput;
}

export interface MrTi2MatrixOneCell {
  evidenceKey: string;
  claimKey: string;
  direction: MrTi2EvidenceDirection;
  math: MrTi2EvidenceMathResult;
  effectiveStrength: number;
}

export interface MrTi2MatrixOneClaimAggregate {
  claimKey: string;
  cells: readonly MrTi2MatrixOneCell[];
  supportStrength: number;
  contradictionStrength: number;
}
