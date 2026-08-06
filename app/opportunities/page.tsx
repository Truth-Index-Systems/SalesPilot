import Link from "next/link";
import { AppShell } from "@/components/shell";
import { Card, PageHeader } from "@/components/ui";
import { OpportunityReviewQueue } from "@/components/opportunity-review-queue";
import { requirePageUser } from "@/lib/auth/page-user";
import { listOpportunities } from "@/lib/opportunities/repository";
import { listCampaigns } from "@/lib/campaigns/repository";
import type { OpportunityOverview, OpportunityStatus } from "@/lib/opportunities/domain";
import { BriefcaseBusiness, CheckCircle2, ContactRound, ShieldCheck, Target } from "@/components/icons";

export const dynamic = "force-dynamic";

type Search = { status?: string; campaign?: string; q?: string; band?: string };

function queryString(input: Search) {
  const params = new URLSearchParams();
  Object.entries(input).forEach(([key, value]) => { if (value) params.set(key, value); });
  const query = params.toString();
  return query ? `/opportunities?${query}` : "/opportunities";
}

function matchesBand(row: OpportunityOverview, band?: string) {
  const score = row.opportunity_score ?? 0;
  if (band === "RECOMMENDED") return score >= 80 && !["REJECTED", "APPROVED", "ENGAGED"].includes(row.status);
  if (band === "REVIEW") return score >= 55 && score < 80 && !["REJECTED", "APPROVED", "ENGAGED"].includes(row.status);
  if (band === "INCOMPLETE") return row.status === "NEEDS_CONTACT" || row.status === "NEEDS_EVIDENCE" || row.status === "BUILDING";
  if (band === "LOW") return row.status === "LOW_PRIORITY" || score < 55;
  return true;
}

export default async function Opportunities({ searchParams }: { searchParams: Promise<Search> }) {
  const user = await requirePageUser("/opportunities");
  const search = await searchParams;
  const [allRows, campaigns] = await Promise.all([listOpportunities(), listCampaigns()]);
  const query = search.q?.trim().toLowerCase();
  const rows = allRows.filter(row => {
    if (search.campaign && row.campaign_id !== search.campaign) return false;
    if (search.status && row.status !== search.status) return false;
    if (!matchesBand(row, search.band)) return false;
    if (query && ![row.company_name, row.primary_contact_name, row.primary_contact_role, row.company_industry, row.company_country].some(value => value?.toLowerCase().includes(query))) return false;
    return true;
  });

  const recommended = allRows.filter(row => (row.opportunity_score ?? 0) >= 80 && !["APPROVED", "REJECTED", "ENGAGED"].includes(row.status)).length;
  const review = allRows.filter(row => (row.opportunity_score ?? 0) >= 55 && (row.opportunity_score ?? 0) < 80 && !["APPROVED", "REJECTED", "ENGAGED"].includes(row.status)).length;
  const incomplete = allRows.filter(row => ["BUILDING", "NEEDS_CONTACT", "NEEDS_EVIDENCE"].includes(row.status)).length;
  const approved = allRows.filter(row => row.status === "APPROVED").length;
  const reachable = allRows.filter(row => row.primary_contact_email || row.primary_route_email || row.primary_contact_linkedin_url).length;
  const hasFilters = Boolean(search.status || search.campaign || search.q || search.band);

  return <AppShell title="Opportunities" user={user} workspaceStats={{ campaigns: campaigns.length, companies: new Set(allRows.map(row => row.company_id)).size, replies: 0, opportunities: allRows.length }}>
    <PageHeader eyebrow="Opportunities" title="Your next best sales opportunities" subtitle="SalesPilot combines company fit, commercial need, route quality and evidence into one ranked recommendation. Nothing discovered is hidden because of a low score." action={<span className="badge green"><ShieldCheck size={14}/> Evidence-led ranking</span>} />

    <Card className="opportunity-philosophy">
      <div><span className="eyebrow">SalesPilot&apos;s recommendation model</span><h2>That&apos;s a great opportunity because there&apos;s a strong commercial need and a credible route into the organisation.</h2><p>Company evidence and access routes remain fully visible beneath every recommendation.</p></div>
      <BriefcaseBusiness size={34}/>
    </Card>

    <div className="grid cols-4 section">
      <Card><div className="card-title">Recommended</div><div className="metric-value">{recommended}</div><div className="metric-foot positive">Strongest opportunities first</div></Card>
      <Card><div className="card-title">Worth reviewing</div><div className="metric-value">{review}</div><div className="metric-foot">Potential with visible limitations</div></Card>
      <Card><div className="card-title">Research in progress</div><div className="metric-value">{incomplete}</div><div className="metric-foot">Needs route research or evidence</div></Card>
      <Card><div className="card-title">Approved for engagement</div><div className="metric-value">{approved}</div><div className="metric-foot positive">{reachable} opportunities currently reachable</div></Card>
    </div>

    <Card className="opportunity-review-flow section">
      <div><Target size={18}/><span>Company fit</span></div><i>→</i><div><ContactRound size={18}/><span>Best access route</span></div><i>→</i><div><ShieldCheck size={18}/><span>Reachability and evidence</span></div><i>→</i><div className="active"><CheckCircle2 size={18}/><span>Opportunity review</span></div>
    </Card>

    <form className="company-search-controls" action="/opportunities" method="get">
      <input name="q" defaultValue={search.q} placeholder="Search company, route, role or market" aria-label="Search opportunities" />
      <select name="campaign" defaultValue={search.campaign ?? ""}><option value="">All campaigns</option>{campaigns.map(campaign => <option value={campaign.id} key={campaign.id}>{campaign.name}</option>)}</select>
      <select name="status" defaultValue={search.status ?? ""}><option value="">All decisions</option><option value="READY">Awaiting decision</option><option value="APPROVED">Approved</option><option value="REJECTED">Not selected</option><option value="NEEDS_CONTACT">Route research needed</option><option value="NEEDS_EVIDENCE">Needs evidence</option><option value="LOW_PRIORITY">Low priority</option></select>
      {search.band && <input type="hidden" name="band" value={search.band}/>}<button className="button secondary">Apply filters</button>{hasFilters && <Link className="button text" href="/opportunities">Clear</Link>}
    </form>

    <div className="company-filter-row">
      <Link className={`filter-chip ${!search.band ? "active" : ""}`} href={queryString({ ...search, band: undefined })}>All · {allRows.length}</Link>
      <Link className={`filter-chip ${search.band === "RECOMMENDED" ? "active" : ""}`} href={queryString({ ...search, band: "RECOMMENDED" })}>Recommended · {recommended}</Link>
      <Link className={`filter-chip ${search.band === "REVIEW" ? "active" : ""}`} href={queryString({ ...search, band: "REVIEW" })}>Worth reviewing · {review}</Link>
      <Link className={`filter-chip ${search.band === "INCOMPLETE" ? "active" : ""}`} href={queryString({ ...search, band: "INCOMPLETE" })}>Still assembling · {incomplete}</Link>
      <Link className={`filter-chip ${search.status === "APPROVED" ? "active" : ""}`} href={queryString({ ...search, status: "APPROVED" as OpportunityStatus, band: undefined })}>Approved · {approved}</Link>
    </div>

    {rows.length ? <OpportunityReviewQueue rows={rows}/> : <Card><div className="empty"><h3>{hasFilters ? "No opportunities match these filters" : "SalesPilot is assembling opportunities"}</h3><p>{hasFilters ? "Adjust or clear the filters." : "Every discovered company will remain visible as contact and evidence intelligence is added."}</p></div></Card>}
  </AppShell>;
}
