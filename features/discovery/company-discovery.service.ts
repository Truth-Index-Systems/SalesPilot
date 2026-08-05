import "server-only";
import { databaseRequest } from "@/lib/database/postgrest";
import { discoverCompanies } from "@/lib/discovery/openai";

export async function runNextCompanyDiscovery(): Promise<{ processed: boolean; sessionId?: string; saved?: number }> {
  const claimed = await databaseRequest<Array<{session_id:string;organisation_id:string;campaign_id:string}>>("rpc/claim_company_discovery", {method:"POST",body:"{}"});
  const job = claimed[0];
  if (!job) return { processed:false };
  try {
    const campaigns = await databaseRequest<any[]>(`campaign_detail?id=eq.${job.campaign_id}&organisation_id=eq.${job.organisation_id}&limit=1`);
    const campaign = campaigns[0];
    if (!campaign) throw new Error("CAMPAIGN_NOT_FOUND");
    const campaignRows = await databaseRequest<any[]>(`campaigns?id=eq.${job.campaign_id}&organisation_id=eq.${job.organisation_id}&limit=1&select=business_profile_id`);
    const profileId = campaignRows[0]?.business_profile_id;
    if (!profileId) throw new Error("BUSINESS_PROFILE_NOT_FOUND");
    const profiles = await databaseRequest<any[]>(`business_profile_versions?business_profile_id=eq.${profileId}&organisation_id=eq.${job.organisation_id}&order=version_number.desc&limit=1&select=payload_json`);
    await databaseRequest("rpc/update_company_discovery_progress", {method:"POST",body:JSON.stringify({p_session_id:job.session_id,p_stage:"ANALYSING",p_progress:35})});
    const result = await discoverCompanies({
      campaign:{name:campaign.name,objective:campaign.objective,audience:campaign.audience,buyerRoles:campaign.buyer_roles,messageAngle:campaign.message_angle,why:campaign.why,fitScore:campaign.fit_score},
      business:profiles[0]?.payload_json ?? {name:campaign.business_name,summary:campaign.business_summary,website:campaign.website_url},
    });
    await databaseRequest("rpc/update_company_discovery_progress", {method:"POST",body:JSON.stringify({p_session_id:job.session_id,p_stage:"SAVING",p_progress:85,p_candidates:result.companies.length})});
    const saved = await databaseRequest<number>("rpc/complete_company_discovery", {method:"POST",body:JSON.stringify({p_session_id:job.session_id,p_companies:result.companies})});
    return {processed:true,sessionId:job.session_id,saved:Number(saved)};
  } catch (error) {
    const message = error instanceof Error ? error.message : "Company discovery failed";
    await databaseRequest("rpc/fail_company_discovery", {method:"POST",body:JSON.stringify({p_session_id:job.session_id,p_error:message})}).catch(()=>undefined);
    throw error;
  }
}
