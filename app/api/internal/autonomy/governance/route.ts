import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOrganisationContext } from "@/lib/auth/organisation-context";
import { databaseRequest } from "@/lib/database/postgrest";

const Schema=z.object({autonomyEnabled:z.boolean(),dailyRequestLimit:z.number().int().min(0).max(100000),dailyCostLimitUsd:z.number().min(0).max(100000),campaignDailyRequestLimit:z.number().int().min(0).max(100000)});
export async function POST(request:Request){
  try{
    const context=await requireOrganisationContext();
    if(!["OWNER","ADMIN"].includes(context.role))return NextResponse.json({ok:false,error:"FORBIDDEN"},{status:403});
    const input=Schema.parse(await request.json());
    const result=await databaseRequest("rpc/update_ai_governance_policy",{method:"POST",body:JSON.stringify({p_organisation_id:context.organisationId,p_updated_by:context.userId,p_autonomy_enabled:input.autonomyEnabled,p_daily_request_limit:input.dailyRequestLimit,p_daily_cost_limit_usd:input.dailyCostLimitUsd,p_campaign_daily_request_limit:input.campaignDailyRequestLimit})});
    return NextResponse.json({ok:true,policy:result});
  }catch(error){console.error("AI governance update failed",error);return NextResponse.json({ok:false,error:"AI_GOVERNANCE_UPDATE_FAILED"},{status:400});}
}
