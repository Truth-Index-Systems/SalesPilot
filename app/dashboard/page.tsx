import { redirect } from "next/navigation";
import { hasFounderDashboardSession } from "@/lib/founder-dashboard/auth";
import { getFounderDashboard } from "@/lib/founder-dashboard/repository";
import { getCieFounderCommandCentre } from "@/lib/founder-dashboard/cie-command-centre";
import { GenesisG8ReviewWorkspace } from "@/components/genesis-g8-review-workspace";

export const dynamic = "force-dynamic";
const number=(value:number)=>new Intl.NumberFormat("en-GB").format(value);
const money=(value:number)=>`$${value.toFixed(value<1?4:2)}`;
const stateOrder=["ESTABLISHED","POSSIBLE","UNRESOLVED","CONTESTED","DORMANT","EXPIRED","IMPOSSIBLE"] as const;
const stateLabel=(value:string)=>value.replaceAll("_"," ");
const bandWidth=(count:number,total:number)=>`${total?Math.max(count?3:0,Math.round(count/total*100)):0}%`;
const pct=(value:number)=>`${Math.max(0,Math.min(100,value)).toFixed(value<10?1:0)}%`;
const age=(iso:string)=>{const ms=Date.now()-new Date(iso).getTime();const m=Math.max(0,Math.floor(ms/60000));if(m<1)return"just now";if(m<60)return`${m}m ago`;const h=Math.floor(m/60);if(h<24)return`${h}h ago`;return`${Math.floor(h/24)}d ago`;};

