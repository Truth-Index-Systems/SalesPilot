import { assertUnitInterval } from "../evidence/numeric";
import type { MrTi2RawClaimState } from "../claims";
import type { MrTi2ClaimRelationshipInput, MrTi2RelationshipContradictionContribution } from "./types";

export interface MrTi2RelationshipContradictionResult {
  strength: number;
  contributions: readonly MrTi2RelationshipContradictionContribution[];
}

// CONTRADICTS is logically symmetric even though persistence stores one edge.
// Relationship contradiction uses the opposing claim's EVIDENCE BALANCE, not a
// falsely-labelled probability. Unknown opposing claims add no contradiction mass.
export function calculateMrTi2RelationshipContradiction(
  claimKey:string,
  claims:Readonly<Record<string,MrTi2RawClaimState>>,
  relationships:readonly MrTi2ClaimRelationshipInput[],
):MrTi2RelationshipContradictionResult {
  const contributions:MrTi2RelationshipContradictionContribution[]=[];
  for(const edge of relationships){
    if(edge.relationshipType!=="CONTRADICTS") continue;
    let other:string|null=null;
    if(edge.fromClaimKey===claimKey) other=edge.toClaimKey;
    else if(edge.toClaimKey===claimKey) other=edge.fromClaimKey;
    if(!other) continue;
    const evidenceBalance=claims[other]?.evidenceBalance;
    if(evidenceBalance===null || evidenceBalance===undefined) continue;
    const strength=assertUnitInterval(edge.strength,"relationship_strength");
    const contribution=strength*evidenceBalance;
    contributions.push({conflictingClaimKey:other,strength,conflictingEvidenceBalance:evidenceBalance,contribution});
  }
  const residual=contributions.reduce((acc,item)=>acc*(1-item.contribution),1);
  return {strength:1-residual,contributions};
}

export function combineMrTi2ContradictionStrength(evidenceContradiction:number,relationshipContradiction:number):number {
  const evidence=assertUnitInterval(evidenceContradiction,"evidence_contradiction_strength");
  const relationship=assertUnitInterval(relationshipContradiction,"relationship_contradiction_strength");
  return 1-((1-evidence)*(1-relationship));
}
