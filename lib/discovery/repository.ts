import "server-only";
import { databaseRequest } from "@/lib/database/postgrest";
import { requireOrganisationContext } from "@/lib/auth/organisation-context";

export async function listCompanies(filters?: {status?:string; campaignId?:string}) {
 const context=await requireOrganisationContext();
 let path=`company_overview?organisation_id=eq.${context.organisationId}&order=confidence.desc,created_at.desc`;
 if(filters?.status) path+=`&review_status=eq.${encodeURIComponent(filters.status)}`;
 if(filters?.campaignId) path+=`&campaign_id=eq.${encodeURIComponent(filters.campaignId)}`;
 return databaseRequest<any[]>(path);
}
export async function getCompany(id:string){const context=await requireOrganisationContext();const rows=await databaseRequest<any[]>(`company_detail?id=eq.${encodeURIComponent(id)}&organisation_id=eq.${context.organisationId}&limit=1`);return rows[0]??null;}
export async function getDiscoveryForCampaign(campaignId:string){const context=await requireOrganisationContext();const rows=await databaseRequest<any[]>(`discovery_sessions?campaign_id=eq.${encodeURIComponent(campaignId)}&organisation_id=eq.${context.organisationId}&limit=1`);return rows[0]??null;}
export async function companyCounts(){const rows=await listCompanies();return {total:rows.length,pending:rows.filter(r=>r.review_status==='PENDING_REVIEW').length,approved:rows.filter(r=>r.review_status==='APPROVED').length};}