export default async function FounderDashboardPage({searchParams}:{searchParams:Promise<{range?:string}>}){
  if(!(await hasFounderDashboardSession())) redirect("/dashboard/login");
  const params=await searchParams;
  const range=[7,14,30].includes(Number(params.range))?Number(params.range):7;
  const [data,cie]=await Promise.all([getFounderDashboard(range),getCieFounderCommandCentre()]);
  const g8=data.g8CommandCentre;
  const measured=cie.researchDensity.companies-cie.researchDensity.bands.unmeasured;
  const actionable=(cie.realities.states.ESTABLISHED??0)+(cie.realities.states.POSSIBLE??0);
  const lastActivity=g8?.activity?.[0]?.occurredAt??data.generatedAt;
  const cap=g8?.capacity;
  const queue=(bucket:Record<string,number>,status:string)=>bucket[status]??0;
  const systemHealth=[
    ["Autonomy",cap?.mode==="PAUSED"?"Paused":"Healthy"],
    ["Expansion",queue(cie.queueHealth.expansion,"CLAIMED")>0||queue(cie.queueHealth.expansion,"QUEUED")>0?"Active":"Idle"],
    ["Depth",queue(cie.queueHealth.depth,"CLAIMED")>0||queue(cie.queueHealth.depth,"QUEUED")>0?"Active":"Idle"],
    ["Truth",cie.truthHealth.humanReview>0?"Review":"Healthy"],
    ["Persistence",cie.throughput.evidenceToday>0||cie.throughput.truthSnapshotsToday>0?"Healthy":"Quiet"],
    ["Governance",cap?.snapshot.governanceEnabled?"Healthy":"Unavailable"],
  ] as const;

  return <main className="founder-dashboard-shell cie-dashboard-shell">
    <header className="founder-topbar cie-topbar">
      <div className="founder-wordmark light"><span>MR</span><div><strong>MarketRoute</strong><small>Founder Command Centre</small></div></div>
      <div className="founder-topbar-actions"><small>CIE v1 · Updated {new Date(data.generatedAt).toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"})}</small><form method="post" action="/api/founder-dashboard/logout"><button type="submit">Lock dashboard</button></form></div>
    </header>

    <div className="founder-dashboard-content cie-dashboard-content">
      <section className="cie-mission-hero">
        <div><span className="founder-kicker">Genesis G8.2 · Commercial Intelligence Engine</span><h1>Founder Command Centre</h1><p>Database health, research pressure and autonomous commercial intelligence — in one operating view.</p></div>
        <div className="cie-mission-status"><i/><div><span>{cap?.mode==="PAUSED"?"PAUSED":"AUTONOMOUS"}</span><strong>Genesis is {cap?.mode==="PAUSED"?"paused":"operating"}</strong><small>Last intelligence activity {age(lastActivity)}</small></div></div>
      </section>

      <section className="cie-command-strip">
        <article><span>Research density</span><strong>{cie.researchDensity.average.toFixed(1)}%</strong><small>{number(measured)} measured / {number(cie.researchDensity.companies)} companies</small><div className="cie-hero-meter"><i style={{width:pct(cie.researchDensity.average)}}/></div></article>
        <article><span>Truth health</span><strong>{cie.truthHealth.averageTruth.toFixed(1)}</strong><small>{number(cie.truthHealth.auto)} auto-usable · {number(cie.truthHealth.verify)} verify</small></article>
        <article><span>Commercial realities</span><strong>{number(cie.realities.total)}</strong><small>{number(actionable)} established / possible</small></article>
        <article><span>Decision-ready</span><strong>{number(cie.reachability.ready)}</strong><small>CIE route + contact authority</small></article>
        <article><span>AI spend today</span><strong>{money(cap?.snapshot.costTodayUsd??data.totals.todayCost)}</strong><small>of {money(cap?.snapshot.dailyCostLimitUsd??0)} governed ceiling</small></article>
        <article><span>Active research</span><strong>{number(cie.research.active+cie.research.activeRepairs)}</strong><small>{number(cie.research.decisionBlocking)} decision-blocking</small></article>
      </section>

      <section className="founder-grid founder-grid-main cie-main-grid">
        <article className="founder-panel cie-density-panel">
          <div className="founder-panel-head"><div><span>Research depth</span><h2>Company knowledge density</h2></div><b className="founder-live-badge">Truth coverage</b></div>
          <div className="cie-density-bands">{[["100%",cie.researchDensity.bands.complete,"Complete"],["80–99%",cie.researchDensity.bands.high,"Deep"],["60–79%",cie.researchDensity.bands.medium,"Developing"],["<60%",cie.researchDensity.bands.low,"Shallow"],["Unmeasured",cie.researchDensity.bands.unmeasured,"Awaiting Truth snapshot"]].map(([label,count,caption])=><div key={String(label)}><div className="cie-density-label"><span>{label}</span><strong>{number(Number(count))}</strong></div><div className="cie-density-track"><i style={{width:bandWidth(Number(count),cie.researchDensity.companies)}}/></div><small>{caption}</small></div>)}</div>
          <p className="founder-method-note">Research Density is persisted Truth coverage for active companies. No field-count or heuristic score is computed in the UI.</p>
        </article>

        <article className="founder-panel cie-live-panel">
          <div className="founder-panel-head"><div><span>Today</span><h2>Intelligence throughput</h2></div><b className="founder-live-badge">Live persistence</b></div>
          <div className="cie-throughput-grid">
            <div><span>Companies</span><strong>+{number(cie.throughput.companiesToday)}</strong></div><div><span>Contacts</span><strong>+{number(cie.throughput.contactsToday)}</strong></div><div><span>Routes</span><strong>+{number(cie.throughput.routesToday)}</strong></div><div><span>Evidence</span><strong>+{number(cie.throughput.evidenceToday)}</strong></div><div><span>Truth snapshots</span><strong>+{number(cie.throughput.truthSnapshotsToday)}</strong></div><div><span>Jobs completed</span><strong>+{number(cie.throughput.depthCompletedToday+cie.throughput.expansionCompletedToday)}</strong></div>
          </div>
        </article>
      </section>

      <section className="founder-grid founder-grid-equal cie-main-grid">
        <article className="founder-panel">
          <div className="founder-panel-head"><div><span>Autonomous queues</span><h2>Research execution health</h2></div>{cap?<b className={`founder-capacity-badge mode-${cap.mode.toLowerCase()}`}>{cap.mode.replaceAll("_"," ")}</b>:null}</div>
          <div className="cie-queue-block"><div className="cie-queue-title"><strong>Expansion</strong><small>Industry breadth</small></div>{["QUEUED","CLAIMED","COMPLETED","FAILED"].map(s=><div key={s}><span>{s}</span><strong>{number(queue(cie.queueHealth.expansion,s))}</strong></div>)}</div>
          <div className="cie-queue-block"><div className="cie-queue-title"><strong>Depth</strong><small>Contacts + routes</small></div>{["QUEUED","CLAIMED","COMPLETED","FAILED"].map(s=><div key={s}><span>{s}</span><strong>{number(queue(cie.queueHealth.depth,s))}</strong></div>)}</div>
          <div className="cie-alert-line"><span>Failures today</span><strong>{number(cie.queueHealth.expansionFailuresToday+cie.queueHealth.depthFailuresToday)}</strong><small>Historical failures remain visible; temporary capacity deferrals are not failures.</small></div>
        </article>

        <article className="founder-panel">
          <div className="founder-panel-head"><div><span>Capacity</span><h2>Governed research envelope</h2></div><strong>{pct((cap?.capacityUsedRatio??0)*100)}</strong></div>
          {cap?<><div className="cie-capacity-meter"><i style={{width:pct(cap.capacityUsedRatio*100)}}/></div><div className="cie-reachability-grid"><div><span>Daily ceiling</span><strong>{money(cap.snapshot.dailyCostLimitUsd)}</strong></div><div><span>Spent today</span><strong>{money(cap.snapshot.costTodayUsd)}</strong></div><div><span>Remaining</span><strong>{money(Math.max(0,cap.snapshot.dailyCostLimitUsd-cap.snapshot.costTodayUsd))}</strong></div><div><span>Requests</span><strong>{number(cap.snapshot.requestsToday)}</strong></div><div><span>Request ceiling</span><strong>{number(cap.snapshot.dailyRequestLimit)}</strong></div><div><span>Background slots</span><strong>{number(cap.maximumBackgroundRepairs)}</strong></div></div><p className="founder-method-note">{cap.reasons[0]}</p></>:<div className="founder-empty">Capacity telemetry unavailable.</div>}
        </article>
      </section>

      <section className="founder-panel cie-industry-panel">
        <div className="founder-panel-head"><div><span>10-industry intelligence map</span><h2>Coverage and autonomous research</h2></div><b className="founder-live-badge">Genesis universe</b></div>
        <div className="cie-industry-grid">{g8?.industryResearch?.map(ind=><article key={ind.id}><div><strong>{ind.name}</strong><small>{number(ind.companiesResearched)} companies · target {number(ind.targetCompanyCount)}</small></div><span>{ind.progressPercent.toFixed(1)}%</span><div className="cie-industry-track"><i style={{width:pct(ind.progressPercent)}}/></div><footer><span>Contacts {number(ind.contactsResearched)}</span><span>Routes {number(ind.routesResearched)}</span><span>+{number(ind.companiesPersisted)} discovered</span></footer></article>)??<div className="founder-empty">Industry research telemetry unavailable.</div>}</div>
      </section>

      <section className="founder-grid founder-grid-equal cie-main-grid">
        <article className="founder-panel"><div className="founder-panel-head"><div><span>Truth health</span><h2>Evidence sufficiency</h2></div><strong>{cie.truthHealth.averageSufficiency.toFixed(1)}%</strong></div><div className="cie-status-stack"><div><span>Auto-usable</span><strong>{number(cie.truthHealth.auto)}</strong></div><div><span>Verify required</span><strong>{number(cie.truthHealth.verify)}</strong></div><div><span>Human review</span><strong>{number(cie.truthHealth.humanReview)}</strong></div><div><span>Missing claims</span><strong>{number(cie.researchDensity.claims.missing)}</strong></div><div><span>Contradicted</span><strong>{number(cie.researchDensity.claims.contradicted)}</strong></div><div><span>Dependency constrained</span><strong>{number(cie.researchDensity.claims.dependencyConstrained)}</strong></div><div><span>Probability state</span><strong>{number(cie.truthHealth.uncalibrated)} uncalibrated</strong></div></div><p className="founder-method-note">Evidence sufficiency measures support depth. It is not truth probability or model confidence.</p></article>
        <article className="founder-panel"><div className="founder-panel-head"><div><span>Commercial Reality</span><h2>Reality state distribution</h2></div><strong>{number(cie.realities.total)}</strong></div><div className="cie-state-list">{stateOrder.map(state=><div key={state} className={`cie-state-row state-${state.toLowerCase()}`}><span>{stateLabel(state)}</span><div><i style={{width:bandWidth(cie.realities.states[state]??0,cie.realities.total)}}/></div><strong>{number(cie.realities.states[state]??0)}</strong></div>)}</div></article>
      </section>

      <section className="founder-grid founder-grid-main cie-main-grid">
        <article className="founder-panel"><div className="founder-panel-head"><div><span>Research intelligence</span><h2>Highest-value active research</h2></div><strong>{cie.research.active}</strong></div><div className="cie-research-impact"><span>Blocking <b>{cie.research.decisionBlocking}</b></span><span>Sharpening <b>{cie.research.decisionSharpening}</b></span><span>Stability <b>{cie.research.stabilityRelevant}</b></span><span>Assurance <b>{cie.research.assuranceRelevant}</b></span><span>Enrichment <b>{cie.research.enrichment}</b></span></div><div className="founder-ranked-list">{cie.research.top.length?cie.research.top.map((item,index)=><div key={`${item.opportunityId}-${item.claimKey}`}><b>{String(index+1).padStart(2,"0")}</b><div><strong>{item.claimKey.replaceAll("_"," ")}</strong><small>{item.impactClass.replaceAll("_"," ")} · {item.objective}</small></div><span>Active</span></div>):<div className="founder-empty">No active decision-relevant research directives.</div>}</div></article>
        <article className="founder-panel"><div className="founder-panel-head"><div><span>Recent intelligence</span><h2>Latest persisted discoveries</h2></div><b className="founder-live-badge">Supabase</b></div><div className="cie-recent-list">{cie.recentDiscoveries.length?cie.recentDiscoveries.slice(0,10).map(item=><div key={item.id}><i className={`kind-${item.kind.toLowerCase()}`}/><div><strong>{item.label}</strong><small>{item.kind.replaceAll("_"," ")} · {age(item.occurredAt)}</small></div></div>):<div className="founder-empty">No new entities persisted today.</div>}</div></article>
      </section>

      <section className="founder-grid founder-grid-equal cie-main-grid">
        <article className="founder-panel"><div className="founder-panel-head"><div><span>Reachability</span><h2>Route & contact authority</h2></div><b className="founder-live-badge">Current R5/R6 only</b></div><div className="cie-reachability-grid"><div><span>Current bindings</span><strong>{number(cie.reachability.authoritativeDecisions)}</strong></div><div><span>READY</span><strong>{number(cie.reachability.ready)}</strong></div><div><span>Named contact</span><strong>{number(cie.reachability.namedContact)}</strong></div><div><span>Organisation route</span><strong>{number(cie.reachability.organisational)}</strong></div><div><span>Route stale</span><strong>{number(cie.reachability.routeStale)}</strong></div><div><span>Contact stale</span><strong>{number(cie.reachability.contactStale)}</strong></div></div><p className="founder-method-note">{number(cie.reachability.awaitingBinding)} commercial candidates are awaiting a current route/contact binding. Legacy route/contact scores are excluded.</p></article>
        <article className="founder-panel"><div className="founder-panel-head"><div><span>Authority integrity</span><h2>R4 → R5 → R6 lineage</h2></div><b className="founder-live-badge">Build 7 read model</b></div><div className="cie-reachability-grid"><div><span>Current</span><strong>{number(cie.authorityIntegrity.current)}</strong></div><div><span>READY</span><strong>{number(cie.authorityIntegrity.ready)}</strong></div><div><span>Stale</span><strong>{number(cie.authorityIntegrity.stale)}</strong></div><div><span>Workflow mismatch</span><strong>{number(cie.authorityIntegrity.workflowMismatches)}</strong></div><div><span>Route unresolved</span><strong>{number(cie.authorityIntegrity.routeUnresolved)}</strong></div><div><span>Contact unresolved</span><strong>{number(cie.authorityIntegrity.contactUnresolved)}</strong></div></div><p className="founder-method-note">READY is displayed only when R4, R5 and R6 producer versions, fingerprints, ACTIVE state and Contact Truth revalidation all agree.</p></article>
      </section>

      <section className="founder-grid founder-grid-equal cie-main-grid">
        <article className="founder-panel"><div className="founder-panel-head"><div><span>System health</span><h2>Constitutional operating status</h2></div><b className="founder-live-badge">Live telemetry</b></div><div className="cie-health-grid">{systemHealth.map(([label,status])=><div key={label}><i className={`health-${status.toLowerCase()}`}/><span>{label}</span><strong>{status}</strong></div>)}</div></article>
        <article className="founder-panel"><div className="founder-panel-head"><div><span>Authority events</span><h2>Latest invalidations</h2></div><strong>{number(cie.authorityIntegrity.workflowMismatches)} mismatch</strong></div><div className="cie-recent-list">{cie.authorityIntegrity.latestInvalidations.length?cie.authorityIntegrity.latestInvalidations.map((item,index)=><div key={`${item.layer}-${item.occurredAt}-${index}`}><i className="kind-route"/><div><strong>{item.layer} · {item.reason.replaceAll("_"," ")}</strong><small>{age(item.occurredAt)}</small></div></div>):<div className="founder-empty">No recent authority invalidations.</div>}</div></article>
      </section>

      <section className="founder-panel cie-company-table-panel"><div className="founder-panel-head"><div><span>Company intelligence</span><h2>Deepest researched companies</h2></div><strong>{cie.researchDensity.average.toFixed(1)}%</strong></div><div className="founder-table-wrap"><table className="founder-table cie-company-table"><thead><tr><th>Company</th><th>Density</th><th>Truth</th><th>Evidence sufficiency</th><th>Truth state</th><th>Missing</th><th>Contradicted</th></tr></thead><tbody>{cie.companies.map(row=><tr key={row.entityId}><td><strong>{row.name}</strong></td><td><div className="cie-table-density"><i style={{width:`${row.coverage}%`}}/><span>{row.coverage.toFixed(1)}%</span></div></td><td>{row.truthIndex.toFixed(1)}</td><td>{row.sufficiency.toFixed(1)}%</td><td><span className={`cie-pill ${row.reviewState.toLowerCase()}`}>{row.reviewState.replaceAll("_"," ")}</span></td><td>{row.missing}</td><td>{row.contradicted}</td></tr>)}</tbody></table></div></section>

      {g8?<GenesisG8ReviewWorkspace tasks={data.g8ReviewQueue} summary={data.g8ReviewSummary} activity={g8.activity} renderedAt={data.generatedAt}/>:null}
    </div>
  </main>;
}
