import "server-only";
import { analyseBusiness } from "@/lib/intelligence/openai";
import { readWebsite, WebsiteReadError } from "@/lib/intelligence/website-reader";
import { claimBusinessAnalysisJob, completeBusinessAnalysisJob, failBusinessAnalysisJob, updateBusinessAnalysisProgress } from "@/lib/intelligence/business-analysis-jobs";

function classify(error:unknown){
  if(error instanceof WebsiteReadError){
    return {code:error.code,message:error.message,retryable:["WEBSITE_TIMEOUT","WEBSITE_UNAVAILABLE"].includes(error.code)};
  }
  const message=error instanceof Error?error.message:"Business analysis failed";
  if(/429|rate limit/i.test(message))return {code:"RATE_LIMIT",message,retryable:true};
  if(/timeout|abort/i.test(message))return {code:"TIMEOUT",message,retryable:true};
  if(/AI_GOVERNANCE_BLOCKED/i.test(message))return {code:"AI_GOVERNANCE_BLOCKED",message,retryable:false};
  if(/not configured|authentication|401/i.test(message))return {code:"CONFIGURATION",message,retryable:false};
  if(/STRUCTURED_AI_OUTPUT|JSON|structured output|invalid response/i.test(message))return {code:"INVALID_AI_OUTPUT",message:"SalesPilot received an incomplete structured response. This stage can be retried safely.",retryable:true};
  return {code:"ANALYSIS_FAILED",message,retryable:true};
}

export async function runBusinessAnalysisJob(id:string,token:string){
  const job=await claimBusinessAnalysisJob(id,token);
  if(!job)return {claimed:false as const};
  if(typeof job.website_input!=="string"||!job.website_input.trim())return {claimed:false as const};
  const started=Date.now();
  try{
    const website=await readWebsite(job.website_input);
    await updateBusinessAnalysisProgress(id,token,"ANALYSING_BUSINESS",52,website.canonicalUrl,website.sources.length);
    const analysis=await analyseBusiness({organisationId:job.organisation_id,jobId:job.id,website:website.canonicalUrl,sources:website.sources});
    await updateBusinessAnalysisProgress(id,token,"PREPARING_RECOMMENDATIONS",88,website.canonicalUrl,website.sources.length);
    await completeBusinessAnalysisJob(id,token,website.canonicalUrl,website.sources.length,analysis,Date.now()-started);
    return {claimed:true as const,completed:true as const};
  }catch(error){
    const failure=classify(error);
    await failBusinessAnalysisJob(id,token,failure.code,failure.message,failure.retryable);
    return {claimed:true as const,completed:false as const,failure};
  }
}
