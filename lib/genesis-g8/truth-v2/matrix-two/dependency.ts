import { assertUnitInterval } from "../evidence/numeric";
import type { MrTi2AdjustedClaimState, MrTi2ClaimRelationshipInput, MrTi2DependencyConstraint } from "./types";

export function applyMrTi2DependencyCeilings(
  claimKey:string,
  evidenceBalance:number|null,
  evaluated:Readonly<Record<string,MrTi2AdjustedClaimState>>,
  relationships:readonly MrTi2ClaimRelationshipInput[],
):{evidenceBalance:number|null; constraints:readonly MrTi2DependencyConstraint[]; constrained:boolean} {
  if(evidenceBalance===null) return {evidenceBalance:null,constraints:[],constrained:false};
  const constraints:MrTi2DependencyConstraint[]=[];
  let adjusted=evidenceBalance;
  for(const edge of relationships){
    if(edge.relationshipType!=="DEPENDS_ON" || edge.fromClaimKey!==claimKey) continue;
    const parent=evaluated[edge.toClaimKey];
    if(!parent || parent.evidenceBalance===null) continue; // unknown parent remains unknown; it is never converted to false.
    const strength=assertUnitInterval(edge.strength,"dependency_strength");
    const ceiling=Math.pow(parent.evidenceBalance,strength);
    constraints.push({parentClaimKey:edge.toClaimKey,strength,parentEvidenceBalance:parent.evidenceBalance,ceiling});
    adjusted=Math.min(adjusted,ceiling);
  }
  return {evidenceBalance:adjusted,constraints,constrained:adjusted<evidenceBalance};
}
