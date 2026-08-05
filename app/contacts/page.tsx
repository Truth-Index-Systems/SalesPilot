import Link from "next/link";
import { AppShell } from "@/components/shell";
import { Card, PageHeader } from "@/components/ui";
import { ContactReviewQueue } from "@/components/contact-review-queue";
import { requirePageUser } from "@/lib/auth/page-user";
import { contactCounts, listContacts, listContactDiscoveryActivity, type ContactFilters } from "@/lib/contacts/repository";
import { companyCounts } from "@/lib/discovery/repository";
import { listCampaigns } from "@/lib/campaigns/repository";

export const dynamic = "force-dynamic";
type Search = { status?: string; campaign?: string; q?: string; confidence?: string };
function queryString(input: Search) { const p = new URLSearchParams(); Object.entries(input).forEach(([k,v]) => v && p.set(k,v)); return p.size ? `/contacts?${p}` : "/contacts"; }

export default async function Contacts({ searchParams }: { searchParams: Promise<Search> }) {
  const user = await requirePageUser("/contacts");
  const search = await searchParams;
  const status = ["PENDING_REVIEW","APPROVED","REJECTED","HOLD","ARCHIVED"].includes(search.status ?? "") ? search.status as ContactFilters["status"] : undefined;
  const confidence = ["HIGH","MEDIUM","LOW","VERIFIED","LIKELY","POSSIBLE","UNKNOWN"].includes(search.confidence ?? "") ? search.confidence as ContactFilters["confidence"] : undefined;
  const filters: ContactFilters = { status, campaignId: search.campaign, query: search.q?.trim(), confidence };
  const [rows, counts, allCounts, companies, campaigns, activity] = await Promise.all([
    listContacts(filters), contactCounts({ campaignId: search.campaign }), contactCounts(), companyCounts(), listCampaigns(), listContactDiscoveryActivity(),
  ]);
  const researching = activity.filter(row => ["QUEUED","RUNNING","FAILED"].includes(row.status)).length;
  const hasFilters = Boolean(search.status || search.campaign || search.q || search.confidence);
  return <AppShell title="Contacts" user={user} workspaceStats={{ campaigns: campaigns.length, companies: companies.total, replies: 0, opportunities: 0 }}>
    <PageHeader eyebrow="Autonomous contact discovery" title="Decision-maker review" subtitle="SalesPilot researches the right people inside approved companies, verifies the evidence, and pauses for human judgement before outreach." />
    <Card className="autonomous-flow-card">
      <div className="flow-stage complete"><span>1</span><div><small>Approved companies</small><strong>{companies.approved}</strong></div></div><i>→</i>
      <div className={`flow-stage ${researching ? "active" : "complete"}`}><span>2</span><div><small>Researching</small><strong>{researching}</strong></div></div><i>→</i>
      <div className={`flow-stage ${counts.pending ? "active" : ""}`}><span>3</span><div><small>Awaiting review</small><strong>{counts.pending}</strong></div></div><i>→</i>
      <div className="flow-stage"><span>4</span><div><small>Approved contacts</small><strong>{counts.approved}</strong></div></div><i>→</i>
      <div className="flow-stage"><span>5</span><div><small>Ready for outreach</small><strong>{counts.approved}</strong></div></div>
    </Card>
    <Card className="company-review-summary contact-review-summary"><div><span>Awaiting review</span><strong>{counts.pending}</strong></div><div><span>Approved</span><strong>{counts.approved}</strong></div><div><span>Held</span><strong>{counts.hold}</strong></div><div><span>Total found</span><strong>{counts.total}</strong></div></Card>
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
  </AppShell>;
}
