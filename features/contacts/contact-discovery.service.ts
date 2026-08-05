import "server-only";
import { databaseRequest } from "@/lib/database/postgrest";
import { discoverContacts } from "@/lib/contacts/openai";

function safeError(error:unknown){const m=error instanceof Error?error.message:"CONTACT_DISCOVERY_FAILED";return m.startsWith("OPENAI_CONTACT_DISCOVERY_FAILED:")?m.slice(0,500):["OPENAI_API_KEY_NOT_CONFIGURED","CONTACT_DISCOVERY_COMPANY_MISMATCH","CONTACT_DISCOVERY_NO_VERIFIED_CONTACTS","CAMPAIGN_NOT_FOUND","COMPANY_NOT_FOUND","BUSINESS_PROFILE_NOT_FOUND"].includes(m)?m:"CONTACT_DISCOVERY_FAILED";}

export async function runNextContactDiscovery():Promise<{processed:boolean;sessionId?:string;saved?:number}> {
  const claimed=await databaseRequest<Array<{session_id:string;organisation_id:string;campaign_id:string;company_id:string}>>("rpc/claim_contact_discovery",{method:"POST",body:"{}"});
  const job=claimed[0]; if(!job) return {processed:false};
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
    const result=await discoverContacts({company,campaign:{name:campaign.name,objective:campaign.objective,audience:campaign.audience,buyerRoles:campaign.buyer_roles,messageAngle:campaign.message_angle},business});
    await databaseRequest("rpc/update_contact_discovery_progress",{method:"POST",body:JSON.stringify({p_session_id:job.session_id,p_stage:"VALIDATING",p_progress:72,p_candidates:result.contacts.length})});
    if(result.contacts.length===0){
      const completed=Number(await databaseRequest<number>("rpc/complete_contact_discovery_without_matches",{method:"POST",body:JSON.stringify({p_session_id:job.session_id,p_research_summary:result.researchSummary,p_uncertainties:result.uncertainties,p_unresolved_roles:result.unresolvedRoles})}));
      return {processed:true,sessionId:job.session_id,saved:completed};
    }
    const saved=Number(await databaseRequest<number>("rpc/save_contact_discovery_batch",{method:"POST",body:JSON.stringify({p_session_id:job.session_id,p_contacts:result.contacts,p_research_summary:result.researchSummary,p_uncertainties:result.uncertainties,p_unresolved_roles:result.unresolvedRoles})}));
    if(saved===0){
      const completed=Number(await databaseRequest<number>("rpc/complete_contact_discovery_without_matches",{method:"POST",body:JSON.stringify({p_session_id:job.session_id,p_research_summary:result.researchSummary,p_uncertainties:result.uncertainties,p_unresolved_roles:result.unresolvedRoles})}));
      return {processed:true,sessionId:job.session_id,saved:completed};
    }
    const finalSaved=Number(await databaseRequest<number>("rpc/finalize_contact_discovery",{method:"POST",body:JSON.stringify({p_session_id:job.session_id})}));
    return {processed:true,sessionId:job.session_id,saved:finalSaved};
  }catch(error){await databaseRequest("rpc/fail_contact_discovery",{method:"POST",body:JSON.stringify({p_session_id:job.session_id,p_error:safeError(error)})}).catch(()=>undefined);throw error;}
}
