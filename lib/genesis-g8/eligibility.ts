import type { GenesisG8HydratedKnowledge, GenesisG8IntelligenceGap } from "./hydration";

export type GenesisG8KnowledgeEligibility = "READY" | "READY_WITH_GAPS" | "REFRESH_REQUIRED" | "HUMAN_REVIEW_REQUIRED" | "NOT_USABLE";
export type GenesisG8KnowledgeDirective = "USE_KNOWLEDGE" | "USE_KNOWLEDGE_WITH_GAP_REPAIR" | "REFRESH_THEN_USE" | "HUMAN_REVIEW" | "DISCOVERY_ONLY";
export type GenesisG8EligibilityReason = "ENTITY_SUPPRESSED" | "ENTITY_SUPERSEDED" | "HUMAN_REJECTED" | "EXPLICIT_REVIEW_PENDING" | "MATERIAL_CONTRADICTION" | "LOW_TRUTH_INDEX" | "LOW_CONFIDENCE" | "LOW_COVERAGE" | "NONCRITICAL_GAPS" | "HUMAN_APPROVED_OVERRIDE" | "VERIFICATION_REQUIRED";
export interface GenesisG8EligibilityPolicy { readyTruthIndex:number; readyConfidence:number; readyCoverage:number; minimumUsableTruthIndex:number; minimumUsableConfidence:number; }
export const DEFAULT_GENESIS_G8_ELIGIBILITY_POLICY:GenesisG8EligibilityPolicy={readyTruthIndex:85,readyConfidence:80,readyCoverage:80,minimumUsableTruthIndex:55,minimumUsableConfidence:60};
export interface GenesisG8EligibilityResult {status:GenesisG8KnowledgeEligibility;directive:GenesisG8KnowledgeDirective;usable:boolean;reasons:GenesisG8EligibilityReason[];truthIndex:number;confidence:number;coverage:number;reviewState:GenesisG8HydratedKnowledge["entity"]["reviewState"];entityStatus:GenesisG8HydratedKnowledge["entity"]["status"];blockingGaps:GenesisG8IntelligenceGap[];repairableGaps:GenesisG8IntelligenceGap[];evaluatedAt:string;}
function result(h:GenesisG8HydratedKnowledge,status:GenesisG8KnowledgeEligibility,directive:GenesisG8KnowledgeDirective,reasons:GenesisG8EligibilityReason[],blockingGaps:GenesisG8IntelligenceGap[],repairableGaps:GenesisG8IntelligenceGap[]):GenesisG8EligibilityResult{return{status,directive,usable:status==="READY"||status==="READY_WITH_GAPS",reasons:[...new Set(reasons)],truthIndex:h.truth.truthIndex,confidence:h.truth.confidence,coverage:h.truth.coverage,reviewState:h.entity.reviewState,entityStatus:h.entity.status,blockingGaps,repairableGaps,evaluatedAt:h.hydratedAt};}
export function evaluateGenesisG8KnowledgeEligibility(h:GenesisG8HydratedKnowledge,policy:GenesisG8EligibilityPolicy=DEFAULT_GENESIS_G8_ELIGIBILITY_POLICY):GenesisG8EligibilityResult{
  if(h.entity.status==="SUPPRESSED") return result(h,"NOT_USABLE","DISCOVERY_ONLY",["ENTITY_SUPPRESSED"],h.gaps,[]);
  if(h.entity.status==="SUPERSEDED") return result(h,"NOT_USABLE","DISCOVERY_ONLY",["ENTITY_SUPERSEDED"],h.gaps,[]);
  if(h.entity.reviewState==="HUMAN_REJECTED") return result(h,"NOT_USABLE","DISCOVERY_ONLY",["HUMAN_REJECTED"],h.gaps,[]);
  if(h.entity.reviewState==="HUMAN_APPROVED") return result(h,"READY_WITH_GAPS","USE_KNOWLEDGE_WITH_GAP_REPAIR",["HUMAN_APPROVED_OVERRIDE"],[],h.gaps);
  if(h.entity.reviewState==="NEEDS_REVIEW") return result(h,"HUMAN_REVIEW_REQUIRED","HUMAN_REVIEW",["EXPLICIT_REVIEW_PENDING"],h.gaps.filter(g=>g.reason==="CONTRADICTED"),h.gaps.filter(g=>g.reason!=="CONTRADICTED"));
  if(h.truth.review.state==="HUMAN_REVIEW_REQUIRED") return result(h,"HUMAN_REVIEW_REQUIRED","HUMAN_REVIEW",["MATERIAL_CONTRADICTION"],h.gaps.filter(g=>g.reason==="CONTRADICTED"),h.gaps.filter(g=>g.reason!=="CONTRADICTED"));
  if(h.truth.review.state==="VERIFY") return result(h,"REFRESH_REQUIRED","REFRESH_THEN_USE",["VERIFICATION_REQUIRED"],h.gaps.filter(g=>g.reason==="CONTRADICTED"),h.gaps.filter(g=>g.reason!=="CONTRADICTED"));
  const {truthIndex,confidence,coverage}=h.truth;
  if(truthIndex>=policy.readyTruthIndex&&confidence>=policy.readyConfidence&&coverage>=policy.readyCoverage&&h.gaps.length===0) return result(h,"READY","USE_KNOWLEDGE",[],[],[]);
  if(truthIndex>=policy.minimumUsableTruthIndex&&confidence>=policy.minimumUsableConfidence){const reasons:GenesisG8EligibilityReason[]=[];if(coverage<policy.readyCoverage)reasons.push("LOW_COVERAGE");if(h.gaps.length)reasons.push("NONCRITICAL_GAPS");return result(h,"READY_WITH_GAPS","USE_KNOWLEDGE_WITH_GAP_REPAIR",reasons,[],h.gaps);}
  const reasons:GenesisG8EligibilityReason[]=[];if(truthIndex<policy.minimumUsableTruthIndex)reasons.push("LOW_TRUTH_INDEX");if(confidence<policy.minimumUsableConfidence)reasons.push("LOW_CONFIDENCE");if(coverage<policy.readyCoverage)reasons.push("LOW_COVERAGE");return result(h,"NOT_USABLE","DISCOVERY_ONLY",reasons,[],h.gaps);
}
