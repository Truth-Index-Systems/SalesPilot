import { NextResponse } from "next/server";
import { requireOrganisationContext } from "@/lib/auth/organisation-context";
import { databaseRequest } from "@/lib/database/postgrest";

export const dynamic="force-dynamic";
export async function GET(_:Request,{params}:{params:Promise<{id:string}>}){
 try{
  const {id}=await params;
  const context=await requireOrganisationContext();
  const sessions=await databaseRequest<any[]>(`discovery_sessions?campaign_id=eq.${encodeURIComponent(id)}&organisation_id=eq.${context.organisationId}&order=cycle_number.desc,updated_at.desc,created_at.desc&limit=1`);
  if(!sessions[0]) return NextResponse.json({ok:true,discovery:null,activities:[],companyCount:0});
  const sessionId=sessions[0].id;
  const [activities,companies,candidates,recentCandidates]=await Promise.all([
   databaseRequest<any[]>(`discovery_activity?campaign_id=eq.${encodeURIComponent(id)}&organisation_id=eq.${context.organisationId}&order=occurred_at.desc&limit=8`),
   databaseRequest<any[]>(`companies?campaign_id=eq.${encodeURIComponent(id)}&organisation_id=eq.${context.organisationId}&select=id`),
   databaseRequest<any[]>(`company_discovery_candidates?discovery_session_id=eq.${encodeURIComponent(sessionId)}&organisation_id=eq.${context.organisationId}&select=id,candidate_status&limit=1000`),
   databaseRequest<any[]>(`company_discovery_candidates?discovery_session_id=eq.${encodeURIComponent(sessionId)}&organisation_id=eq.${context.organisationId}&select=id,company_name,industry,country,candidate_status,confidence&order=discovered_at.desc&limit=6`),
  ]);
  return NextResponse.json({
   ok:true,
   discovery:sessions[0],
   activities,
   companyCount:companies.length,
   candidateCount:candidates.length,
   verifiedCandidateCount:candidates.filter(row=>row.candidate_status==="VERIFIED").length,
   verifyingCandidateCount:candidates.filter(row=>row.candidate_status==="VERIFYING").length,
   recentCandidates,
  },{headers:{"Cache-Control":"no-store"}});
 }catch(error){console.error("Discovery status unavailable",error);return NextResponse.json({ok:false},{status:500});}
}
