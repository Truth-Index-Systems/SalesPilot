import "server-only";
import { databaseRequest } from "@/lib/database/postgrest";

export type AiCostRange = "today" | "7d" | "30d" | "all";
export type AiCostFilters = { range?: AiCostRange; campaign?: string; model?: string; prompt?: string; stage?: string };

type UsageRow = {
  id:string; campaign_id:string|null; job_type:string; job_id:string|null; status:string; model:string;
  estimated_cost_usd:number; actual_cost_usd:number; input_tokens:number|null; output_tokens:number|null;
  web_search_calls:number; duration_ms:number|null; error_code:string|null; created_at:string; completed_at:string|null;
};
type CampaignRow={id:string;name:string};
type VersionRow={id:string;prompt_version:string|null};

export type AiCostUsageRow = UsageRow & { stage:string; campaign_name:string|null; prompt_version:string|null; effective_cost_usd:number };
export type AiCostStageSummary = {
  stage:string; requests:number; successful:number; blocked:number; failed:number; inputTokens:number; outputTokens:number;
  webSearches:number; averageLatencyMs:number; averageEstimatedCostUsd:number; averageActualCostUsd:number; totalCostUsd:number;
};

function startFor(range: AiCostRange){
  const now=new Date();
  if(range==="today"){ now.setHours(0,0,0,0); return now.toISOString(); }
  if(range==="7d") return new Date(Date.now()-7*86400000).toISOString();
  if(range==="30d") return new Date(Date.now()-30*86400000).toISOString();
  return null;
}

function stageFor(row:UsageRow, commercial:Set<string>, drafts:Set<string>, reviews:Set<string>){
  if(row.job_id && commercial.has(row.job_id)) return "Commercial Reasoning";
  if(row.job_id && reviews.has(row.job_id)) return "AI Self Review";
  if(row.job_id && drafts.has(row.job_id)) return "Outreach Generation";
  const labels:Record<string,string>={
    BUSINESS_ANALYSIS:"Business Analysis", COMPANY_DISCOVERY:"Company Intelligence", CONTACT_DISCOVERY:"Buyer Intelligence",
    OPPORTUNITY_ANALYSIS:"Opportunity Intelligence", COMMERCIAL_REASONING:"Commercial Reasoning", OUTREACH:"Outreach Generation", REPLY_INTELLIGENCE:"Reply Intelligence"
  };
  return labels[row.job_type]??row.job_type.replaceAll("_"," ");
}

export async function getAiCostBaseline(organisationId:string, filters:AiCostFilters={}){
  const range=filters.range??"today";
  const org=encodeURIComponent(organisationId);
  const start=startFor(range);
  const timeFilter=start?`&created_at=gte.${encodeURIComponent(start)}`:"";
  const [usage,campaigns,commercial,drafts,reviews]=await Promise.all([
    databaseRequest<UsageRow[]>(`ai_usage_ledger?organisation_id=eq.${org}&select=id,campaign_id,job_type,job_id,status,model,estimated_cost_usd,actual_cost_usd,input_tokens,output_tokens,web_search_calls,duration_ms,error_code,created_at,completed_at&order=created_at.desc&limit=2000${timeFilter}`),
    databaseRequest<CampaignRow[]>(`campaigns?organisation_id=eq.${org}&select=id,name&order=created_at.desc`),
    databaseRequest<VersionRow[]>(`engagement_commercial_analyses?organisation_id=eq.${org}&select=id,prompt_version&limit=2000`),
    databaseRequest<VersionRow[]>(`engagement_drafts?organisation_id=eq.${org}&select=id,prompt_version&limit=2000`),
    databaseRequest<VersionRow[]>(`engagement_draft_reviews?organisation_id=eq.${org}&select=id,prompt_version&limit=2000`),
  ]);
  const campaignMap=new Map(campaigns.map(row=>[row.id,row.name]));
  const commercialMap=new Map(commercial.map(row=>[row.id,row.prompt_version]));
  const draftMap=new Map(drafts.map(row=>[row.id,row.prompt_version]));
  const reviewMap=new Map(reviews.map(row=>[row.id,row.prompt_version]));
  const commercialIds=new Set(commercialMap.keys()), draftIds=new Set(draftMap.keys()), reviewIds=new Set(reviewMap.keys());
  const enriched:AiCostUsageRow[]=usage.map(row=>{
    const promptVersion=row.job_id?(commercialMap.get(row.job_id)??draftMap.get(row.job_id)??reviewMap.get(row.job_id)??null):null;
    return {...row,stage:stageFor(row,commercialIds,draftIds,reviewIds),campaign_name:row.campaign_id?campaignMap.get(row.campaign_id)??null:null,prompt_version:promptVersion,effective_cost_usd:Number(row.status==="SUCCEEDED"?row.actual_cost_usd:row.estimated_cost_usd)};
  });
  const rows=enriched.filter(row=>(!filters.campaign||row.campaign_id===filters.campaign)&&(!filters.model||row.model===filters.model)&&(!filters.prompt||row.prompt_version===filters.prompt)&&(!filters.stage||row.stage===filters.stage));
  const groups=new Map<string,AiCostUsageRow[]>();
  rows.forEach(row=>groups.set(row.stage,[...(groups.get(row.stage)??[]),row]));
  const stages=[...groups.entries()].map(([stage,items]):AiCostStageSummary=>{
    const succeeded=items.filter(i=>i.status==="SUCCEEDED");
    const withLatency=items.filter(i=>i.duration_ms!=null);
    return {stage,requests:items.length,successful:succeeded.length,blocked:items.filter(i=>i.status==="BLOCKED").length,failed:items.filter(i=>i.status==="FAILED").length,
      inputTokens:items.reduce((n,i)=>n+(i.input_tokens??0),0),outputTokens:items.reduce((n,i)=>n+(i.output_tokens??0),0),webSearches:items.reduce((n,i)=>n+i.web_search_calls,0),
      averageLatencyMs:withLatency.length?Math.round(withLatency.reduce((n,i)=>n+(i.duration_ms??0),0)/withLatency.length):0,
      averageEstimatedCostUsd:items.length?items.reduce((n,i)=>n+Number(i.estimated_cost_usd),0)/items.length:0,
      averageActualCostUsd:succeeded.length?succeeded.reduce((n,i)=>n+Number(i.actual_cost_usd),0)/succeeded.length:0,
      totalCostUsd:items.reduce((n,i)=>n+i.effective_cost_usd,0)};
  }).sort((a,b)=>b.totalCostUsd-a.totalCostUsd);
  return {rows,stages,campaigns,models:[...new Set(enriched.map(r=>r.model))].sort(),prompts:[...new Set(enriched.map(r=>r.prompt_version).filter(Boolean) as string[])].sort(),stageOptions:[...new Set(enriched.map(r=>r.stage))].sort(),
    totals:{requests:rows.length,successful:rows.filter(r=>r.status==="SUCCEEDED").length,blocked:rows.filter(r=>r.status==="BLOCKED").length,inputTokens:rows.reduce((n,r)=>n+(r.input_tokens??0),0),outputTokens:rows.reduce((n,r)=>n+(r.output_tokens??0),0),webSearches:rows.reduce((n,r)=>n+r.web_search_calls,0),costUsd:rows.reduce((n,r)=>n+r.effective_cost_usd,0)},
    highest:[...rows].sort((a,b)=>b.effective_cost_usd-a.effective_cost_usd).slice(0,10)};
}
