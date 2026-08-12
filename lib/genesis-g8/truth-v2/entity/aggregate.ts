import { MR_TI_2_CONTRACT_VERSION, MR_TI_2_ENGINE_VERSION, MR_TI_2_TRUTH_SEMANTICS_VERSION } from "../types";
import { assessMrTi2Contradiction, type MrTi2ClaimReviewState } from "../claims";
import type { MrTi2ClaimDefinition } from "../types";
import type { MrTi2ClaimContribution, MrTi2EntityAggregationInput, MrTi2EntityProbabilityState, MrTi2EntityTruthResult } from "./types";

const TRUTH_CAP=99.9;
const REVIEW_RANK:Readonly<Record<MrTi2ClaimReviewState,number>>={AUTO:0,VERIFY:1,HUMAN_REVIEW_REQUIRED:2};
const clamp01=(value:number)=>Math.min(1,Math.max(0,Number.isFinite(value)?value:0));
const toPct=(value:number)=>Math.min(TRUTH_CAP,Math.max(0,value*100));

function claimDefinitionMap(definitions:readonly MrTi2ClaimDefinition[]):Map<string,MrTi2ClaimDefinition>{
  const map=new Map<string,MrTi2ClaimDefinition>();
  for(const definition of definitions){
    if(map.has(definition.key)) throw new Error(`MR_TI_2_DUPLICATE_CLAIM_DEFINITION:${definition.key}`);
    if(!(definition.weight>0) || !Number.isFinite(definition.weight)) throw new Error(`MR_TI_2_INVALID_CLAIM_WEIGHT:${definition.key}`);
    map.set(definition.key,definition);
  }
  return map;
}

function overallReviewState(contributions:readonly MrTi2ClaimContribution[]):MrTi2ClaimReviewState{
  let state:MrTi2ClaimReviewState="AUTO";
  for(const item of contributions){ if(REVIEW_RANK[item.reviewState]>REVIEW_RANK[state]) state=item.reviewState; }
  return state;
}

function entityProbabilityState(contributions:readonly MrTi2ClaimContribution[]):MrTi2EntityProbabilityState {
  const represented=contributions.filter((item)=>item.represented);
  if(represented.length===0||represented.every((item)=>item.truthProbability===null)) return "UNCALIBRATED";
  if(represented.every((item)=>item.truthProbability!==null)) return "EMPIRICALLY_CALIBRATED";
  return "PARTIALLY_CALIBRATED";
}

export function calculateMrTi2FoundationalModifier(foundationalIntegrity:number):number{
  const fi=clamp01(foundationalIntegrity);
  return clamp01(1-Math.pow(1-fi,1.5));
}

