import "server-only";
import { analyseBusiness } from "@/lib/intelligence/openai";
import { readWebsite, WebsiteReadError } from "@/lib/intelligence/website-reader";
import { claimBusinessAnalysisJob, completeBusinessAnalysisJob, deferBusinessAnalysisBackground, failBusinessAnalysisJob, updateBusinessAnalysisProgress } from "@/lib/intelligence/business-analysis-jobs";
import { StructuredAiOutputError } from "@/lib/ai/structured-response-gateway";
import { isPipelineOwnershipLost } from "@/lib/pipeline/ownership";
import { isOpenAIBackgroundPending } from "@/lib/ai/background-response";

function classify(error:unknown){
  if(error instanceof WebsiteReadError){
    const retryable=["WEBSITE_TIMEOUT","WEBSITE_UNAVAILABLE"].includes(error.code);
    return {code:error.code,message:retryable?"The public website could not be read completely. This analysis can retry safely.":"The supplied website could not be verified as a supported public source.",retryable};
  }
  if(error instanceof StructuredAiOutputError){
    return {code:"INVALID_AI_OUTPUT",message:error.safeMessage,retryable:true};
  }
  const message=error instanceof Error?error.message:"";
  if(/429|rate limit/i.test(message))return {code:"RATE_LIMIT",message:"The AI provider temporarily rate-limited this request. This analysis can retry safely.",retryable:true};
  if(/timeout|abort/i.test(message))return {code:"TIMEOUT",message:"An external research request timed out. This analysis can retry safely.",retryable:true};
  if(/AI_GOVERNANCE_BLOCKED/i.test(message)){
    const reason=["PLATFORM_DISABLED","AUTONOMY_DISABLED","PUBLIC_DAILY_REQUEST_LIMIT","PUBLIC_DAILY_COST_LIMIT","REQUEST_LIMIT","COST_LIMIT","CAMPAIGN_LIMIT"].find(value=>message.includes(value))??"LIMIT_REACHED";
    return {code:"AI_GOVERNANCE_BLOCKED",message:`AI_GOVERNANCE_BLOCKED:${reason}`,retryable:true};
  }
  if(/not configured|authentication|401/i.test(message))return {code:"CONFIGURATION",message:"The protected AI service configuration is incomplete.",retryable:false};
  if(/STRUCTURED_AI_OUTPUT|JSON|structured output|invalid response|unterminated string|unexpected end/i.test(message))return {code:"INVALID_AI_OUTPUT",message:"MarketRoute received an incomplete structured response. This stage can be retried safely.",retryable:true};
  return {code:"ANALYSIS_FAILED",message:"Business analysis encountered a technical interruption. No partial result was exposed.",retryable:true};
}

export async function runBusinessAnalysisJob(id:string,token:string){
  const job=await claimBusinessAnalysisJob(id,token);
  if(!job)return {claimed:false as const};
  if(typeof job.website_input!=="string"||!job.website_input.trim()||!job.worker_token)return {claimed:false as const};
  const workerToken=job.worker_token;
  const started=Date.now();
  try{
    const website=await readWebsite(job.website_input);
    await updateBusinessAnalysisProgress(id,token,workerToken,"ANALYSING_BUSINESS",52,website.canonicalUrl,website.sources.length);
    const analysis=await analyseBusiness({organisationId:job.organisation_id,publicAnalysis:job.requested_by===null,jobId:job.id,website:website.canonicalUrl,sources:website.sources});
    await updateBusinessAnalysisProgress(id,token,workerToken,"PREPARING_RECOMMENDATIONS",88,website.canonicalUrl,website.sources.length);
    await completeBusinessAnalysisJob(id,token,workerToken,website.canonicalUrl,website.sources.length,analysis,Date.now()-started);
    return {claimed:true as const,completed:true as const};
  }catch(error){
    if(isOpenAIBackgroundPending(error)){
      await deferBusinessAnalysisBackground(id,token,workerToken).catch(()=>undefined);
      return {claimed:true as const,completed:false as const,pending:true as const};
    }
    if(isPipelineOwnershipLost(error)){
      console.info("Business analysis worker superseded; stale result discarded",{jobId:id});
      return {claimed:false as const,superseded:true as const};
    }
    const failure=classify(error);
    console.warn("Business analysis job interrupted", { jobId:id, code:failure.code, retryable:failure.retryable, errorName:error instanceof Error ? error.name : typeof error, errorMessage:error instanceof Error ? error.message.slice(0,500) : "unknown" });
    await failBusinessAnalysisJob(id,token,workerToken,failure.code,failure.message,failure.retryable);
    return {claimed:true as const,completed:false as const,failure};
  }
}
