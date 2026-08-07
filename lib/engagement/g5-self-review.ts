import "server-only";
import { databaseRequest } from "@/lib/database/postgrest";
import { isPipelineOwnershipLost } from "@/lib/pipeline/ownership";
import { reviewG5Outreach } from "./g5-self-review-openai";

export type G5SelfReviewWorkerResult={processed:boolean;outcome:"NO_JOB"|"PASS"|"REWRITE"|"BLOCK"|"FAILED_RETRYABLE"|"SUPERSEDED";strategyId?:string;opportunityId?:string};
type Claim={strategy_id:string;lease_token:string;opportunity_id:string};
type Context={organisation_id:string;campaign_id:string;commercial_reasoning_json:Record<string,unknown>;channel_strategy_json:Record<string,unknown>;source_snapshot_json:Record<string,unknown>;personalisation_safety_json:Record<string,unknown>;outreach_generation_json:Record<string,unknown>;rewrite_count:number};

export async function runNextG5SelfReview(schedulerRunId:string):Promise<G5SelfReviewWorkerResult>{
  const claims=await databaseRequest<Claim[]>("rpc/claim_g5_self_review",{method:"POST",body:JSON.stringify({p_scheduler_run_id:schedulerRunId,p_lease_seconds:180})});
  const claim=claims[0]; if(!claim) return {processed:false,outcome:"NO_JOB"};
  try{
    const rows=await databaseRequest<Context[]>("rpc/get_g5_self_review_context_owned",{method:"POST",body:JSON.stringify({p_strategy_id:claim.strategy_id,p_scheduler_run_id:schedulerRunId,p_lease_token:claim.lease_token})});
    const context=rows[0]; if(!context) throw new Error("G5_SELF_REVIEW_CONTEXT_MISSING");
    const reviewed=await reviewG5Outreach({organisationId:context.organisation_id,campaignId:context.campaign_id,schedulerRunId,strategyId:claim.strategy_id,rewriteCount:context.rewrite_count,context:{commercialReasoning:context.commercial_reasoning_json,channelStrategy:context.channel_strategy_json,immutableG4:context.source_snapshot_json,personalisationSafety:context.personalisation_safety_json,outreach:context.outreach_generation_json,rewriteCount:context.rewrite_count}});
    const result=await databaseRequest<{state:string}[]>("rpc/complete_g5_self_review_owned",{method:"POST",body:JSON.stringify({p_strategy_id:claim.strategy_id,p_scheduler_run_id:schedulerRunId,p_lease_token:claim.lease_token,p_review_json:reviewed.result,p_schema_version:reviewed.result.schemaVersion,p_prompt_version:reviewed.result.promptVersion,p_model:reviewed.model,p_outcome:reviewed.result.outcome,p_confidence:reviewed.result.overallConfidence,p_source_fingerprint:reviewed.sourceFingerprint})});
    void result;
    return {processed:true,outcome:reviewed.result.outcome,strategyId:claim.strategy_id,opportunityId:claim.opportunity_id};
  }catch(error){
    if(isPipelineOwnershipLost(error)||(error instanceof Error&&error.message.includes("G5_ENGAGEMENT_OWNERSHIP_LOST"))) return {processed:false,outcome:"SUPERSEDED",strategyId:claim.strategy_id,opportunityId:claim.opportunity_id};
    await databaseRequest("rpc/fail_g5_self_review_owned",{method:"POST",body:JSON.stringify({p_strategy_id:claim.strategy_id,p_scheduler_run_id:schedulerRunId,p_lease_token:claim.lease_token,p_reason:error instanceof Error?error.message:"G5_SELF_REVIEW_FAILED",p_retry_after_seconds:60})}).catch(()=>undefined);
    return {processed:true,outcome:"FAILED_RETRYABLE",strategyId:claim.strategy_id,opportunityId:claim.opportunity_id};
  }
}
