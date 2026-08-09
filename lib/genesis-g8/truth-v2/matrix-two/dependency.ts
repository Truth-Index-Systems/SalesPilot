import { assertUnitInterval } from "../evidence/numeric";
import type { MrTi2AdjustedClaimState, MrTi2ClaimRelationshipInput, MrTi2DependencyConstraint } from "./types";

export function applyMrTi2DependencyCeilings(
  claimKey:string,
  probability:number|null,
  evaluated:Readonly<Record<string,MrTi2AdjustedClaimState>>,
  relationships:readonly MrTi2ClaimRelationshipInput[],
):{probability:number|null; constraints:readonly MrTi2DependencyConstraint[]; constrained:boolean} {
  if(probability===null) return {probability:null,constraints:[],constrained:false};
  const constraints:MrTi2DependencyConstraint[]=[];
  let adjusted=probability;
  for(const edge of relationships){
    if(edge.relationshipType!=="DEPENDS_ON" || edge.fromClaimKey!==claimKey) continue;
    const parent=evaluated[edge.toClaimKey];
    if(!parent || parent.probability===null) continue; // unknown parent cannot be treated as false
    const strength=assertUnitInterval(edge.strength,"dependency_strength");
    const ceiling=Math.pow(parent.probability,strength);
    constraints.push({parentClaimKey:edge.toClaimKey,strength,parentProbability:parent.probability,ceiling});
    adjusted=Math.min(adjusted,ceiling);
  }
  return {probability:adjusted,constraints,constrained:adjusted<probability};
}
