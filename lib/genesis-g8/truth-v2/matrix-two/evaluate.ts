import { assessMrTi2Contradiction, calculateMrTi2RawClaimProbability } from "../claims";
import { calculateMrTi2RelationshipContradiction, combineMrTi2ContradictionStrength } from "./contradiction";
import { applyMrTi2DependencyCeilings } from "./dependency";
import { getMrTi2DependencyOrder, validateMrTi2Relationships } from "./topology";
import type { MrTi2AdjustedClaimState, MrTi2MatrixTwoInput, MrTi2MatrixTwoResult } from "./types";

export function evaluateMrTi2MatrixTwo(input:MrTi2MatrixTwoInput):MrTi2MatrixTwoResult {
  const claimKeys=Object.keys(input.claims);
  const relationships=validateMrTi2Relationships(claimKeys,input.relationships);
  const dependencyOrder=getMrTi2DependencyOrder(claimKeys,relationships);

  // Relationship contradiction is calculated from Matrix-1/raw probabilities.
  // This makes the pass deterministic and prevents mutually contradictory claims
  // repeatedly feeding each other until convergence is implementation-dependent.
  const preDependency:Record<string,MrTi2AdjustedClaimState>={};
  for(const claimKey of claimKeys){
    const raw=input.claims[claimKey];
    const relation=calculateMrTi2RelationshipContradiction(claimKey,input.claims,relationships);
    const combined=combineMrTi2ContradictionStrength(raw.contradictionStrength,relation.strength);
    const probability=calculateMrTi2RawClaimProbability({supportStrength:raw.supportStrength,contradictionStrength:combined});
    const contradiction=assessMrTi2Contradiction(raw.supportStrength,combined);
    preDependency[claimKey]={
      ...raw,
      rawProbability:raw.probability,
      relationshipContradictionStrength:relation.strength,
      combinedContradictionStrength:combined,
      preDependencyProbability:probability,
      dependencyConstraints:[],
      dependencyConstrained:false,
      probability,
      represented:probability!==null,
      ...contradiction,
    };
  }

  const evaluated:Record<string,MrTi2AdjustedClaimState>={};
  for(const claimKey of dependencyOrder){
    const state=preDependency[claimKey];
    const dependency=applyMrTi2DependencyCeilings(claimKey,state.probability,evaluated,relationships);
    evaluated[claimKey]={
      ...state,
      dependencyConstraints:dependency.constraints,
      dependencyConstrained:dependency.constrained,
      probability:dependency.probability,
      represented:dependency.probability!==null,
    };
  }

  return {claims:evaluated,dependencyOrder,relationships};
}
