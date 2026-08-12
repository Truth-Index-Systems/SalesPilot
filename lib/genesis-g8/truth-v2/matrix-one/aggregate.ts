import { calculateEvidenceSufficiency, compoundIndependentEvidenceStrengths } from "../../../truth-foundation/epistemic";
import { calculateMrTi2EvidenceStrength } from "../evidence/strength";
import type { MrTi2MatrixOneCell, MrTi2MatrixOneClaimAggregate, MrTi2MatrixOneDependenceFamily, MrTi2MatrixOneEvidenceInput } from "./types";

export function compoundMrTi2IndependentEvidence(strengths:readonly number[]):number {
  return compoundIndependentEvidenceStrengths(strengths);
}

function familyKey(input:MrTi2MatrixOneEvidenceInput):string {
  const supplied=input.dependenceFamilyKey?.trim();
  return supplied||`EVIDENCE:${input.evidenceKey}`;
}

export function buildMrTi2MatrixOneCell(input:MrTi2MatrixOneEvidenceInput):MrTi2MatrixOneCell {
  const math=calculateMrTi2EvidenceStrength(input.primitive);
  return {
    evidenceKey:input.evidenceKey,
    claimKey:input.claimKey,
    direction:input.direction,
    dependenceFamilyKey:familyKey(input),
    math,
    effectiveStrength:math.effectiveStrength,
  };
}

function aggregateFamilies(cells:readonly MrTi2MatrixOneCell[]):readonly MrTi2MatrixOneDependenceFamily[] {
  const groups=new Map<string,{direction:MrTi2MatrixOneCell["direction"];members:string[];strength:number;family:string}>();
  for(const cell of cells){
    const groupingKey=`${cell.direction}:${cell.dependenceFamilyKey}`;
    const current=groups.get(groupingKey);
    if(current){
      current.members.push(cell.evidenceKey);
      current.strength=Math.max(current.strength,cell.effectiveStrength);
    }else{
      groups.set(groupingKey,{direction:cell.direction,members:[cell.evidenceKey],strength:cell.effectiveStrength,family:cell.dependenceFamilyKey});
    }
  }
  return [...groups.values()]
    .sort((a,b)=>`${a.direction}:${a.family}`.localeCompare(`${b.direction}:${b.family}`))
    .map((group)=>({
      dependenceFamilyKey:group.family,
      direction:group.direction,
      memberEvidenceKeys:Object.freeze([...group.members].sort()),
      representativeStrength:group.strength,
    }));
}

export function aggregateMrTi2ClaimEvidence(claimKey:string,cells:readonly MrTi2MatrixOneCell[]):MrTi2MatrixOneClaimAggregate {
  const claimCells=cells.filter((cell)=>cell.claimKey===claimKey);
  const families=aggregateFamilies(claimCells);
  const supportStrength=compoundMrTi2IndependentEvidence(families.filter((family)=>family.direction==="SUPPORT").map((family)=>family.representativeStrength));
  const contradictionStrength=compoundMrTi2IndependentEvidence(families.filter((family)=>family.direction==="CONTRADICT").map((family)=>family.representativeStrength));
  const evidenceSufficiency=calculateEvidenceSufficiency(supportStrength,contradictionStrength);
  const undatedEvidenceCount=claimCells.filter((cell)=>!cell.math.sourcePublicationKnown).length;
  const minimumFreshnessModifier=claimCells.length?Math.min(...claimCells.map((cell)=>cell.math.freshnessModifier)):0;
  return {claimKey,cells:claimCells,families,supportStrength,contradictionStrength,evidenceSufficiency,undatedEvidenceCount,minimumFreshnessModifier};
}

export function buildMrTi2MatrixOne(inputs:readonly MrTi2MatrixOneEvidenceInput[]):readonly MrTi2MatrixOneCell[] {
  return inputs.map(buildMrTi2MatrixOneCell);
}
