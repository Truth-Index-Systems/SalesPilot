import "server-only";
import { databaseRequest } from "@/lib/database/postgrest";

type UsageRow={id:string;organisation_id:string;campaign_id:string|null;job_type:string;job_id:string|null;status:string;model:string;estimated_cost_usd:number;actual_cost_usd:number;input_tokens:number|null;output_tokens:number|null;web_search_calls:number;duration_ms:number|null;error_code:string|null;created_at:string;completed_at:string|null};
type Campaign={id:string;organisation_id:string;name:string;status:string;created_at:string};
type Organisation={id:string;name:string};
type VersionRow={id:string;prompt_version:string|null};
type TimelineRow={id:string;organisation_id:string;campaign_id:string;event_type:string;title:string;description:string|null;occurred_at:string};
type CountRow={id:string;status?:string;review_status?:string;job_state?:string;created_at?:string};

const stageLabels:Record<string,string>={BUSINESS_ANALYSIS:"Business Analysis",COMPANY_DISCOVERY:"Company Intelligence",CONTACT_DISCOVERY:"Buyer Intelligence",OPPORTUNITY_ANALYSIS:"Opportunity Intelligence",COMMERCIAL_REASONING:"Commercial Reasoning",OUTREACH:"Outreach Generation",SELF_REVIEW:"AI Self Review",REPLY_INTELLIGENCE:"Reply Intelligence"};
const effectiveCost=(row:UsageRow)=>Number(row.status==="SUCCEEDED"?row.actual_cost_usd:row.estimated_cost_usd);
const dayKey=(value:string)=>value.slice(0,10);

