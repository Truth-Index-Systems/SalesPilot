import { assessMrTi2Contradiction, calibrateMrTi2EvidenceBalance, calculateMrTi2RawEvidenceBalance } from "../claims";
import { calculateMrTi2RelationshipContradiction, combineMrTi2ContradictionStrength } from "./contradiction";
import { applyMrTi2DependencyCeilings } from "./dependency";
import { getMrTi2DependencyOrder, validateMrTi2Relationships } from "./topology";
import type { MrTi2AdjustedClaimState, MrTi2MatrixTwoInput, MrTi2MatrixTwoResult } from "./types";

export function evaluateMrTi2MatrixTwo(input:MrTi2MatrixTwoInput):MrTi2MatrixTwoResult {
  const claimKeys=Object.keys(input.claims);
  const relationships=validateMrTi2Relationships(claimKeys,input.relationships);
  const dependencyOrder=getMrTi2DependencyOrder(claimKeys,relationships);

  // Relationship contradiction is calculated from Matrix-1/raw evidence balance.
  // It remains an evidence-domain transformation; it is not described as probability.
  const preDependency:Record<string,MrTi2AdjustedClaimState>={};
  for(const claimKey of claimKeys){
    const raw=input.claims[claimKey];
    const relation=calculateMrTi2RelationshipContradiction(claimKey,input.claims,relationships);
    const combined=combineMrTi2ContradictionStrength(raw.contradictionStrength,relation.strength);
    const evidenceBalance=calculateMrTi2RawEvidenceBalance({supportStrength:raw.supportStrength,contradictionStrength:combined});
    const contradiction=assessMrTi2Contradiction(raw.supportStrength,combined);
    preDependency[claimKey]={
      ...raw,
      rawEvidenceBalance:raw.evidenceBalance,
      relationshipContradictionStrength:relation.strength,
      combinedContradictionStrength:combined,
      preDependencyEvidenceBalance:evidenceBalance,
      dependencyConstraints:[],
      dependencyConstrained:false,
      evidenceBalance,
      truthProbability:null,
      probabilityState:"UNCALIBRATED",
      represented:evidenceBalance!==null,
      ...contradiction,
    };
  }

  const evaluated:Record<string,MrTi2AdjustedClaimState>={};
  for(const claimKey of dependencyOrder){
    const state=preDependency[claimKey];
    const dependency=applyMrTi2DependencyCeilings(claimKey,state.evidenceBalance,evaluated,relationships);
    const truthProbability=dependency.evidenceBalance===null||!input.calibrationProfile
      ? null
      : calibrateMrTi2EvidenceBalance(dependency.evidenceBalance,input.calibrationProfile);
    evaluated[claimKey]={
      ...state,
      dependencyConstraints:dependency.constraints,
      dependencyConstrained:dependency.constrained,
      evidenceBalance:dependency.evidenceBalance,
      truthProbability,
      probabilityState:truthProbability===null?"UNCALIBRATED":"EMPIRICALLY_CALIBRATED",
      represented:dependency.evidenceBalance!==null,
    };
  }

  return {claims:evaluated,dependencyOrder,relationships};
}
