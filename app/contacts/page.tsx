import Link from "next/link";
import { AppShell } from "@/components/shell";
import { Card, PageHeader } from "@/components/ui";
import { ContactReviewQueue } from "@/components/contact-review-queue";
import { ContactAutoRefresh } from "@/components/contact-auto-refresh";
import { requirePageUser } from "@/lib/auth/page-user";
import { contactCounts, listContacts, listContactDiscoveryActivity, listCompanyContactChannels, type ContactFilters } from "@/lib/contacts/repository";
import { companyCounts, listCompanies } from "@/lib/discovery/repository";
import { listCampaigns } from "@/lib/campaigns/repository";
import { Activity, ArrowRight, CheckCircle2, Search, ShieldCheck, Mail, ExternalLink } from "@/components/icons";
import { isJobActive, isJobComplete, isJobRetryScheduled, jobStateLabel, jobTone, resolvePersistedJobState } from "@/lib/pipeline/presentation";

export const dynamic = "force-dynamic";
type SearchParams = { status?: string; campaign?: string; q?: string; confidence?: string };
function queryString(input: SearchParams) { const p = new URLSearchParams(); Object.entries(input).forEach(([k,v]) => v && p.set(k,v)); return p.size ? `/contacts?${p}` : "/contacts"; }
function sessionLabel(item: any) {
  const state = resolvePersistedJobState(item);
  if (state !== "RUNNING") return jobStateLabel(item, { queued: "Contact research queued", complete: "Contact research completed", noResults: "No publicly supported decision-maker found" });
  return ({ PREPARING:"Preparing research", RESEARCHING:"Researching leadership", IDENTIFYING:"Identifying decision-makers", VALIDATING:"Validating roles and evidence", SAVING:"Saving verified contacts", COMPLETE:"Contact research completed" } as Record<string,string>)[item.stage ?? ""] ?? "Researching decision-makers";
}

