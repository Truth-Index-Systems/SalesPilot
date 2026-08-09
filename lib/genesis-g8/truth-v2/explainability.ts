import type { MrTi2EntityTruthResult } from "./entity";
import { getMrTi2ClaimContract } from "./contracts";
import { prioritiseMrTi2Research, type MrTi2ResearchPriority } from "./research-priority";

export interface MrTi2Explanation {
  headline:string;
  summary:string;
  strengths:string[];
  limitations:string[];
  nextAction:MrTi2ResearchPriority|null;
}

export function explainMrTi2Truth(result:MrTi2EntityTruthResult):MrTi2Explanation{
  const contract=getMrTi2ClaimContract(result.entityType);
  const defs=new Map(contract.claims.map((claim)=>[claim.key,claim]));
  const represented=result.diagnostics.contributions.filter((item)=>item.represented&&item.probability!==null);
  const strengths=[...represented].sort((a,b)=>(b.weight*(b.probability??0))-(a.weight*(a.probability??0))).slice(0,3).map((item)=>`${defs.get(item.claimKey)?.label??item.claimKey}: ${((item.probability??0)*100).toFixed(1)}%`);
  const limitations:string[]=[];
  for(const key of result.diagnostics.missingClaims.slice(0,3)) limitations.push(`${defs.get(key)?.label??key}: missing evidence`);
  for(const key of result.diagnostics.contradictedClaims.slice(0,3)){
    if(limitations.some((value)=>value.startsWith(`${defs.get(key)?.label??key}:`))) continue;
    limitations.push(`${defs.get(key)?.label??key}: contradictory evidence`);
  }
  for(const key of result.diagnostics.dependencyConstrainedClaims.slice(0,2)){
    if(limitations.some((value)=>value.startsWith(`${defs.get(key)?.label??key}:`))) continue;
    limitations.push(`${defs.get(key)?.label??key}: constrained by a dependent claim`);
  }
  const priorities=prioritiseMrTi2Research(result);
  const review=result.state.reviewState==="HUMAN_REVIEW_REQUIRED"?"Human review is required before this intelligence is treated as settled.":result.state.reviewState==="VERIFY"?"Further independent verification is required.":"No mandatory review gate is active.";
  return {
    headline:`Truth Index ${result.state.truthIndex.toFixed(1)} · ${result.state.coverage.toFixed(1)}% coverage`,
    summary:`Represented knowledge is ${result.state.representedConfidence.toFixed(1)}% confident with ${result.state.foundationalIntegrity.toFixed(1)}% foundational integrity. ${review}`,
    strengths,limitations,nextAction:priorities[0]??null,
  };
}
