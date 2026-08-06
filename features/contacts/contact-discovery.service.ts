import "server-only";
import { databaseRequest } from "@/lib/database/postgrest";
import { discoverContacts } from "@/lib/contacts/openai";
import type { WorkerExecutionContext, WorkerExecutionResult } from "@/lib/pipeline/executor";
import { classifyPipelineError } from "@/lib/pipeline/errors";
import { createResultSummary } from "@/lib/pipeline/result-summary";

function safeError(error:unknown){const m=error instanceof Error?error.message:"CONTACT_DISCOVERY_FAILED";return m.startsWith("OPENAI_CONTACT_DISCOVERY_FAILED:")?m.slice(0,500):["OPENAI_API_KEY_NOT_CONFIGURED","CONTACT_DISCOVERY_COMPANY_MISMATCH","CONTACT_DISCOVERY_NO_VERIFIED_CONTACTS","CAMPAIGN_NOT_FOUND","COMPANY_NOT_FOUND","BUSINESS_PROFILE_NOT_FOUND"].includes(m)?m:"CONTACT_DISCOVERY_FAILED";}

export type ContactDiscoveryExecutionOptions={campaignId?:string|null;freshOnly?:boolean};

export async function runNextContactDiscovery(context:WorkerExecutionContext,options:ContactDiscoveryExecutionOptions={}):Promise<WorkerExecutionResult> {
  const startedAt=Date.now();
  const claimed=await databaseRequest<Array<{session_id:string;organisation_id:string;campaign_id:string;company_id:string;route_expansion_pass?:number}>>("rpc/claim_contact_discovery",{method:"POST",body:JSON.stringify({p_scheduler_run_id:context.schedulerRunId,p_campaign_id:options.campaignId??null,p_fresh_only:options.freshOnly??false})});
  const job=claimed[0]; if(!job) return {worker:"CONTACT_DISCOVERY",processed:false,outcome:"NO_JOB"};
  try{
    const companies=await databaseRequest<any[]>(`companies?id=eq.${job.company_id}&campaign_id=eq.${job.campaign_id}&organisation_id=eq.${job.organisation_id}&review_status=eq.APPROVED&limit=1`);
    const company=companies[0]; if(!company) throw new Error("COMPANY_NOT_FOUND");
    const campaigns=await databaseRequest<any[]>(`campaign_detail?id=eq.${job.campaign_id}&organisation_id=eq.${job.organisation_id}&limit=1`);
    const campaign=campaigns[0]; if(!campaign) throw new Error("CAMPAIGN_NOT_FOUND");
    const campaignRows=await databaseRequest<any[]>(`campaigns?id=eq.${job.campaign_id}&organisation_id=eq.${job.organisation_id}&limit=1&select=business_profile_id`);
    const profileId=campaignRows[0]?.business_profile_id; if(!profileId) throw new Error("BUSINESS_PROFILE_NOT_FOUND");
    const profiles=await databaseRequest<any[]>(`business_profile_versions?business_profile_id=eq.${profileId}&organisation_id=eq.${job.organisation_id}&order=version_number.desc&limit=1&select=payload_json`);
    const business=profiles[0]?.payload_json??{};
    await databaseRequest("rpc/update_contact_discovery_progress",{method:"POST",body:JSON.stringify({p_session_id:job.session_id,p_stage:"RESEARCHING",p_progress:30})});
    const result=await discoverContacts({organisationId:job.organisation_id,campaignId:job.campaign_id,schedulerRunId:context.schedulerRunId,jobId:job.session_id,company,campaign:{name:campaign.name,objective:campaign.objective,audience:campaign.audience,buyerRoles:campaign.buyer_roles,messageAngle:campaign.message_angle},business,routeExpansionPass:Number(job.route_expansion_pass??0)});
    await databaseRequest("rpc/update_contact_discovery_progress",{method:"POST",body:JSON.stringify({p_session_id:job.session_id,p_stage:"VALIDATING",p_progress:72,p_candidates:result.contacts.length})});
    await databaseRequest("rpc/save_company_contact_channels",{method:"POST",body:JSON.stringify({p_session_id:job.session_id,p_channels:result.companyContactChannels})});
    const saved=result.contacts.length===0?0:Number(await databaseRequest<number>("rpc/save_contact_discovery_batch",{method:"POST",body:JSON.stringify({p_session_id:job.session_id,p_contacts:result.contacts,p_research_summary:result.researchSummary,p_uncertainties:result.uncertainties,p_unresolved_roles:result.unresolvedRoles})}));
    const readinessRows=await databaseRequest<Array<{action:"READY"|"EXPAND"|"EXHAUSTED";primary_ready:boolean;fallback_ready:boolean;route_count:number;expansion_pass:number}>>("rpc/evaluate_contact_discovery_route_readiness",{method:"POST",body:JSON.stringify({p_session_id:job.session_id,p_research_summary:result.researchSummary,p_uncertainties:result.uncertainties,p_unresolved_roles:result.unresolvedRoles})});
    const readiness=readinessRows[0];
    if(readiness?.action==="EXPAND") return {worker:"CONTACT_DISCOVERY",processed:true,outcome:"ROUTE_EXPANSION_QUEUED",sessionId:job.session_id,saved};
    if(saved===0){
      const completed=Number(await databaseRequest<number>("rpc/complete_contact_discovery_without_matches",{method:"POST",body:JSON.stringify({p_session_id:job.session_id,p_research_summary:result.researchSummary,p_uncertainties:result.uncertainties,p_unresolved_roles:result.unresolvedRoles})}));
      return {worker:"CONTACT_DISCOVERY",processed:true,outcome:readiness?.action==="EXHAUSTED"?"ROUTE_RESEARCH_EXHAUSTED":"COMPLETED_NO_RESULTS",sessionId:job.session_id,saved:completed};
    }
    const finalSaved=Number(await databaseRequest<number>("rpc/finalize_contact_discovery",{method:"POST",body:JSON.stringify({p_session_id:job.session_id,p_result_summary:createResultSummary(readiness?.action==="EXHAUSTED"?"ROUTE_RESEARCH_EXHAUSTED":"COMPLETED_WITH_RESULTS",saved,startedAt)})}));
    return {worker:"CONTACT_DISCOVERY",processed:true,outcome:"COMPLETED_WITH_RESULTS",sessionId:job.session_id,saved:finalSaved};
  }catch(error){const classified=classifyPipelineError(error);await databaseRequest("rpc/record_contact_discovery_failure",{method:"POST",body:JSON.stringify({p_session_id:job.session_id,p_error_code:classified.code,p_error_message:safeError(error),p_retryable:classified.retryable})}).catch(()=>undefined);throw error;}
}
