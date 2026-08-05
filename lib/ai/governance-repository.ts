import "server-only";
import { databaseRequest } from "@/lib/database/postgrest";

export type AiGovernanceSummary={
  organisation_id:string;autonomy_enabled:boolean;daily_request_limit:number;daily_cost_limit_usd:number;campaign_daily_request_limit:number;
  requests_today:number;blocked_today:number;cost_today_usd:number;input_tokens_today:number;output_tokens_today:number;updated_at:string;initial_contact_burst_size:number;
};
export type AiUsageRow={id:string;job_type:string;status:string;model:string;estimated_cost_usd:number;actual_cost_usd:number;input_tokens:number|null;output_tokens:number|null;web_search_calls:number;error_code:string|null;created_at:string;campaign_id:string|null};

export async function getAiGovernance(organisationId:string){
  await databaseRequest("rpc/ensure_ai_governance_policy",{method:"POST",body:JSON.stringify({p_organisation_id:organisationId})});
  const org=encodeURIComponent(organisationId);
  const [summaries,usage]=await Promise.all([
    databaseRequest<AiGovernanceSummary[]>(`ai_governance_daily_summary?organisation_id=eq.${org}&select=*&limit=1`),
    databaseRequest<AiUsageRow[]>(`ai_usage_ledger?organisation_id=eq.${org}&select=id,job_type,status,model,estimated_cost_usd,actual_cost_usd,input_tokens,output_tokens,web_search_calls,error_code,created_at,campaign_id&order=created_at.desc&limit=50`),
  ]);
  return {summary:summaries[0]??null,usage};
}
