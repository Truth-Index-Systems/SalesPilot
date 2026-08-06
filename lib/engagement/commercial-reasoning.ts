import "server-only";
import { databaseRequest } from "@/lib/database/postgrest";
import { reasonAboutEngagement } from "./commercial-reasoning-openai";

export type CommercialReasoningWorkerResult={processed:boolean;outcome:"NO_JOB"|"COMPLETED"|"FAILED_RETRYABLE";analysisId?:string;engagementId?:string};
type Claim={analysis_id:string;organisation_id:string;campaign_id:string;engagement_id:string;context_json:Record<string,unknown>};

export async function runNextCommercialReasoning(schedulerRunId:string):Promise<CommercialReasoningWorkerResult>{
  const claimed=await databaseRequest<Claim[]>("rpc/claim_engagement_commercial_reasoning",{method:"POST",body:JSON.stringify({p_scheduler_run_id:schedulerRunId})});
  const job=claimed[0]; if(!job)return {processed:false,outcome:"NO_JOB"};
  try{
    const generated=await reasonAboutEngagement({organisationId:job.organisation_id,campaignId:job.campaign_id,schedulerRunId,analysisId:job.analysis_id,context:job.context_json});
    await databaseRequest("rpc/complete_engagement_commercial_reasoning",{method:"POST",body:JSON.stringify({p_analysis_id:job.analysis_id,p_output_json:generated.result,p_prompt_version:generated.result.promptVersion,p_schema_version:generated.result.schemaVersion,p_confidence:generated.result.confidence,p_model:generated.model})});
    return {processed:true,outcome:"COMPLETED",analysisId:job.analysis_id,engagementId:job.engagement_id};
  }catch(error){
    await databaseRequest("rpc/fail_engagement_commercial_reasoning",{method:"POST",body:JSON.stringify({p_analysis_id:job.analysis_id,p_error:error instanceof Error?error.message:"COMMERCIAL_REASONING_FAILED"})}).catch(()=>undefined);
    return {processed:true,outcome:"FAILED_RETRYABLE",analysisId:job.analysis_id,engagementId:job.engagement_id};
  }
}
