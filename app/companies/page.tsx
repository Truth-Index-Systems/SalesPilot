import Link from "next/link";
import { AppShell } from "@/components/shell";
import { Card, PageHeader } from "@/components/ui";
import { CompanyReviewQueue } from "@/components/company-review-queue";
import { requirePageUser } from "@/lib/auth/page-user";
import { listCompanies, companyCounts, type CompanyFilters } from "@/lib/discovery/repository";
import { listCampaigns } from "@/lib/campaigns/repository";
import { listContactDiscoveryActivity } from "@/lib/contacts/repository";
import { resolvePersistedJobState } from "@/lib/pipeline/presentation";

export const dynamic = "force-dynamic";

type Search = { status?: string; campaign?: string; q?: string; confidence?: string };
function queryString(input: Search) {
  const params = new URLSearchParams();
  Object.entries(input).forEach(([key, value]) => { if (value) params.set(key, value); });
  const query = params.toString();
  return query ? `/companies?${query}` : "/companies";
}

export default async function Companies({ searchParams }: { searchParams: Promise<Search> }) {
  const user = await requirePageUser("/companies");
  const search = await searchParams;
  const confidence = ["HIGH", "MEDIUM", "LOW"].includes(search.confidence ?? "") ? search.confidence as CompanyFilters["confidence"] : undefined;
  const filters: CompanyFilters = { status: search.status, campaignId: search.campaign, query: search.q?.trim(), confidence };
  const [rows, counts, workspaceCounts, campaigns, contactActivity] = await Promise.all([listCompanies(filters), companyCounts({ campaignId: search.campaign }), companyCounts(), listCampaigns(), listContactDiscoveryActivity()]);
  const contactStateByCompany = new Map<string, "QUEUED" | "RESEARCHING" | "RETRY_SCHEDULED" | "NO_RESULTS" | "CONTACTS_FOUND">(contactActivity.map(session => {
    const state = resolvePersistedJobState(session);
    const visibleState = state === "RUNNING" ? "RESEARCHING" : state === "FAILED_RETRYABLE" ? "RETRY_SCHEDULED" : state === "NO_RESULTS" || state === "EXHAUSTED" ? "NO_RESULTS" : state === "COMPLETED" ? "CONTACTS_FOUND" : "QUEUED";
    return [session.company_id, visibleState] as const;
  }));
  const rowsWithContactState = rows.map(row => ({ ...row, contact_state: contactStateByCompany.get(row.id) ?? (row.review_status === "APPROVED" ? "QUEUED" : undefined) }));
  const hasFilters = Boolean(search.status || search.campaign || search.q || search.confidence);

  return <AppShell title="Companies" user={user} workspaceStats={{ campaigns: campaigns.length, companies: workspaceCounts.total, replies: 0, opportunities: 0 }}>
    <PageHeader eyebrow="Company discovery" title="Company review queue" subtitle="Review verified businesses SalesPilot found for your approved outbound sales campaigns. Approve strong matches individually or in a controlled batch." />

    <Card className="company-review-summary">
      <div><span>Awaiting review</span><strong>{counts.pending}</strong></div>
      <div><span>Approved</span><strong>{counts.approved}</strong></div>
      <div><span>Not selected</span><strong>{counts.rejected}</strong></div>
      <div><span>Total verified</span><strong>{counts.total}</strong></div>
    </Card>

    <form className="company-search-controls" action="/companies" method="get">
      <input name="q" defaultValue={search.q} placeholder="Search company, industry or country" aria-label="Search companies" />
      <select name="campaign" defaultValue={search.campaign ?? ""} aria-label="Filter by campaign"><option value="">All campaigns</option>{campaigns.map(campaign => <option value={campaign.id} key={campaign.id}>{campaign.name}</option>)}</select>
      <select name="confidence" defaultValue={search.confidence ?? ""} aria-label="Filter by confidence"><option value="">All confidence</option><option value="HIGH">High confidence · 80+</option><option value="MEDIUM">Medium confidence · 60–79</option><option value="LOW">Lower confidence · below 60</option></select>
      {search.status && <input type="hidden" name="status" value={search.status} />}
      <button className="button secondary" type="submit">Apply filters</button>
      {hasFilters && <Link className="button text" href="/companies">Clear</Link>}
    </form>

    <div className="company-filter-row">
      <Link className={`filter-chip ${!search.status ? "active" : ""}`} href={queryString({ ...search, status: undefined })}>All · {counts.total}</Link>
      <Link className={`filter-chip ${search.status === "PENDING_REVIEW" ? "active" : ""}`} href={queryString({ ...search, status: "PENDING_REVIEW" })}>Awaiting review · {counts.pending}</Link>
      <Link className={`filter-chip ${search.status === "APPROVED" ? "active" : ""}`} href={queryString({ ...search, status: "APPROVED" })}>Approved · {counts.approved}</Link>
      <Link className={`filter-chip ${search.status === "REJECTED" ? "active" : ""}`} href={queryString({ ...search, status: "REJECTED" })}>Not selected · {counts.rejected}</Link>
    </div>

    {rows.length === 0 ? <Card><div className="empty"><h3>{hasFilters ? "No companies match these filters" : campaigns.length ? "Company discovery is preparing" : "No companies yet"}</h3><p>{hasFilters ? "Adjust or clear the filters to review more recommendations." : campaigns.length ? "SalesPilot will add independently verified recommendations here as discovery completes." : "Launch an outbound sales campaign to begin company discovery."}</p></div></Card> : <CompanyReviewQueue rows={rowsWithContactState} />}
  </AppShell>;
}
