import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/shell";
import { Card, Metric, PageHeader } from "@/components/ui";
import { requirePageUser } from "@/lib/auth/page-user";
import { requireOrganisationContext } from "@/lib/auth/organisation-context";
import { getAiCostBaseline, type AiCostFilters, type AiCostRange } from "@/lib/ai/cost-repository";
import { getAiLatencyObservatory } from "@/lib/ai/latency-repository";

export const dynamic="force-dynamic";
type Search={range?:AiCostRange;campaign?:string;model?:string;prompt?:string;stage?:string};
const money=(value:number)=>`$${value.toFixed(4)}`;
const number=(value:number)=>new Intl.NumberFormat("en-GB").format(value);
const duration=(ms:number)=>ms?`${(ms/1000).toFixed(1)}s`:"—";

export default async function AiCostsPage({searchParams}:{searchParams:Promise<Search>}){
  const user=await requirePageUser("/internal/ai-costs");
  const context=await requireOrganisationContext();
  if(!["OWNER","ADMIN"].includes(context.role)) notFound();
  const search=await searchParams;
  const [data,latency]=await Promise.all([getAiCostBaseline(context.organisationId,search as AiCostFilters),getAiLatencyObservatory(context.organisationId,search.range??"today")]);
  const hasFilters=Boolean(search.campaign||search.model||search.prompt||search.stage||search.range&&search.range!=="today");
  return <AppShell title="AI costs" user={user}>
    <PageHeader eyebrow="Internal cost intelligence" title="AI cost baseline" subtitle="Authoritative production usage by intelligence stage, model, prompt and campaign. No test-mode behaviour is applied." action={<Link className="button secondary" href="/internal/autonomy">Autonomy health</Link>}/>
    <form className="company-search-controls" action="/internal/ai-costs" method="get">
      <select name="range" defaultValue={search.range??"today"}><option value="today">Today</option><option value="7d">Last 7 days</option><option value="30d">Last 30 days</option><option value="all">All recorded</option></select>
      <select name="stage" defaultValue={search.stage??""}><option value="">All stages</option>{data.stageOptions.map(v=><option key={v}>{v}</option>)}</select>
      <select name="campaign" defaultValue={search.campaign??""}><option value="">All campaigns</option>{data.campaigns.map(v=><option value={v.id} key={v.id}>{v.name}</option>)}</select>
      <select name="model" defaultValue={search.model??""}><option value="">All models</option>{data.models.map(v=><option key={v}>{v}</option>)}</select>
      <select name="prompt" defaultValue={search.prompt??""}><option value="">All prompt versions</option>{data.prompts.map(v=><option key={v}>{v}</option>)}</select>
      <button className="button secondary">Apply filters</button>{hasFilters&&<Link className="button text" href="/internal/ai-costs">Clear</Link>}
    </form>
    <div className="grid cols-4 section">
      <Metric label="Requests" value={number(data.totals.requests)} foot={`${number(data.totals.successful)} successful · ${number(data.totals.blocked)} blocked`}/>
      <Metric label="Production cost" value={money(data.totals.costUsd)} foot="Actual when completed; reserved estimate otherwise"/>
      <Metric label="Tokens" value={number(data.totals.inputTokens+data.totals.outputTokens)} foot={`${number(data.totals.inputTokens)} input · ${number(data.totals.outputTokens)} output`}/>
      <Metric label="Web searches" value={number(data.totals.webSearches)} foot="Recorded provider search calls"/>
    </div>
    <Card className="section"><div className="card-title">R5 latency observatory</div><div className="card-subtitle">Durable background lifecycle timing from submission through provider completion and collection. Percentiles use completed observed requests only.</div>
      <div className="grid cols-4 section">
        <Metric label="p50 end-to-end" value={duration(latency.summary.p50Ms)} foot={`p90 ${duration(latency.summary.p90Ms)} · p95 ${duration(latency.summary.p95Ms)}`}/>
        <Metric label="Background pending" value={number(latency.summary.pending)} foot={`${number(latency.summary.stale)} stale over 30m`} tone={latency.summary.stale?"negative":"positive"}/>
        <Metric label="Cached input" value={number(latency.summary.cachedInputTokens)} foot="Provider-reported cached tokens"/>
        <Metric label="Recovery errors" value={number(latency.summary.collectorErrors)} foot="Workspace-scoped collector errors" tone={latency.summary.collectorErrors?"negative":"positive"}/>
      </div>
      {latency.stages.length?<div className="table-wrap section"><table className="data-table"><thead><tr><th>Executive</th><th>Calls</th><th>Complete</th><th>Pending</th><th>p50</th><th>p90</th><th>p95</th><th>Provider p50</th><th>Collect p50</th><th>Cache hit</th><th>Reasoning tokens</th><th>Recovery retries</th></tr></thead><tbody>{latency.stages.map(row=><tr key={row.task}><td><strong>{row.task.replaceAll("_"," ")}</strong></td><td>{row.calls}</td><td>{row.completed}</td><td>{row.pending}</td><td>{duration(row.p50Ms)}</td><td>{duration(row.p90Ms)}</td><td>{duration(row.p95Ms)}</td><td>{duration(row.providerP50Ms)}</td><td>{duration(row.collectionP50Ms)}</td><td>{`${(row.cacheHitRate*100).toFixed(1)}%`}</td><td>{number(row.reasoningTokens)}</td><td>{row.retries}</td></tr>)}</tbody></table></div>:<div className="empty-state compact section"><strong>No R5 latency samples yet</strong><span>Background AI requests will populate this observatory after migration 0096 is applied.</span></div>}
    </Card>
    <Card className="section"><div className="card-title">Cost by intelligence stage</div><div className="card-subtitle">Use this table to identify the first stage worth optimising.</div>
      {data.stages.length?<div className="table-wrap section"><table className="data-table"><thead><tr><th>Stage</th><th>Calls</th><th>Success</th><th>Blocked</th><th>Input</th><th>Output</th><th>Searches</th><th>Avg latency</th><th>Avg actual</th><th>Total</th></tr></thead><tbody>{data.stages.map(row=><tr key={row.stage}><td><strong>{row.stage}</strong></td><td>{row.requests}</td><td>{row.successful}</td><td>{row.blocked}</td><td>{number(row.inputTokens)}</td><td>{number(row.outputTokens)}</td><td>{row.webSearches}</td><td>{duration(row.averageLatencyMs)}</td><td>{money(row.averageActualCostUsd)}</td><td><strong>{money(row.totalCostUsd)}</strong></td></tr>)}</tbody></table></div>:<div className="empty-state compact section"><strong>No AI usage in this view</strong><span>Run the production journey or broaden the filters.</span></div>}
    </Card>
    <Card className="section"><div className="card-title">Highest-cost requests</div><div className="card-subtitle">The most expensive individual ledger entries in the selected view.</div>
      {data.highest.length?<div className="table-wrap section"><table className="data-table"><thead><tr><th>Time</th><th>Stage</th><th>Campaign</th><th>Status</th><th>Model</th><th>Prompt</th><th>Tokens</th><th>Searches</th><th>Latency</th><th>Cost</th></tr></thead><tbody>{data.highest.map(row=><tr key={row.id}><td>{new Date(row.created_at).toLocaleString("en-GB")}</td><td>{row.stage}</td><td>{row.campaign_name??"—"}</td><td>{row.status}</td><td>{row.model}</td><td>{row.prompt_version??"Legacy / unversioned"}</td><td>{number((row.input_tokens??0)+(row.output_tokens??0))}</td><td>{row.web_search_calls}</td><td>{duration(row.duration_ms??0)}</td><td><strong>{money(row.effective_cost_usd)}</strong></td></tr>)}</tbody></table></div>:<div className="empty-state compact section"><strong>No requests recorded</strong><span>AI usage will appear here after production requests are reserved.</span></div>}
    </Card>
  </AppShell>;
}
