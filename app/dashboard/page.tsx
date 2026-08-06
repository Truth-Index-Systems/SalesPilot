import { redirect } from "next/navigation";
import { hasFounderDashboardSession } from "@/lib/founder-dashboard/auth";
import { getFounderDashboard } from "@/lib/founder-dashboard/repository";

export const dynamic = "force-dynamic";

const money=(value:number)=>`$${value.toFixed(value<1?4:2)}`;
const number=(value:number)=>new Intl.NumberFormat("en-GB").format(value);
const latency=(value:number)=>value?`${(value/1000).toFixed(1)}s`:"—";
const pct=(value:number,max:number)=>`${Math.max(3,Math.round(value/Math.max(max,0.000001)*100))}%`;

export default async function FounderDashboardPage({searchParams}:{searchParams:Promise<{range?:string}>}){
  if(!(await hasFounderDashboardSession())) redirect("/dashboard/login");
  const params=await searchParams;
  const range=[7,14,30].includes(Number(params.range))?Number(params.range):7;
  const data=await getFounderDashboard(range);
  const maxDaily=Math.max(...data.daily.map(d=>d.cost),0.000001);
  const maxStage=Math.max(...data.stages.map(d=>d.cost),0.000001);
  return <main className="founder-dashboard-shell">
    <header className="founder-topbar">
      <div className="founder-wordmark light"><span>SP</span><div><strong>SalesPilot</strong><small>Founder Operations</small></div></div>
      <div className="founder-topbar-actions"><small>Updated {new Date(data.generatedAt).toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"})}</small><form method="post" action="/api/founder-dashboard/logout"><button type="submit">Lock dashboard</button></form></div>
    </header>
    <div className="founder-dashboard-content">
      <section className="founder-dashboard-head">
        <div><span className="founder-kicker">Production command centre</span><h1>Founder Dashboard</h1><p>AI economics, autonomous pipeline health and operational learning across SalesPilot.</p></div>
        <nav className="founder-range" aria-label="Dashboard period"><a className={range===7?"active":""} href="/dashboard?range=7">7 days</a><a className={range===14?"active":""} href="/dashboard?range=14">14 days</a><a className={range===30?"active":""} href="/dashboard?range=30">30 days</a></nav>
      </section>

      <section className="founder-metric-grid">
        <article><span>Spend today</span><strong>{money(data.totals.todayCost)}</strong><small>{data.totals.todayRequests} production requests</small></article>
        <article><span>Period spend</span><strong>{money(data.totals.totalCost)}</strong><small>{number(data.totals.requests)} ledger entries</small></article>
        <article><span>Average cost</span><strong>{money(data.totals.avgCost)}</strong><small>per successful request</small></article>
        <article><span>Average tokens</span><strong>{number(data.totals.avgTokens)}</strong><small>{latency(data.totals.avgLatency)} average latency</small></article>
        <article><span>Web searches</span><strong>{number(data.totals.webSearches)}</strong><small>provider research calls</small></article>
      </section>


      <section className="founder-metric-grid founder-economics-grid">
        <article><span>Cost / opportunity</span><strong>{money(data.economics.costPerOpportunity)}</strong><small>{data.economics.completedOpportunities} approved or engaged</small></article>
        <article><span>Cost / review-ready</span><strong>{money(data.economics.costPerReviewReady)}</strong><small>{data.economics.reviewReadyEngagements} engagements reached review</small></article>
        <article><span>Cost / completed journey</span><strong>{money(data.economics.costPerCompletedJourney)}</strong><small>{data.economics.completedJourneys} immutable learning snapshots</small></article>
        <article><span>Projected from $1</span><strong>{data.economics.completedJourneysPerDollar.toFixed(1)}</strong><small>completed journeys at observed cost</small></article>
        <article><span>Projected from $5</span><strong>{data.economics.projectedCompletedJourneysForFive.toFixed(1)}</strong><small>completed journeys at observed cost</small></article>
      </section>

      <section className="founder-grid founder-grid-main">
        <article className="founder-panel">
          <div className="founder-panel-head"><div><span>Unit economics</span><h2>Production cost projection</h2></div><strong>{money(data.economics.attributedJourneyCost)}</strong></div>
          <div className="founder-projection-grid">
            <div><span>Per $1</span><strong>{data.economics.opportunitiesPerDollar.toFixed(1)}</strong><small>approved opportunities</small></div>
            <div><span>Per $1</span><strong>{data.economics.reviewReadyPerDollar.toFixed(1)}</strong><small>review-ready engagements</small></div>
            <div><span>Per $5</span><strong>{data.economics.projectedOpportunitiesForFive.toFixed(1)}</strong><small>approved opportunities</small></div>
            <div><span>Per $5</span><strong>{data.economics.projectedReviewReadyForFive.toFixed(1)}</strong><small>review-ready engagements</small></div>
          </div>
          <p className="founder-method-note">Projection uses observed production spend for the selected period. Completed-journey cost uses immutable G4 learning snapshots and therefore excludes unfinished work.</p>
        </article>
        <article className="founder-panel founder-release-gate">
          <div className="founder-panel-head"><div><span>Release gate</span><h2>Production economics readiness</h2></div><b className={data.releaseReady?"founder-ready-badge":"founder-hold-badge"}>{data.releaseReady?"Ready":"Observing"}</b></div>
          <div className="founder-gate-list">{data.releaseGate.map(item=><div key={item.key}><i className={item.passed?"pass":"hold"}>{item.passed?"✓":"!"}</i><div><strong>{item.label}</strong><small>{item.detail}</small></div></div>)}</div>
        </article>
      </section>

      <section className="founder-grid founder-grid-main">
        <article className="founder-panel founder-spend-panel">
          <div className="founder-panel-head"><div><span>AI spend</span><h2>Production cost trend</h2></div><strong>{money(data.totals.totalCost)}</strong></div>
          <div className="founder-bar-chart" aria-label="Daily AI spend chart">{data.daily.map(day=><div key={day.date} className="founder-bar-column" title={`${day.date}: ${money(day.cost)}`}><div className="founder-bar-track"><i style={{height:pct(day.cost,maxDaily)}}/></div><small>{new Date(`${day.date}T12:00:00Z`).toLocaleDateString("en-GB",{day:"2-digit",month:"short"})}</small></div>)}</div>
        </article>
        <article className="founder-panel">
          <div className="founder-panel-head"><div><span>Pipeline</span><h2>Autonomous production</h2></div><b className="founder-live-badge">Live</b></div>
          <div className="founder-pipeline-grid">
            <div><span>Workspaces</span><strong>{data.pipeline.workspaces}</strong></div><div><span>Live campaigns</span><strong>{data.pipeline.campaigns}</strong></div>
            <div><span>Companies</span><strong>{data.pipeline.companies}</strong><small>{data.pipeline.approvedCompanies} approved</small></div><div><span>Buyers</span><strong>{data.pipeline.contacts}</strong><small>{data.pipeline.approvedContacts} approved</small></div>
            <div><span>Opportunities</span><strong>{data.pipeline.opportunities}</strong><small>{data.pipeline.approvedOpportunities} approved</small></div><div><span>Engagements</span><strong>{data.pipeline.engagements}</strong></div>
            <div><span>Queued</span><strong>{data.pipeline.queued}</strong></div><div><span>Learning records</span><strong>{data.pipeline.learning}</strong></div>
          </div>
        </article>
      </section>

      <section className="founder-grid founder-grid-main">
        <article className="founder-panel">
          <div className="founder-panel-head"><div><span>Cost anatomy</span><h2>Spend by intelligence stage</h2></div></div>
          <div className="founder-stage-list">{data.stages.length?data.stages.map(stage=><div key={stage.stage} className="founder-stage-row"><div className="founder-stage-copy"><strong>{stage.stage}</strong><small>{stage.calls} calls · {number(stage.tokens)} tokens · {latency(stage.latency)}</small></div><div className="founder-stage-meter"><i style={{width:pct(stage.cost,maxStage)}}/></div><b>{money(stage.cost)}</b></div>):<div className="founder-empty">No AI usage has been recorded in this period.</div>}</div>
        </article>
        <article className="founder-panel founder-optimisation-panel">
          <div className="founder-panel-head"><div><span>Optimisation centre</span><h2>Highest-leverage savings</h2></div></div>
          <div className="founder-optimisation-list">{data.optimisation.length?data.optimisation.map((item,index)=><div key={item.stage}><b>0{index+1}</b><div><strong>{item.stage}</strong><p>{item.message}</p></div></div>):<div className="founder-empty">Run the production pipeline to create an optimisation baseline.</div>}</div>
        </article>
      </section>

      <section className="founder-panel">
        <div className="founder-panel-head"><div><span>Request ledger</span><h2>Most expensive requests</h2></div></div>
        <div className="founder-table-wrap"><table className="founder-table"><thead><tr><th>Time</th><th>Workspace / campaign</th><th>Stage</th><th>Model</th><th>Prompt</th><th>Tokens</th><th>Latency</th><th>Cost</th></tr></thead><tbody>{data.highest.map(row=><tr key={row.id}><td>{new Date(row.created_at).toLocaleString("en-GB",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"})}</td><td><strong>{row.campaignName}</strong><small>{row.organisationName}</small></td><td>{row.stage}</td><td><code>{row.model}</code></td><td><span className="founder-prompt">{row.promptVersion}</span></td><td>{number((row.input_tokens??0)+(row.output_tokens??0))}</td><td>{latency(row.duration_ms??0)}</td><td><strong>{money(row.cost)}</strong></td></tr>)}</tbody></table></div>
      </section>


      <section className="founder-panel">
        <div className="founder-panel-head"><div><span>Campaign economics</span><h2>Cost to commercial outcome</h2></div></div>
        <div className="founder-table-wrap"><table className="founder-table"><thead><tr><th>Campaign</th><th>Requests</th><th>Spend</th><th>Opportunities</th><th>Review-ready</th><th>Completed journeys</th><th>Cost / opportunity</th><th>Cost / review-ready</th></tr></thead><tbody>{data.campaignEconomics.map(row=><tr key={row.id}><td><strong>{row.name}</strong><small>{row.organisation}</small></td><td>{row.requests}</td><td><strong>{money(row.spend)}</strong></td><td>{row.opportunities}</td><td>{row.reviewReady}</td><td>{row.completedJourneys}</td><td>{row.costPerOpportunity===null?"—":money(row.costPerOpportunity)}</td><td>{row.costPerReviewReady===null?"—":money(row.costPerReviewReady)}</td></tr>)}</tbody></table></div>
      </section>

      <section className="founder-grid founder-grid-equal">
        <article className="founder-panel"><div className="founder-panel-head"><div><span>Campaign economics</span><h2>Highest campaign spend</h2></div></div><div className="founder-ranked-list">{data.campaignCosts.map((row,index)=><div key={row.id}><b>{String(index+1).padStart(2,"0")}</b><div><strong>{row.name}</strong><small>{row.organisation} · {row.calls} calls · {number(row.tokens)} tokens</small></div><span>{money(row.cost)}</span></div>)}</div></article>
        <article className="founder-panel"><div className="founder-panel-head"><div><span>Model usage</span><h2>AI model economics</h2></div></div><div className="founder-ranked-list">{data.models.map((row,index)=><div key={row.model}><b>{String(index+1).padStart(2,"0")}</b><div><strong>{row.model}</strong><small>{row.calls} calls · {number(row.tokens)} tokens · {latency(row.latency)}</small></div><span>{money(row.cost)}</span></div>)}</div></article>
      </section>

      <section className="founder-grid founder-grid-equal">
        <article className="founder-panel"><div className="founder-panel-head"><div><span>Prompt intelligence</span><h2>Prompt cost profile</h2></div></div><div className="founder-ranked-list">{data.prompts.map((row,index)=><div key={row.prompt}><b>{String(index+1).padStart(2,"0")}</b><div><strong>{row.prompt}</strong><small>{row.calls} calls · {number(row.avgTokens)} average tokens</small></div><span>{money(row.avgCost)} avg</span></div>)}</div></article>
        <article className="founder-panel"><div className="founder-panel-head"><div><span>Production timeline</span><h2>SalesPilot working</h2></div></div><div className="founder-timeline">{data.timeline.map(row=><div key={row.id}><i/><div><strong>{row.title}</strong><p>{row.description??row.event_type.replaceAll("_"," ")}</p><small>{row.campaignName} · {new Date(row.occurred_at).toLocaleString("en-GB")}</small></div></div>)}</div></article>
      </section>
    </div>
  </main>;
}
