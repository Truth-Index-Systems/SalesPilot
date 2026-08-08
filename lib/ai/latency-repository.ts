import "server-only";
import { databaseRequest } from "@/lib/database/postgrest";

export type AiLatencyRange = "today" | "7d" | "30d" | "all";

type BackgroundRow = {
  checkpoint_key:string; organisation_id:string|null; campaign_id:string|null; task:string; model:string; ledger_id:string;
  status:string; submitted_at:string|null; provider_event_at:string|null; provider_completed_at:string|null; collected_at:string|null;
  owner_woken_at:string|null; completed_at:string|null; created_at:string; collector_attempt_count:number; collector_last_error:string|null;
};
type LedgerRow = { id:string; status:string; input_tokens:number|null; output_tokens:number|null; cached_input_tokens:number|null; reasoning_tokens:number|null; actual_cost_usd:number; estimated_cost_usd:number; duration_ms:number|null; validated_at:string|null; persisted_at:string|null; created_at:string; completed_at:string|null };

export type AiLatencyStageSummary = {
  task:string; calls:number; completed:number; terminal:number; pending:number; p50Ms:number; p90Ms:number; p95Ms:number;
  providerP50Ms:number; collectionP50Ms:number; cacheHitRate:number; cachedInputTokens:number; reasoningTokens:number; retries:number; costUsd:number;
};

function startFor(range:AiLatencyRange){
  const now=new Date();
  if(range==="today"){now.setHours(0,0,0,0);return now.toISOString();}
  if(range==="7d")return new Date(Date.now()-7*86400000).toISOString();
  if(range==="30d")return new Date(Date.now()-30*86400000).toISOString();
  return null;
}
function ms(a:string|null,b:string|null){return a&&b?Math.max(0,Date.parse(b)-Date.parse(a)):null;}
function percentile(values:number[],p:number){if(!values.length)return 0;const sorted=[...values].sort((a,b)=>a-b);const i=Math.min(sorted.length-1,Math.max(0,Math.ceil(p*sorted.length)-1));return Math.round(sorted[i]);}

export async function getAiLatencyObservatory(organisationId:string,range:AiLatencyRange="today"){
  const start=startFor(range); const org=encodeURIComponent(organisationId); const time=start?`&created_at=gte.${encodeURIComponent(start)}`:"";
  const backgrounds=await databaseRequest<BackgroundRow[]>(`ai_background_responses?organisation_id=eq.${org}&select=checkpoint_key,organisation_id,campaign_id,task,model,ledger_id,status,submitted_at,provider_event_at,provider_completed_at,collected_at,owner_woken_at,completed_at,created_at,collector_attempt_count,collector_last_error&order=created_at.desc&limit=2000${time}`);
  const ids=[...new Set(backgrounds.map(r=>r.ledger_id).filter(Boolean))];
  const ledgers:LedgerRow[]=[];
  for(let i=0;i<ids.length;i+=100){
    const chunk=ids.slice(i,i+100).map(encodeURIComponent).join(",");
    if(chunk)ledgers.push(...await databaseRequest<LedgerRow[]>(`ai_usage_ledger?id=in.(${chunk})&select=id,status,input_tokens,output_tokens,cached_input_tokens,reasoning_tokens,actual_cost_usd,estimated_cost_usd,duration_ms,validated_at,persisted_at,created_at,completed_at`));
  }
  const ledgerMap=new Map(ledgers.map(r=>[r.id,r]));
  const groups=new Map<string,BackgroundRow[]>(); backgrounds.forEach(r=>groups.set(r.task,[...(groups.get(r.task)??[]),r]));
  const stages=[...groups.entries()].map(([task,rows]):AiLatencyStageSummary=>{
    const total=rows.map(r=>ms(r.submitted_at??r.created_at,r.completed_at??r.collected_at)).filter((v):v is number=>v!==null);
    const provider=rows.map(r=>ms(r.submitted_at??r.created_at,r.provider_completed_at??r.provider_event_at)).filter((v):v is number=>v!==null);
    const collect=rows.map(r=>ms(r.provider_completed_at??r.provider_event_at,r.collected_at)).filter((v):v is number=>v!==null);
    const l=rows.map(r=>ledgerMap.get(r.ledger_id)).filter((v):v is LedgerRow=>Boolean(v));
    const input=l.reduce((n,r)=>n+(r.input_tokens??0),0); const cached=l.reduce((n,r)=>n+(r.cached_input_tokens??0),0);
    return {task,calls:rows.length,completed:rows.filter(r=>r.status==="completed").length,terminal:rows.filter(r=>["failed","cancelled","incomplete"].includes(r.status)).length,pending:rows.filter(r=>["queued","in_progress"].includes(r.status)).length,
      p50Ms:percentile(total,.5),p90Ms:percentile(total,.9),p95Ms:percentile(total,.95),providerP50Ms:percentile(provider,.5),collectionP50Ms:percentile(collect,.5),
      cacheHitRate:input?cached/input:0,cachedInputTokens:cached,reasoningTokens:l.reduce((n,r)=>n+(r.reasoning_tokens??0),0),retries:rows.reduce((n,r)=>n+Math.max(0,(r.collector_attempt_count??0)-1),0),
      costUsd:l.reduce((n,r)=>n+Number(r.status==="SUCCEEDED"?r.actual_cost_usd:r.estimated_cost_usd),0)};
  }).sort((a,b)=>b.p95Ms-a.p95Ms);
  const totalDurations=backgrounds.map(r=>ms(r.submitted_at??r.created_at,r.completed_at??r.collected_at)).filter((v):v is number=>v!==null);
  const collectorErrors=backgrounds.filter(r=>Boolean(r.collector_last_error)).length;
  const stale=backgrounds.filter(r=>["queued","in_progress"].includes(r.status)&&Date.now()-Date.parse(r.submitted_at??r.created_at)>30*60*1000).length;
  return {stages,summary:{calls:backgrounds.length,completed:backgrounds.filter(r=>r.status==="completed").length,pending:backgrounds.filter(r=>["queued","in_progress"].includes(r.status)).length,stale,collectorErrors,p50Ms:percentile(totalDurations,.5),p90Ms:percentile(totalDurations,.9),p95Ms:percentile(totalDurations,.95),cachedInputTokens:ledgers.reduce((n,r)=>n+(r.cached_input_tokens??0),0),reasoningTokens:ledgers.reduce((n,r)=>n+(r.reasoning_tokens??0),0)}};
}