export default async function Contacts({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requirePageUser("/contacts");
  const search = await searchParams;
  const status = ["PENDING_REVIEW","APPROVED","REJECTED","HOLD","ARCHIVED"].includes(search.status ?? "") ? search.status as ContactFilters["status"] : undefined;
  const confidence = ["HIGH","MEDIUM","LOW","VERIFIED","LIKELY","POSSIBLE","UNKNOWN"].includes(search.confidence ?? "") ? search.confidence as ContactFilters["confidence"] : undefined;
  const filters: ContactFilters = { status, campaignId: search.campaign, query: search.q?.trim(), confidence };
  const [rows, counts, allCounts, companies, companyRows, campaigns, activity, companyChannels] = await Promise.all([
    listContacts(filters), contactCounts({ campaignId: search.campaign }), contactCounts(), companyCounts(), listCompanies({ status: "APPROVED" }), listCampaigns(), listContactDiscoveryActivity(), listCompanyContactChannels({ campaignId: search.campaign }),
  ]);
  const companyById = new Map(companyRows.map(row => [row.id, row.company_name]));
  const activeSessions = activity.filter(isJobActive);
  const runningSessions = activity.filter(row => resolvePersistedJobState(row) === "RUNNING");
  const queuedSessions = activity.filter(row => resolvePersistedJobState(row) === "QUEUED");
  const retrySessions = activity.filter(isJobRetryScheduled);
  const researching = runningSessions.length;
  const completedCompanies = new Set(activity.filter(isJobComplete).map(row => row.company_id)).size;
  const waitingResearch = Math.max(0, companies.approved - completedCompanies - activeSessions.length - retrySessions.length);
  const hasFilters = Boolean(search.status || search.campaign || search.q || search.confidence);
  const latestActivity = activity.slice(0, 5);
  const verifiedEmails = rows.filter(row => row.email_status === "VERIFIED").length;
  const likelyEmails = rows.filter(row => row.email_status === "LIKELY").length;
  const linkedInProfiles = rows.filter(row => Boolean(row.linkedin_profile_url)).length;
  const reachableApproved = rows.filter(row => row.review_status === "APPROVED" && (row.email_address || row.linkedin_profile_url)).length;
  const primaryRoutes = companyChannels.filter(row => row.is_primary);
  const publicVerifiedRoutes = companyChannels.filter(row => row.verification_status === "PUBLIC_VERIFIED").length;
  const companiesWithRoutes = new Set(companyChannels.map(row => row.company_id)).size;

  return <AppShell title="Contacts" user={user} workspaceStats={{ campaigns: campaigns.length, companies: companies.total, replies: 0, opportunities: 0 }}>
    <ContactAutoRefresh active={activeSessions.length > 0 || retrySessions.length > 0}/><PageHeader eyebrow="Autonomous contact discovery" title="Decision-maker review" subtitle="SalesPilot researches the right people inside approved companies, verifies the evidence, and pauses for human judgement before outreach." />

    <Card className="autonomous-flow-card">
      <div className="flow-stage complete"><span>1</span><div><small>Approved companies</small><strong>{companies.approved}</strong></div></div><i>→</i>
      <div className={`flow-stage ${researching ? "active" : completedCompanies ? "complete" : ""}`}><span>2</span><div><small>Researching</small><strong>{researching}</strong></div></div><i>→</i>
      <div className={`flow-stage ${counts.pending ? "active" : counts.total ? "complete" : ""}`}><span>3</span><div><small>Awaiting review</small><strong>{counts.pending}</strong></div></div><i>→</i>
      <div className={`flow-stage ${counts.approved ? "complete" : ""}`}><span>4</span><div><small>Approved contacts</small><strong>{counts.approved}</strong></div></div><i>→</i>
      <div className={`flow-stage ${counts.approved ? "active" : ""}`}><span>5</span><div><small>Ready for outreach</small><strong>{counts.approved}</strong></div></div>
    </Card>

    <div className="contact-intelligence-grid">
      <Card className="contact-progress-card">
        <div className="section-head"><div><div className="card-title">Company contact coverage</div><div className="card-subtitle">How approved companies are moving through contact research.</div></div><ShieldCheck size={20}/></div>
        <div className="contact-coverage-list section">
          <div><span>Approved companies</span><strong>{companies.approved}</strong></div>
          <div><span>Research completed</span><strong>{completedCompanies}</strong></div>
          <div><span>Currently researching</span><strong>{researching}</strong></div>
          <div><span>Queued</span><strong>{queuedSessions.length}</strong></div>
          <div><span>Awaiting research</span><strong>{waitingResearch}</strong></div>
          {retrySessions.length > 0 && <div><span>Retry scheduled</span><strong>{retrySessions.length}</strong></div>}
        </div>
      </Card>
      <Card className="contact-activity-card">
        <div className="section-head"><div><div className="card-title">SalesPilot activity</div><div className="card-subtitle">The latest autonomous contact-discovery work.</div></div><span className={`live-dot ${researching ? "active" : ""}`}/></div>
        <div className="contact-activity-feed section">
          {latestActivity.length ? latestActivity.map(item => <div key={item.id} className="contact-activity-item"><span className={jobTone(item) === "complete" ? "complete" : jobTone(item) === "attention" ? "attention" : "active"}>{isJobComplete(item) ? <CheckCircle2 size={14}/> : <Activity size={14}/>}</span><div><strong>{companyById.get(item.company_id) ?? "Approved company"}</strong><small>{sessionLabel(item)}{item.contacts_saved ? ` · ${item.contacts_saved} saved` : ""}</small></div></div>) : <div className="contact-activity-empty"><Search size={18}/><span>Approve a company and SalesPilot will begin decision-maker research automatically.</span></div>}
        </div>
      </Card>
    </div>

    <Card className="company-review-summary contact-review-summary"><div><span>Awaiting review</span><strong>{counts.pending}</strong></div><div><span>Approved</span><strong>{counts.approved}</strong></div><div><span>Verified emails</span><strong>{verifiedEmails}</strong><small>{likelyEmails} likely</small></div><div><span>LinkedIn profiles</span><strong>{linkedInProfiles}</strong></div></Card>
    <Card className="contact-channel-summary"><div className="section-head"><div><div className="card-title">Outreach channel readiness</div><div className="card-subtitle">SalesPilot only exposes contact methods supported by transparent evidence.</div></div><ShieldCheck size={20}/></div><div className="channel-readiness-grid section"><div><Mail size={17}/><span>Email coverage</span><strong>{verifiedEmails + likelyEmails}</strong><small>{verifiedEmails} verified · {likelyEmails} likely</small></div><div><ExternalLink size={17}/><span>LinkedIn coverage</span><strong>{linkedInProfiles}</strong><small>Matched public profiles</small></div><div><CheckCircle2 size={17}/><span>Approved and reachable</span><strong>{reachableApproved}</strong><small>Ready for G4 channel selection</small></div></div></Card>
    <Card className="company-route-card"><div className="section-head"><div><div className="card-title">Best routes into each business</div><div className="card-subtitle">SalesPilot searches every official company email route, ranks who is most likely to read and respond, and remembers what works.</div></div><Mail size={20}/></div><div className="company-route-summary section"><div><span>Companies with a route</span><strong>{companiesWithRoutes}</strong></div><div><span>Publicly verified emails</span><strong>{publicVerifiedRoutes}</strong></div><div><span>Primary routes selected</span><strong>{primaryRoutes.length}</strong></div></div>{primaryRoutes.length?<div className="company-route-list section">{primaryRoutes.slice(0,6).map(route=><div className="company-route-item" key={route.id}><div className="company-route-rank">{route.routing_score}</div><div><strong>{route.email_address}</strong><span>{companyById.get(route.company_id)??"Approved company"} · {route.likely_reader}</span><small>{route.reason_selected}</small></div><span className={`route-status ${route.verification_status.toLowerCase()}`}>{route.verification_status.replaceAll("_"," ").toLowerCase()}</span><a href={route.source_url} target="_blank" rel="noreferrer" aria-label="Open email evidence"><ExternalLink size={15}/></a></div>)}</div>:<div className="contact-activity-empty section"><Search size={18}/><span>Company email routes will appear as autonomous research completes.</span></div>}</Card>
    <form className="company-search-controls" action="/contacts" method="get">
      <input name="q" defaultValue={search.q} placeholder="Search name, role, company or location" aria-label="Search contacts" />
      <select name="campaign" defaultValue={search.campaign ?? ""}><option value="">All campaigns</option>{campaigns.map(c => <option value={c.id} key={c.id}>{c.name}</option>)}</select>
      <select name="confidence" defaultValue={search.confidence ?? ""}><option value="">All confidence</option><option value="HIGH">High confidence · 80+</option><option value="MEDIUM">Medium confidence · 60–79</option><option value="LOW">Lower confidence · below 60</option></select>
      {search.status && <input type="hidden" name="status" value={search.status}/>}<button className="button secondary">Apply filters</button>{hasFilters && <Link className="button text" href="/contacts">Clear</Link>}
    </form>
    <div className="company-filter-row">
      <Link className={`filter-chip ${!search.status ? "active" : ""}`} href={queryString({...search,status:undefined})}>All · {counts.total}</Link>
      <Link className={`filter-chip ${search.status === "PENDING_REVIEW" ? "active" : ""}`} href={queryString({...search,status:"PENDING_REVIEW"})}>Awaiting review · {counts.pending}</Link>
      <Link className={`filter-chip ${search.status === "APPROVED" ? "active" : ""}`} href={queryString({...search,status:"APPROVED"})}>Approved · {counts.approved}</Link>
      <Link className={`filter-chip ${search.status === "HOLD" ? "active" : ""}`} href={queryString({...search,status:"HOLD"})}>Held · {counts.hold}</Link>
      <Link className={`filter-chip ${search.status === "REJECTED" ? "active" : ""}`} href={queryString({...search,status:"REJECTED"})}>Not selected · {counts.rejected}</Link>
    </div>
    {rows.length ? <ContactReviewQueue rows={rows}/> : <Card><div className="empty"><h3>{hasFilters ? "No contacts match these filters" : researching ? "SalesPilot is researching decision-makers" : "No contacts yet"}</h3><p>{hasFilters ? "Adjust or clear the filters." : researching ? "Verified contacts will appear here as research completes." : "Approve companies to begin autonomous contact discovery."}</p></div></Card>}

    <Card className="contact-next-stage"><div><span className="eyebrow">Next autonomous stage</span><h3>Outreach</h3><p>Approved contacts automatically become available for evidence-led, personalised outreach in G4.</p></div><div className="next-stage-count"><strong>{reachableApproved}</strong><span>approved and reachable</span></div><ArrowRight size={22}/></Card>
  </AppShell>;
}
