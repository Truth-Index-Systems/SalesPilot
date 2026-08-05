import { NextResponse } from "next/server";
import { requireOrganisationContext } from "@/lib/auth/organisation-context";
import { databaseRequest } from "@/lib/database/postgrest";

export const dynamic="force-dynamic";
export async function GET(_:Request,{params}:{params:Promise<{id:string}>}){
 try{
  const {id}=await params;
  const context=await requireOrganisationContext();
  const sessions=await databaseRequest<any[]>(`discovery_sessions?campaign_id=eq.${encodeURIComponent(id)}&organisation_id=eq.${context.organisationId}&limit=1`);
  if(!sessions[0]) return NextResponse.json({ok:true,discovery:null,activities:[],companyCount:0});
  const [activities,companies]=await Promise.all([
   databaseRequest<any[]>(`discovery_activity?campaign_id=eq.${encodeURIComponent(id)}&organisation_id=eq.${context.organisationId}&order=occurred_at.desc&limit=8`),
   databaseRequest<any[]>(`companies?campaign_id=eq.${encodeURIComponent(id)}&organisation_id=eq.${context.organisationId}&select=id`),
  ]);
  return NextResponse.json({ok:true,discovery:sessions[0],activities,companyCount:companies.length},{headers:{"Cache-Control":"no-store"}});
 }catch(error){console.error("Discovery status unavailable",error);return NextResponse.json({ok:false},{status:500});}
}
