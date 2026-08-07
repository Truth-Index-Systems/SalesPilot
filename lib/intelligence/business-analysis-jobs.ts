import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { databaseRequest } from "@/lib/database/postgrest";
import { getCurrentUser } from "@/lib/auth/current-user";
import { sanitisePostgresJson, stripPostgresNul } from "@/lib/database/postgres-json";

type JobStatus = "QUEUED"|"RUNNING"|"COMPLETED"|"FAILED_RETRYABLE"|"FAILED_TERMINAL"|"CANCELLED";
export type BusinessAnalysisJob = {
  id:string; organisation_id:string|null; website_input:string; canonical_url:string|null; status:JobStatus; stage:string; progress:number;
  attempt_count:number; next_retry_at:string|null; last_error_code:string|null; last_error_message:string|null;
  pages_read:number; analysis_json:unknown|null; worker_token?:string|null; created_at:string; updated_at:string;
};

export function hashAnalysisToken(token:string){return createHash("sha256").update(token).digest("hex");}

async function optionalOrganisation(){
  const user=await getCurrentUser();
  if(!user)return {userId:null,organisationId:null};
  const memberships=await databaseRequest<Array<{organisation_id:string}>>(`organisation_memberships?user_id=eq.${encodeURIComponent(user.id)}&status=eq.ACTIVE&select=organisation_id&order=created_at.asc&limit=1`);
  return {userId:user.id,organisationId:memberships[0]?.organisation_id??null};
}

export async function createBusinessAnalysisJob(website:string){
  const accessToken=randomBytes(32).toString("base64url");
  const accessTokenHash=hashAnalysisToken(accessToken);
  const owner=await optionalOrganisation();
  const rows=await databaseRequest<BusinessAnalysisJob[]>("business_analysis_jobs",{method:"POST",headers:{Prefer:"return=representation"},body:JSON.stringify({organisation_id:owner.organisationId,requested_by:owner.userId,access_token_hash:accessTokenHash,website_input:website})});
  const job=rows[0]; if(!job)throw new Error("ANALYSIS_JOB_CREATE_FAILED");
  return {job,accessToken};
}

export async function getBusinessAnalysisJob(id:string,token:string){
  const hash=hashAnalysisToken(token);
  const rows=await databaseRequest<BusinessAnalysisJob[]>(`business_analysis_jobs?id=eq.${encodeURIComponent(id)}&access_token_hash=eq.${hash}&select=id,organisation_id,website_input,canonical_url,status,stage,progress,attempt_count,next_retry_at,last_error_code,last_error_message,pages_read,analysis_json,created_at,updated_at&limit=1`);
  return rows[0]??null;
}

export async function claimBusinessAnalysisJob(id:string,token:string){
  const rows=await databaseRequest<BusinessAnalysisJob[]|BusinessAnalysisJob|null>("rpc/claim_business_analysis_job",{method:"POST",body:JSON.stringify({p_job_id:id,p_access_token_hash:hashAnalysisToken(token),p_lease_seconds:290})});
  const claimed=Array.isArray(rows)?rows[0]??null:rows;
  // PostgreSQL composite-returning functions can serialise an unmatched row as
  // an object whose fields are all null. Treat that as "not claimed".
  if(!claimed||typeof claimed.id!=="string"||!claimed.id)return null;
  if(typeof claimed.website_input!=="string"||!claimed.website_input.trim())return null;
  return claimed;
}
export async function updateBusinessAnalysisProgress(id:string,token:string,workerToken:string,stage:string,progress:number,canonicalUrl?:string,pagesRead?:number){
  await databaseRequest("rpc/update_business_analysis_progress_owned",{method:"POST",body:JSON.stringify({p_job_id:id,p_access_token_hash:hashAnalysisToken(token),p_worker_token:workerToken,p_stage:stage,p_progress:progress,p_canonical_url:canonicalUrl??null,p_pages_read:pagesRead??null})});
}
export async function completeBusinessAnalysisJob(id:string,token:string,workerToken:string,canonicalUrl:string,pagesRead:number,analysis:unknown,durationMs:number){
  const safeAnalysis=sanitisePostgresJson(analysis);
  await databaseRequest("rpc/complete_business_analysis_job_owned",{method:"POST",body:JSON.stringify({p_job_id:id,p_access_token_hash:hashAnalysisToken(token),p_worker_token:workerToken,p_canonical_url:stripPostgresNul(canonicalUrl),p_pages_read:pagesRead,p_analysis:safeAnalysis,p_result_summary:sanitisePostgresJson({durationMs,pagesRead,completedAt:new Date().toISOString()})})});
}
export async function failBusinessAnalysisJob(id:string,token:string,workerToken:string,code:string,message:string,retryable:boolean){
  await databaseRequest("rpc/fail_business_analysis_job_owned",{method:"POST",body:JSON.stringify({p_job_id:id,p_access_token_hash:hashAnalysisToken(token),p_worker_token:workerToken,p_error_code:code,p_error_message:message,p_retryable:retryable})});
}
