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
const bandWidth=(count:number,total:number)=>`${total?Math.max(3,Math.round(count/total*100)):0}%`;

export default async function FounderDashboardPage({searchParams}:{searchParams:Promise<{range?:string}>}){
  if(!(await hasFounderDashboardSession())) redirect("/dashboard/login");
  const params=await searchParams;
  const range=[7,14,30].includes(Number(params.range))?Number(params.range):7;
  const [data,cie]=await Promise.all([getFounderDashboard(range),getCieFounderCommandCentre()]);
  const g8=data.g8CommandCentre;
  const measured=cie.researchDensity.companies-cie.researchDensity.bands.unmeasured;
  const actionable=(cie.realities.states.ESTABLISHED??0)+(cie.realities.states.POSSIBLE??0);
  return <main className="founder-dashboard-shell cie-dashboard-shell">
    <header className="founder-topbar cie-topbar">
      <div className="founder-wordmark light"><span>MR</span><div><strong>MarketRoute</strong><small>CIE Command Centre</small></div></div>
      <div className="founder-topbar-actions"><small>CIE v1 · Updated {new Date(data.generatedAt).toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"})}</small><form method="post" action="/api/founder-dashboard/logout"><button type="submit">Lock dashboard</button></form></div>
    </header>

    <div className="founder-dashboard-content cie-dashboard-content">
      <section className="founder-dashboard-head cie-dashboard-head">
        <div><span className="founder-kicker">Genesis commercial intelligence engine</span><h1>Commercial Intelligence Command Centre</h1><p>What Genesis knows, where commercial reality is blocked, and what the engine is researching next.</p></div>
        <nav className="founder-range" aria-label="Dashboard period"><a className={range===7?"active":""} href="/dashboard?range=7">7 days</a><a className={range===14?"active":""} href="/dashboard?range=14">14 days</a><a className={range===30?"active":""} href="/dashboard?range=30">30 days</a></nav>
      </section>

      <section className="cie-hero-grid">
        <article className="cie-hero-card primary"><span>Research density</span><strong>{cie.researchDensity.average.toFixed(1)}%</strong><small>{number(measured)} measured companies · {number(cie.researchDensity.companies)} total</small><div className="cie-hero-meter"><i style={{width:`${cie.researchDensity.average}%`}}/></div></article>
        <article className="cie-hero-card"><span>Commercial realities</span><strong>{number(cie.realities.total)}</strong><small>{number(actionable)} possible / established</small></article>
        <article className="cie-hero-card"><span>Decision-ready</span><strong>{number(cie.reachability.ready)}</strong><small>CIE route + contact authority applied</small></article>
        <article className="cie-hero-card"><span>Active research</span><strong>{number(cie.research.active)}</strong><small>{number(cie.research.decisionBlocking)} decision-blocking directives</small></article>
        <article className="cie-hero-card"><span>Truth health</span><strong>{cie.truthHealth.averageTruth.toFixed(1)}</strong><small>{cie.truthHealth.verify} verify · {cie.truthHealth.humanReview} human review</small></article>
      </section>

      <section className="founder-grid founder-grid-main cie-main-grid">
        <article className="founder-panel cie-density-panel">
          <div className="founder-panel-head"><div><span>Research depth</span><h2>Company knowledge density</h2></div><b className="founder-live-badge">Decision-relevant coverage</b></div>
          <div className="cie-density-bands">
            {[
              ["100%",cie.researchDensity.bands.complete,"Complete"],
              ["80–99%",cie.researchDensity.bands.high,"Deep"],
              ["60–79%",cie.researchDensity.bands.medium,"Developing"],
              ["<60%",cie.researchDensity.bands.low,"Shallow"],
              ["Unmeasured",cie.researchDensity.bands.unmeasured,"Awaiting Truth snapshot"],
            ].map(([label,count,caption])=><div key={String(label)}><div className="cie-density-label"><span>{label}</span><strong>{number(Number(count))}</strong></div><div className="cie-density-track"><i style={{width:bandWidth(Number(count),cie.researchDensity.companies)}}/></div><small>{caption}</small></div>)}
          </div>
          <p className="founder-method-note">Density is the latest Truth coverage for each active company entity. It measures represented decision-relevant knowledge, not raw field count.</p>
        </article>

        <article className="founder-panel cie-truth-panel">
          <div className="founder-panel-head"><div><span>Truth health</span><h2>Knowledge pressure</h2></div><strong>{cie.truthHealth.averageConfidence.toFixed(1)}%</strong></div>
          <div className="cie-status-stack">
            <div><span>Auto-usable companies</span><strong>{number(cie.truthHealth.auto)}</strong></div>
            <div><span>Verify required</span><strong>{number(cie.truthHealth.verify)}</strong></div>
            <div><span>Human review required</span><strong>{number(cie.truthHealth.humanReview)}</strong></div>
            <div><span>Missing claims</span><strong>{number(cie.researchDensity.claims.missing)}</strong></div>
            <div><span>Contradicted claims</span><strong>{number(cie.researchDensity.claims.contradicted)}</strong></div>
            <div><span>Dependency constrained</span><strong>{number(cie.researchDensity.claims.dependencyConstrained)}</strong></div>
          </div>
        </article>
      </section>

      <section className="founder-grid founder-grid-equal cie-main-grid">
        <article className="founder-panel">
          <div className="founder-panel-head"><div><span>Commercial Reality</span><h2>Reality state distribution</h2></div><strong>{number(cie.realities.total)}</strong></div>
          <div className="cie-state-list">{stateOrder.map(state=><div key={state} className={`cie-state-row state-${state.toLowerCase()}`}><span>{stateLabel(state)}</span><div><i style={{width:bandWidth(cie.realities.states[state]??0,cie.realities.total)}}/></div><strong>{number(cie.realities.states[state]??0)}</strong></div>)}</div>
          <div className="cie-disposition-strip"><span>Candidate <b>{cie.realities.dispositions.COMMERCIAL_CANDIDATE??0}</b></span><span>Research <b>{cie.realities.dispositions.RESEARCH_REQUIRED??0}</b></span><span>Temporal hold <b>{cie.realities.dispositions.HOLD_TEMPORAL??0}</b></span><span>Rejected <b>{cie.realities.dispositions.REJECT??0}</b></span></div>
        </article>

        <article className="founder-panel">
          <div className="founder-panel-head"><div><span>Reachability</span><h2>Route & contact authority</h2></div><b className="founder-live-badge">CIE-R5/R6</b></div>
          <div className="cie-reachability-grid">
            <div><span>Authoritative bindings</span><strong>{number(cie.reachability.authoritativeDecisions)}</strong></div>
            <div><span>READY</span><strong>{number(cie.reachability.ready)}</strong></div>
            <div><span>Named contact</span><strong>{number(cie.reachability.namedContact)}</strong></div>
            <div><span>Organisational route</span><strong>{number(cie.reachability.organisational)}</strong></div>
            <div><span>Multi-contact frontier</span><strong>{number(cie.reachability.multiContactFrontier)}</strong></div>
            <div><span>Awaiting binding</span><strong>{number(cie.reachability.awaitingBinding)}</strong></div>
          </div>
          <p className="founder-method-note">No weighted route or contact score is shown. Reachability is categorical and derives from CIE graph/contact authority.</p>
        </article>
      </section>

      <section className="founder-grid founder-grid-main cie-main-grid">
        <article className="founder-panel">
          <div className="founder-panel-head"><div><span>Research intelligence</span><h2>What Genesis is researching now</h2></div><strong>{cie.research.active}</strong></div>
          <div className="cie-research-impact"><span>Blocking <b>{cie.research.decisionBlocking}</b></span><span>Sharpening <b>{cie.research.decisionSharpening}</b></span><span>Stability <b>{cie.research.stabilityRelevant}</b></span><span>Assurance <b>{cie.research.assuranceRelevant}</b></span><span>Enrichment <b>{cie.research.enrichment}</b></span></div>
          <div className="founder-ranked-list">{cie.research.top.length?cie.research.top.map((item,index)=><div key={`${item.opportunityId}-${item.claimKey}`}><b>{String(index+1).padStart(2,"0")}</b><div><strong>{item.claimKey.replaceAll("_"," ")}</strong><small>{item.impactClass.replaceAll("_"," ")} · {item.objective}</small></div><span>Active</span></div>):<div className="founder-empty">No active CIE research directives. Genesis currently has no decision-relevant research pressure.</div>}</div>
        </article>
        <article className="founder-panel">
          <div className="founder-panel-head"><div><span>Autonomous work</span><h2>Research execution</h2></div>{g8?<b className={`founder-capacity-badge mode-${g8.capacity.mode.toLowerCase()}`}>{g8.capacity.mode.replaceAll("_"," ")}</b>:null}</div>
          <div className="cie-reachability-grid"><div><span>Queued repairs</span><strong>{cie.research.queuedRepairs}</strong></div><div><span>Claimed repairs</span><strong>{cie.research.activeRepairs}</strong></div>{g8?<><div><span>Completed repairs</span><strong>{g8.repairs.completed}</strong></div><div><span>Blocking repairs</span><strong>{g8.repairs.blocking}</strong></div><div><span>Truth gain today</span><strong>+{g8.capacity.snapshot.truthGainToday.toFixed(2)}</strong></div><div><span>Budget remaining</span><strong>{money(g8.capacity.backgroundRemainingUsd)}</strong></div></>:null}</div>
        </article>
      </section>

      <section className="founder-panel cie-company-table-panel">
        <div className="founder-panel-head"><div><span>Company intelligence</span><h2>Deepest researched companies</h2></div><strong>{cie.researchDensity.average.toFixed(1)}%</strong></div>
        <div className="founder-table-wrap"><table className="founder-table cie-company-table"><thead><tr><th>Company</th><th>Density</th><th>Truth</th><th>Confidence</th><th>Truth state</th><th>Missing</th><th>Contradicted</th></tr></thead><tbody>{cie.companies.map(row=><tr key={row.entityId}><td><strong>{row.name}</strong></td><td><div className="cie-table-density"><i style={{width:`${row.coverage}%`}}/><span>{row.coverage.toFixed(1)}%</span></div></td><td>{row.truthIndex.toFixed(1)}</td><td>{row.confidence.toFixed(1)}%</td><td><span className={`cie-pill ${row.reviewState.toLowerCase()}`}>{row.reviewState.replaceAll("_"," ")}</span></td><td>{row.missing}</td><td>{row.contradicted}</td></tr>)}</tbody></table></div>
      </section>

      {g8?<GenesisG8ReviewWorkspace tasks={data.g8ReviewQueue} summary={data.g8ReviewSummary} activity={g8.activity} renderedAt={data.generatedAt}/>:null}

      <section className="founder-grid founder-grid-equal cie-ops-footer">
        <article className="founder-panel"><div className="founder-panel-head"><div><span>Economics</span><h2>AI operating cost</h2></div><strong>{money(data.totals.totalCost)}</strong></div><div className="cie-reachability-grid"><div><span>Today</span><strong>{money(data.totals.todayCost)}</strong></div><div><span>Requests</span><strong>{number(data.totals.requests)}</strong></div><div><span>Average request</span><strong>{money(data.totals.avgCost)}</strong></div><div><span>Web searches</span><strong>{number(data.totals.webSearches)}</strong></div></div></article>
        <article className="founder-panel"><div className="founder-panel-head"><div><span>Production</span><h2>Database footprint</h2></div><b className="founder-live-badge">Live</b></div><div className="cie-reachability-grid"><div><span>Companies</span><strong>{number(data.pipeline.companies)}</strong></div><div><span>Contacts</span><strong>{number(data.pipeline.contacts)}</strong></div><div><span>Opportunities</span><strong>{number(data.pipeline.opportunities)}</strong></div><div><span>Learning records</span><strong>{number(data.pipeline.learning)}</strong></div></div></article>
      </section>
    </div>
  </main>;
}
