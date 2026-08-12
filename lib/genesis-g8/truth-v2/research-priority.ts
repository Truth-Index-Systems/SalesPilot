import type { MrTi2EntityTruthResult } from "./entity";
import { getMrTi2ClaimContract } from "./contracts";

export type MrTi2ResearchAction="RESEARCH_MISSING"|"VERIFY_CONTRADICTION"|"RESEARCH_LIMITING"|"HUMAN_REVIEW"|"REFRESH_TEMPORAL_UNCERTAINTY";
export interface MrTi2ResearchPriority { claimKey:string; action:MrTi2ResearchAction; priority:number; rationale:string; }

const impactMultiplier={FOUNDATIONAL:1.25,COMMERCIAL:1,SUPPORTING:.6,OPTIONAL:.25} as const;

export function prioritiseMrTi2Research(result:MrTi2EntityTruthResult):MrTi2ResearchPriority[]{
  const contract=getMrTi2ClaimContract(result.entityType);
  const defs=new Map(contract.claims.map((claim)=>[claim.key,claim]));
  const contributions=new Map(result.diagnostics.contributions.map((item)=>[item.claimKey,item]));
  const rows:MrTi2ResearchPriority[]=[];
  for(const key of new Set([...result.diagnostics.missingClaims,...result.diagnostics.limitingClaims,...result.diagnostics.contradictedClaims,...result.diagnostics.temporallyUncertainClaims])){
    const definition=defs.get(key); const contribution=contributions.get(key); if(!definition) continue;
    const impact=impactMultiplier[definition.impactClass];
    const evidenceGap=definition.weight*(1-(contribution?.evidenceBalance??0));
    if(contribution?.reviewState==="HUMAN_REVIEW_REQUIRED"){
      rows.push({claimKey:key,action:"HUMAN_REVIEW",priority:1000+definition.weight*100*impact,rationale:"Strong evidence exists on both sides; deterministic research must not silently resolve this claim."});
      continue;
    }
    if(contribution?.reviewState==="VERIFY"){
      rows.push({claimKey:key,action:"VERIFY_CONTRADICTION",priority:700+definition.weight*100*impact+contribution.contradictionSeverity*100,rationale:"The claim has material two-sided evidence and needs another independent verification source."});
      continue;
    }
    if(!contribution?.represented){
      rows.push({claimKey:key,action:"RESEARCH_MISSING",priority:500+definition.weight*100*impact,rationale:`Missing ${definition.impactClass.toLowerCase()} claim; weighted coverage is constrained until evidence is found.`});
      continue;
    }
    if(contribution.undatedEvidenceCount>0 && contribution.minimumFreshnessModifier<0.5){
      rows.push({claimKey:key,action:"REFRESH_TEMPORAL_UNCERTAINTY",priority:400+definition.weight*100*impact,rationale:"The claim relies on evidence with unknown publication time that has materially decayed since observation."});
      continue;
    }
    rows.push({claimKey:key,action:"RESEARCH_LIMITING",priority:300+evidenceGap*100*impact,rationale:"This represented claim is one of the largest remaining weighted Truth Index evidence gaps."});
  }
  return rows.sort((a,b)=>b.priority-a.priority||a.claimKey.localeCompare(b.claimKey));
}