export async function getFounderDashboard(rangeDays=7){
  const since=new Date(Date.now()-Math.max(1,rangeDays)*86400000).toISOString();
  const [usage,campaigns,organisations,commercial,drafts,reviews,timeline,companies,contacts,opportunities,engagements,queue,learning]=await Promise.all([
    databaseRequest<UsageRow[]>(`ai_usage_ledger?select=id,organisation_id,campaign_id,job_type,job_id,status,model,estimated_cost_usd,actual_cost_usd,input_tokens,output_tokens,web_search_calls,duration_ms,error_code,created_at,completed_at&created_at=gte.${encodeURIComponent(since)}&order=created_at.desc&limit=5000`),
    databaseRequest<Campaign[]>(`campaigns?select=id,organisation_id,name,status,created_at&order=created_at.desc&limit=2000`),
    databaseRequest<Organisation[]>(`organisations?select=id,name&order=created_at.asc&limit=500`),
    databaseRequest<VersionRow[]>(`engagement_commercial_analyses?select=id,prompt_version&limit=5000`),
    databaseRequest<VersionRow[]>(`engagement_drafts?select=id,prompt_version&limit=5000`),
    databaseRequest<VersionRow[]>(`engagement_draft_reviews?select=id,prompt_version&limit=5000`),
    databaseRequest<TimelineRow[]>(`campaign_timeline?select=id,organisation_id,campaign_id,event_type,title,description,occurred_at&order=occurred_at.desc&limit=20`),
    databaseRequest<CountRow[]>(`companies?select=id,review_status&limit=10000`),
    databaseRequest<CountRow[]>(`contacts?select=id,review_status&limit=10000`),
    databaseRequest<CountRow[]>(`opportunities?select=id,status&limit=10000`),
    databaseRequest<CountRow[]>(`opportunity_engagements?select=id,status&limit=10000`),
    databaseRequest<CountRow[]>(`engagement_send_queue?select=id,status&limit=10000`),
    databaseRequest<CountRow[]>(`engagement_learning_records?select=id,created_at&limit=10000`),
  ]);
  const campaignMap=new Map(campaigns.map(r=>[r.id,r]));
  const orgMap=new Map(organisations.map(r=>[r.id,r.name]));
  const promptMap=new Map<string,string>();
  for(const row of [...commercial,...drafts,...reviews]) if(row.prompt_version) promptMap.set(row.id,row.prompt_version);
  const rows=usage.map(row=>({
    ...row,
    stage:stageLabels[row.job_type]??row.job_type.replaceAll("_"," "),
    cost:effectiveCost(row),
    promptVersion:row.job_id?promptMap.get(row.job_id)??"Legacy / unversioned":"Legacy / unversioned",
    campaignName:row.campaign_id?campaignMap.get(row.campaign_id)?.name??"Unknown campaign":"Platform-wide",
    organisationName:orgMap.get(row.organisation_id)??"Unknown workspace",
  }));
  const totalCost=rows.reduce((n,r)=>n+r.cost,0);
  const successful=rows.filter(r=>r.status==="SUCCEEDED");
  const totalTokens=rows.reduce((n,r)=>n+(r.input_tokens??0)+(r.output_tokens??0),0);
  const todayKey=new Date().toISOString().slice(0,10);
  const today=rows.filter(r=>dayKey(r.created_at)===todayKey);
  const stageGroups=new Map<string,typeof rows>();
  for(const row of rows) stageGroups.set(row.stage,[...(stageGroups.get(row.stage)??[]),row]);
  const stages=[...stageGroups.entries()].map(([stage,items])=>({
    stage,calls:items.length,tokens:items.reduce((n,r)=>n+(r.input_tokens??0)+(r.output_tokens??0),0),cost:items.reduce((n,r)=>n+r.cost,0),
    latency:Math.round(items.filter(r=>r.duration_ms!=null).reduce((n,r)=>n+(r.duration_ms??0),0)/Math.max(1,items.filter(r=>r.duration_ms!=null).length)),
    searches:items.reduce((n,r)=>n+r.web_search_calls,0),successRate:Math.round(items.filter(r=>r.status==="SUCCEEDED").length/Math.max(1,items.length)*100)
  })).sort((a,b)=>b.cost-a.cost);
  const campaignGroups=new Map<string,typeof rows>();
  for(const row of rows) if(row.campaign_id) campaignGroups.set(row.campaign_id,[...(campaignGroups.get(row.campaign_id)??[]),row]);
  const campaignCosts=[...campaignGroups.entries()].map(([id,items])=>({id,name:campaignMap.get(id)?.name??"Unknown campaign",organisation:orgMap.get(campaignMap.get(id)?.organisation_id??"")??"Unknown workspace",calls:items.length,tokens:items.reduce((n,r)=>n+(r.input_tokens??0)+(r.output_tokens??0),0),cost:items.reduce((n,r)=>n+r.cost,0)})).sort((a,b)=>b.cost-a.cost).slice(0,10);
  const promptGroups=new Map<string,typeof rows>();
  for(const row of rows) promptGroups.set(row.promptVersion,[...(promptGroups.get(row.promptVersion)??[]),row]);
  const prompts=[...promptGroups.entries()].map(([prompt,items])=>({prompt,calls:items.length,avgTokens:Math.round(items.reduce((n,r)=>n+(r.input_tokens??0)+(r.output_tokens??0),0)/Math.max(1,items.length)),avgCost:items.reduce((n,r)=>n+r.cost,0)/Math.max(1,items.length),avgLatency:Math.round(items.reduce((n,r)=>n+(r.duration_ms??0),0)/Math.max(1,items.filter(r=>r.duration_ms!=null).length))})).sort((a,b)=>b.avgCost-a.avgCost).slice(0,12);
  const modelGroups=new Map<string,typeof rows>();
  for(const row of rows) modelGroups.set(row.model,[...(modelGroups.get(row.model)??[]),row]);
  const models=[...modelGroups.entries()].map(([model,items])=>({model,calls:items.length,tokens:items.reduce((n,r)=>n+(r.input_tokens??0)+(r.output_tokens??0),0),cost:items.reduce((n,r)=>n+r.cost,0),latency:Math.round(items.reduce((n,r)=>n+(r.duration_ms??0),0)/Math.max(1,items.filter(r=>r.duration_ms!=null).length))})).sort((a,b)=>b.cost-a.cost);
  const daily=[] as {date:string;cost:number;calls:number;tokens:number}[];
  for(let offset=rangeDays-1;offset>=0;offset--){const d=new Date(Date.now()-offset*86400000).toISOString().slice(0,10);const items=rows.filter(r=>dayKey(r.created_at)===d);daily.push({date:d,cost:items.reduce((n,r)=>n+r.cost,0),calls:items.length,tokens:items.reduce((n,r)=>n+(r.input_tokens??0)+(r.output_tokens??0),0)});}
  const optimisation=stages.slice(0,3).map(stage=>({stage:stage.stage,signal:stage.tokens/Math.max(1,stage.calls),message:stage.calls?`Average ${Math.round(stage.tokens/stage.calls).toLocaleString("en-GB")} tokens per call. Prioritise context compaction here first.`:"No calls recorded yet."}));
  return {
    generatedAt:new Date().toISOString(),rangeDays,
    totals:{todayCost:today.reduce((n,r)=>n+r.cost,0),todayRequests:today.length,totalCost,requests:rows.length,totalTokens,avgCost:totalCost/Math.max(1,successful.length),avgTokens:Math.round(totalTokens/Math.max(1,successful.length)),avgLatency:Math.round(successful.reduce((n,r)=>n+(r.duration_ms??0),0)/Math.max(1,successful.filter(r=>r.duration_ms!=null).length)),webSearches:rows.reduce((n,r)=>n+r.web_search_calls,0)},
    pipeline:{workspaces:organisations.length,campaigns:campaigns.filter(r=>r.status!=="ARCHIVED").length,companies:companies.length,approvedCompanies:companies.filter(r=>r.review_status==="APPROVED").length,contacts:contacts.length,approvedContacts:contacts.filter(r=>r.review_status==="APPROVED").length,opportunities:opportunities.length,approvedOpportunities:opportunities.filter(r=>r.status==="APPROVED"||r.status==="ENGAGED").length,engagements:engagements.length,queued:queue.filter(r=>r.status==="READY"||r.status==="QUEUED").length,learning:learning.length},
    stages,campaignCosts,prompts,models,daily,optimisation,
    highest:[...rows].sort((a,b)=>b.cost-a.cost).slice(0,12),
    timeline:timeline.map(row=>({...row,campaignName:campaignMap.get(row.campaign_id)?.name??"Unknown campaign",organisationName:orgMap.get(row.organisation_id)??"Unknown workspace"}))
  };
}
