import { redirect } from "next/navigation";
import { hasFounderDashboardSession } from "@/lib/founder-dashboard/auth";
import { getFounderDashboard } from "@/lib/founder-dashboard/repository";
import { TimelineBox } from "@/components/timeline-box";
import { GenesisG8ReviewWorkspace } from "@/components/genesis-g8-review-workspace";

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
  const g8=data.g8CommandCentre;
  return <main className="founder-dashboard-shell">
    <header className="founder-topbar">
      <div className="founder-wordmark light"><span>SP</span><div><strong>MarketRoute</strong><small>Founder Operations</small></div></div>
      <div className="founder-topbar-actions"><small>Updated {new Date(data.generatedAt).toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"})}</small><form method="post" action="/api/founder-dashboard/logout"><button type="submit">Lock dashboard</button></form></div>
    </header>
    <div className="founder-dashboard-content">
      <section className="founder-dashboard-head">
        <div><span className="founder-kicker">Production command centre</span><h1>Founder Dashboard</h1><p>AI economics, autonomous pipeline health and operational learning across MarketRoute.</p></div>
        <nav className="founder-range" aria-label="Dashboard period"><a className={range===7?"active":""} href="/dashboard?range=7">7 days</a><a className={range===14?"active":""} href="/dashboard?range=14">14 days</a><a className={range===30?"active":""} href="/dashboard?range=30">30 days</a></nav>
      </section>

      {g8?<>
      <section className="founder-panel founder-intelligence-hero">
        <div className="founder-panel-head"><div><span>Genesis G8 Intelligence</span><h2>Intelligence command centre</h2></div><b className={`founder-capacity-badge mode-${g8.capacity.mode.toLowerCase()}`}>{g8.capacity.mode.replaceAll("_"," ")}</b></div>
        <div className="founder-intelligence-metrics">
          <div><span>Overall Truth Index</span><strong>{g8.overall.averageTruthIndex.toFixed(1)}</strong><small>{number(g8.overall.activeEntities)} active intelligence entities</small></div>
          <div><span>Confidence</span><strong>{g8.overall.averageConfidence.toFixed(1)}%</strong><small>reliability of known intelligence</small></div>
          <div><span>Coverage</span><strong>{g8.overall.averageCoverage.toFixed(1)}%</strong><small>completeness across active knowledge</small></div>
          <div><span>Knowledge hit rate</span><strong>{g8.retrieval.knowledgeHitRate.toFixed(1)}%</strong><small>{number(g8.retrieval.instantUsable)} instantly usable candidates</small></div>
          <div><span>Truth gain today</span><strong>+{g8.capacity.snapshot.truthGainToday.toFixed(2)}</strong><small>{g8.capacity.snapshot.truthGainPerRepairCall.toFixed(3)} per repair call</small></div>
        </div>
        <div className="founder-intelligence-strip">
          <span>Evidence <b>{number(g8.evidence.totalEvidence)}</b></span>
          <span>Knowledge <b>{g8.evidence.knowledgePercent.toFixed(0)}%</b></span>
          <span>Discovery <b>{g8.evidence.discoveryPercent.toFixed(0)}%</b></span>
          <span>Reused by campaigns <b>{number(g8.reuse.links)}</b></span>
          <span>Open reviews <b>{g8.reviews.openReviews}</b></span>
          <span>Blocking repairs <b>{g8.repairs.blocking}</b></span>
        </div>
        <div className="founder-activation-control">
          <div><span>Genesis operating model</span><strong>Level {g8.activation.effectiveLevel} · {g8.activation.mode.replaceAll("_"," ")}</strong><small>{g8.activation.rollbackApplied?`Safety rollback active from configured level ${g8.activation.configuredLevel}.`:(g8.activation.founderOverrideActive?`Founder override level ${g8.activation.configuredLevel}.`:`Adaptive Default · system level ${g8.activation.systemDefaultLevel}.`)} {g8.activation.cohortPercent}% deterministic cohort · up to {g8.activation.candidateLimit} Knowledge candidates. Discovery remains the universal fallback.</small></div>
          <form method="post" action="/dashboard/genesis-g8/activation" className="founder-activation-actions">
            <button type="submit" name="level" value="default" className={!g8.activation.founderOverrideActive?"active":""}>Adaptive default</button>{[0,1,2,3,4,5].map(level=><button key={level} type="submit" name="level" value={level} className={g8.activation.founderOverrideActive&&g8.activation.configuredLevel===level?"active":""}>{level===0?"Off":level===1?"Allowlist":level===2?"10%":level===3?"25%":level===4?"50%":"100%"}</button>)}
          </form>
          <div className="founder-activation-stats"><span>Attempts <b>{g8.activation.attempted}</b></span><span>Activated <b>{g8.activation.activated}</b></span><span>Fallbacks <b>{g8.activation.fallback}</b></span><span>Failures <b>{g8.activation.failed}</b></span><span>Repair burden <b>{g8.activation.repairBurden}</b></span><span>Rejected <b>{g8.activation.rejectedEntities}</b></span></div>
        </div>
      </section>

      <section className="founder-grid founder-grid-main founder-intelligence-grid">
        <article className="founder-panel">
          <div className="founder-panel-head"><div><span>Truth health</span><h2>Intelligence by entity</h2></div><strong>{g8.overall.averageTruthIndex.toFixed(1)}</strong></div>
          <div className="founder-truth-health-list">{g8.entityTypes.length?g8.entityTypes.map(item=><div key={item.entityType}><div><strong>{item.entityType.replaceAll("_"," ")}</strong><small>{number(item.count)} entities · {item.reviewRequired} review required</small></div><div className="founder-truth-meter"><i style={{width:`${Math.max(2,item.truthIndex)}%`}}/></div><b>{item.truthIndex.toFixed(1)}</b></div>):<div className="founder-empty">Genesis has not accumulated entity Truth snapshots yet.</div>}</div>
        </article>
        <article className="founder-panel founder-capacity-panel">
          <div className="founder-panel-head"><div><span>Capacity governor</span><h2>Intelligence budget</h2></div><b className={`founder-capacity-badge mode-${g8.capacity.mode.toLowerCase()}`}>{g8.capacity.mode.replaceAll("_"," ")}</b></div>
          <div className="founder-capacity-meter"><i style={{width:`${Math.min(100,g8.capacity.capacityUsedRatio*100)}%`}}/></div>
          <div className="founder-capacity-stats"><div><span>Used</span><strong>{(g8.capacity.capacityUsedRatio*100).toFixed(0)}%</strong></div><div><span>Background budget</span><strong>{money(g8.capacity.backgroundBudgetUsd)}</strong></div><div><span>Remaining</span><strong>{money(g8.capacity.backgroundRemainingUsd)}</strong></div><div><span>Repairs available</span><strong>{g8.capacity.maximumBackgroundRepairs}</strong></div></div>
          <p className="founder-method-note">{g8.capacity.reasons.join(" ")}</p>
        </article>
      </section>

      <section className="founder-grid founder-grid-equal founder-intelligence-grid">
        <article className="founder-panel">
          <div className="founder-panel-head"><div><span>Founder attention</span><h2>Where your judgement matters</h2></div><strong>{g8.attention.length}</strong></div>
          <div className="founder-attention-list">{g8.attention.length?g8.attention.map((item,index)=><div key={`${item.kind}-${item.entityId}`}><b>{String(index+1).padStart(2,"0")}</b><div><strong>{item.label}</strong><small>{item.kind.replaceAll("_"," ")} · {item.detail}</small></div><span>{item.truthIndex.toFixed(1)} TI</span></div>):<div className="founder-empty">No high-value Genesis decisions currently need attention.</div>}</div>
        </article>
        <article className="founder-panel">
          <div className="founder-panel-head"><div><span>Dual-channel operations</span><h2>Knowledge + Discovery</h2></div></div>
          <div className="founder-channel-grid"><div><span>Knowledge evidence</span><strong>{number(g8.evidence.knowledgeEvidence)}</strong><small>{g8.evidence.knowledgePercent.toFixed(1)}% of evidence graph</small></div><div><span>Discovery evidence</span><strong>{number(g8.evidence.discoveryEvidence)}</strong><small>{g8.evidence.discoveryPercent.toFixed(1)}% of evidence graph</small></div><div><span>Retrievals</span><strong>{number(g8.retrieval.retrievals)}</strong><small>{g8.retrieval.averageLatencyMs.toFixed(0)}ms average</small></div><div><span>Knowledge reuse</span><strong>{number(g8.reuse.entities)}</strong><small>entities reused across {g8.reuse.campaigns} campaigns</small></div><div><span>Customer repairs</span><strong>{g8.repairs.customerPending}</strong><small>always outrank background work</small></div><div><span>Background repairs</span><strong>{g8.repairs.backgroundPending}</strong><small>{g8.refresh.queuedPeriod} refreshes scheduled in period</small></div></div>
        </article>
      </section>

      <section className="founder-panel founder-industry-panel">
        <div className="founder-panel-head"><div><span>Market intelligence</span><h2>Industry research coverage</h2></div><strong>{number(g8.industryResearch.reduce((sum,item)=>sum+item.companiesResearched,0))} companies</strong></div>
        <p className="founder-method-note">Live G8.2 expansion coverage by target market. Companies researched counts unique persisted company memberships, while found/persisted totals show autonomous search throughput.</p>
        {g8.industryResearch.length?<div className="founder-industry-research-grid">{g8.industryResearch.map(industry=><article key={industry.id}>
          <div className="founder-industry-research-head"><div><strong>{industry.name}</strong><small>{industry.enabled?"Active expansion":"Paused"} · Priority {industry.priority}</small></div><b>{number(industry.companiesResearched)}</b></div>
          <div className="founder-industry-research-meter"><i style={{width:`${Math.max(1,industry.progressPercent)}%`}}/></div>
          <div className="founder-industry-research-stats"><span>Companies <b>{number(industry.companiesResearched)}</b></span><span>Contacts <b>{number(industry.contactsResearched)}</b></span><span>Routes <b>{number(industry.routesResearched)}</b></span><span>Jobs <b>{number(industry.completedJobs)}</b></span></div>
          <small className="founder-industry-research-foot">Search found {number(industry.companiesFound)} · persisted {number(industry.companiesPersisted)} · target {number(industry.targetCompanyCount)}{industry.lastActivity?` · active ${new Date(industry.lastActivity).toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"})}`:""}</small>
        </article>)}</div>:<div className="founder-empty">Run migration 0124 to enable per-industry expansion coverage.</div>}
      </section>

      <section className="founder-panel founder-industry-panel">
        <div className="founder-panel-head"><div><span>Truth by market</span><h2>Industry Truth Index</h2></div><strong>{g8.industries.length}</strong></div>
        {g8.industries.length?<div className="founder-industry-grid">{g8.industries.slice(0,12).map(industry=><article key={industry.id}><div><strong>{industry.name}</strong>{industry.reviewRequired?<span>Review</span>:null}</div><b>{industry.truthIndex.toFixed(1)}</b><small>Confidence {industry.confidence.toFixed(0)}% · Coverage {industry.coverage.toFixed(0)}%</small><div className="founder-truth-meter"><i style={{width:`${Math.max(2,industry.truthIndex)}%`}}/></div></article>)}</div>:<div className="founder-empty">Industry-level Truth will appear as Genesis creates industry entities. G8.2 expansion coverage above is already live independently.</div>}
      </section>
      </>:null}

      <section className="founder-metric-grid">
        <article><span>Spend today</span><strong>{money(data.totals.todayCost)}</strong><small>{data.totals.todayRequests} production requests</small></article>
        <article><span>Period spend</span><strong>{money(data.totals.totalCost)}</strong><small>{number(data.totals.requests)} ledger entries</small></article>
        <article><span>Average cost</span><strong>{money(data.totals.avgCost)}</strong><small>per successful request</small></article>
        <article><span>Average tokens</span><strong>{number(data.totals.avgTokens)}</strong><small>{latency(data.totals.avgLatency)} average latency</small></article>
        <article><span>Web searches</span><strong>{number(data.totals.webSearches)}</strong><small>provider research calls</small></article>
      </section>


      <GenesisG8ReviewWorkspace tasks={data.g8ReviewQueue} summary={data.g8ReviewSummary} activity={g8?.activity??[]} renderedAt={data.generatedAt} />

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
        <div className="founder-panel-head"><div><span>Market learning</span><h2>Channel performance</h2></div><strong>{data.outcomeTotals.recorded} outcomes</strong></div>
        <div className="founder-metric-grid">
          <article><span>Responses</span><strong>{data.outcomeTotals.responses}</strong><small>reply or stronger outcome</small></article>
          <article><span>Meetings</span><strong>{data.outcomeTotals.meetings}</strong><small>booked or commercially advanced</small></article>
          <article><span>Wins</span><strong>{data.outcomeTotals.wins}</strong><small>confirmed won opportunities</small></article>
          <article><span>Won value</span><strong>${data.outcomeTotals.wonValue.toFixed(0)}</strong><small>recorded commercial value</small></article>
        </div>
        <div className="founder-table-wrap section"><table className="founder-table"><thead><tr><th>Channel</th><th>Sample</th><th>Response rate</th><th>Meeting rate</th><th>Wins</th><th>Route quality</th><th>Signal</th></tr></thead><tbody>{data.channelLearning.length?data.channelLearning.map(row=><tr key={row.channel}><td><strong>{row.channel.replaceAll("_"," ")}</strong></td><td>{row.engagements}</td><td>{row.responseRate}%</td><td>{row.meetingRate}%</td><td>{row.wins}</td><td>{row.averageRouteQuality}/100</td><td>{row.sampleReady?"Learning signal":"Collecting evidence"}</td></tr>):<tr><td colSpan={7}>No commercial outcomes recorded in this period.</td></tr>}</tbody></table></div>
        <p className="founder-method-note">MarketRoute only treats a channel comparison as a learning signal after at least five completed engagements. Smaller samples remain visible but do not influence recommendations.</p>
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
        <article className="founder-panel"><div className="founder-panel-head"><div><span>Production timeline</span><h2>MarketRoute working</h2></div></div><TimelineBox dark entries={data.timeline.map(row=>({id:row.id,occurredAt:row.occurred_at,title:row.title,description:row.description??row.event_type.replaceAll("_"," "),meta:`${row.campaignName} · ${new Date(row.occurred_at).toLocaleString("en-GB")}`}))}/></article>
      </section>
    </div>
  </main>;
}