export function aggregateMrTi2EntityTruth(input:MrTi2EntityAggregationInput):MrTi2EntityTruthResult{
  const definitions=claimDefinitionMap(input.definitions);
  const unknownClaimKeys=Object.keys(input.claims).filter((key)=>!definitions.has(key));
  if(unknownClaimKeys.length) throw new Error(`MR_TI_2_UNCONTRACTED_CLAIMS:${unknownClaimKeys.join(",")}`);

  const contributions:MrTi2ClaimContribution[]=input.definitions.map((definition)=>{
    const state=input.claims[definition.key];
    const represented=Boolean(state?.represented && state.evidenceBalance!==null);
    const evidenceBalance=represented?clamp01(state!.evidenceBalance as number):null;
    const evidenceSufficiency=represented?clamp01(state!.evidenceSufficiency):0;
    const directContradiction=state?assessMrTi2Contradiction(state.supportStrength,state.contradictionStrength):null;
    return {
      claimKey:definition.key,
      impactClass:definition.impactClass,
      weight:definition.weight,
      represented,
      supportStrength:represented?clamp01(state!.supportStrength):0,
      contradictionStrength:represented?clamp01(state!.contradictionStrength):0,
      relationshipContradictionStrength:represented?clamp01(state!.relationshipContradictionStrength):0,
      directContradictionSeverity:represented?(directContradiction?.severity??0):0,
      directReviewState:represented?(directContradiction?.reviewState??"AUTO"):"AUTO",
      evidenceBalance,
      evidenceSufficiency,
      truthProbability:state?.truthProbability??null,
      probabilityState:state?.probabilityState??"UNCALIBRATED",
      weightedEvidenceBalanceMass:represented?definition.weight*(evidenceBalance as number):0,
      contradictionSeverity:state?.severity??0,
      reviewState:state?.reviewState??"AUTO",
      dependencyConstrained:state?.dependencyConstrained??false,
      evidenceCount:state?.evidenceCount??0,
      dependenceFamilyCount:state?.dependenceFamilyCount??0,
      undatedEvidenceCount:state?.undatedEvidenceCount??0,
      minimumFreshnessModifier:state?.minimumFreshnessModifier??0,
    };
  });

  const coverageClaims=contributions.filter((item)=>definitions.get(item.claimKey)!.countsTowardCoverage);
  const totalWeight=coverageClaims.reduce((sum,item)=>sum+item.weight,0);
  if(!(totalWeight>0)) throw new Error("MR_TI_2_ZERO_ENTITY_WEIGHT");
  const represented=coverageClaims.filter((item)=>item.represented);
  const representedWeight=represented.reduce((sum,item)=>sum+item.weight,0);
  const weightedEvidenceBalanceMass=represented.reduce((sum,item)=>sum+item.weight*(item.evidenceBalance as number),0);
  const weightedEvidenceSufficiencyMass=represented.reduce((sum,item)=>sum+item.weight*item.evidenceSufficiency,0);

  const coverage=representedWeight/totalWeight;
  const evidenceSufficiency=representedWeight>0?weightedEvidenceSufficiencyMass/representedWeight:0;
  const baseTruth=weightedEvidenceBalanceMass/totalWeight;

  // Missing foundational claims remain unknown, not false. Their absence is already paid
  // for through coverage/baseTruth. Foundational integrity evaluates represented foundations.
  const representedFoundational=contributions.filter((item)=>item.impactClass==="FOUNDATIONAL"&&item.represented);
  const foundationalWeight=representedFoundational.reduce((sum,item)=>sum+item.weight,0);
  const foundationalEvidenceBalanceMass=representedFoundational.reduce((sum,item)=>sum+item.weight*(item.evidenceBalance as number),0);
  const foundationalIntegrity=foundationalWeight>0?foundationalEvidenceBalanceMass/foundationalWeight:1;
  const foundationalModifier=calculateMrTi2FoundationalModifier(foundationalIntegrity);
  const truthIndex=Math.min(TRUTH_CAP,100*baseTruth*foundationalModifier);

  const calibratedWeight=represented.filter((item)=>item.truthProbability!==null).reduce((sum,item)=>sum+item.weight,0);
  const calibratedProbabilityCoverage=representedWeight>0?(calibratedWeight/representedWeight)*100:0;
  const maxContradictionSeverity=contributions.reduce((max,item)=>Math.max(max,item.contradictionSeverity),0);
  const missingClaims=contributions.filter((item)=>!item.represented).map((item)=>item.claimKey);
  const contradictedClaims=contributions.filter((item)=>item.reviewState!=="AUTO").map((item)=>item.claimKey);
  const dependencyConstrainedClaims=contributions.filter((item)=>item.dependencyConstrained).map((item)=>item.claimKey);
  const temporallyUncertainClaims=contributions.filter((item)=>item.undatedEvidenceCount>0).map((item)=>item.claimKey);
  const limitingClaims=[...contributions]
    .filter((item)=>definitions.get(item.claimKey)!.countsTowardCoverage)
    .sort((a,b)=>{
      const aGap=a.weight*(1-(a.evidenceBalance??0));
      const bGap=b.weight*(1-(b.evidenceBalance??0));
      return bGap-aGap || b.weight-a.weight || a.claimKey.localeCompare(b.claimKey);
    })
    .slice(0,5)
    .map((item)=>item.claimKey);

  return {
    engineVersion:MR_TI_2_ENGINE_VERSION,
    contractVersion:MR_TI_2_CONTRACT_VERSION,
    truthSemanticsVersion:MR_TI_2_TRUTH_SEMANTICS_VERSION,
    entityType:input.entityType,
    state:{
      truthIndex,
      evidenceSufficiency:toPct(evidenceSufficiency),
      representedConfidence:toPct(evidenceSufficiency),
      coverage:Math.min(100,Math.max(0,coverage*100)),
      foundationalIntegrity:toPct(foundationalIntegrity),
      foundationalIntegrityRepresented:foundationalWeight>0,
      foundationalModifier,
      baseTruth:Math.min(TRUTH_CAP,Math.max(0,baseTruth*100)),
      maxContradictionSeverity,
      reviewState:overallReviewState(contributions),
      calibratedProbabilityCoverage:Math.min(100,Math.max(0,calibratedProbabilityCoverage)),
      probabilityState:entityProbabilityState(contributions),
    },
    diagnostics:{missingClaims,contradictedClaims,dependencyConstrainedClaims,limitingClaims,temporallyUncertainClaims,contributions},
    calculatedAt:input.calculatedAt??new Date().toISOString(),
  };
}
