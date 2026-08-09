import { MR_TI_2_PROBABILITY_CAP } from "../evidence/constants";
import { assertUnitInterval } from "../evidence/numeric";
import { calculateMrTi2EvidenceStrength } from "../evidence/strength";
import type { MrTi2MatrixOneCell, MrTi2MatrixOneClaimAggregate, MrTi2MatrixOneEvidenceInput } from "./types";

export function compoundMrTi2IndependentEvidence(strengths:readonly number[]):number {
  if(strengths.length===0) return 0;
  const residual=strengths.reduce((product,strength)=>product*(1-assertUnitInterval(strength,"evidence_strength")),1);
  return Math.min(MR_TI_2_PROBABILITY_CAP,Math.max(0,1-residual));
}

export function buildMrTi2MatrixOneCell(input:MrTi2MatrixOneEvidenceInput):MrTi2MatrixOneCell {
  const math=calculateMrTi2EvidenceStrength(input.primitive);
  return {
    evidenceKey:input.evidenceKey,
    claimKey:input.claimKey,
    direction:input.direction,
    math,
    effectiveStrength:math.effectiveStrength,
  };
}

export function aggregateMrTi2ClaimEvidence(claimKey:string,cells:readonly MrTi2MatrixOneCell[]):MrTi2MatrixOneClaimAggregate {
  const claimCells=cells.filter((cell)=>cell.claimKey===claimKey);
  const supportStrength=compoundMrTi2IndependentEvidence(claimCells.filter((cell)=>cell.direction==="SUPPORT").map((cell)=>cell.effectiveStrength));
  const contradictionStrength=compoundMrTi2IndependentEvidence(claimCells.filter((cell)=>cell.direction==="CONTRADICT").map((cell)=>cell.effectiveStrength));
  return {claimKey,cells:claimCells,supportStrength,contradictionStrength};
}

export function buildMrTi2MatrixOne(inputs:readonly MrTi2MatrixOneEvidenceInput[]):readonly MrTi2MatrixOneCell[] {
  return inputs.map(buildMrTi2MatrixOneCell);
}
