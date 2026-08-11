import Link from "next/link";
import { AppShell } from "@/components/shell";
import { PublicLanding } from "@/components/public-landing";
import { ButtonLink, Card, Metric, PageHeader } from "@/components/ui";
import { ArrowRight, BriefcaseBusiness, Plus, Sparkles } from "@/components/icons";
import { listCampaigns } from "@/lib/campaigns/repository";
import { presentCampaignStatus } from "@/lib/campaigns/presenter";
import { getCurrentUser } from "@/lib/auth/current-user";
import type { CampaignSummary } from "@/lib/campaigns/schemas";
import { companyCounts } from "@/lib/discovery/repository";
import { listOpportunities } from "@/lib/opportunities/repository";
import type { OpportunityOverview } from "@/lib/opportunities/domain";

export const dynamic = "force-dynamic";

function greeting(name: string): string {
  const hour = new Date().getHours();
  const daypart = hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";
  return `Good ${daypart}, ${name}`;
}

function opportunityBand(row: OpportunityOverview) {
  if (row.status === "APPROVED") return "Approved for engagement";
  if (row.status === "READY") return "CIE-qualified for review";
  if (row.status === "NEEDS_CONTACT") return "Needs a reachable buyer";
  if (row.status === "NEEDS_EVIDENCE") return "Needs stronger evidence";
  return "Worth reviewing";
}

export default async function Home() {
  const user = await getCurrentUser();
  if (!user) return <PublicLanding />;

  let campaigns: CampaignSummary[] = [];
  let opportunities: OpportunityOverview[] = [];
  let storageReady = true;
  try {
    [campaigns, opportunities] = await Promise.all([listCampaigns(), listOpportunities()]);
  } catch (error) {
    console.error("Overview workspace unavailable", error);
    storageReady = false;
  }

  let companies = { total: 0, pending: 0, approved: 0 };
  try { companies = await companyCounts(); } catch (error) { console.error("Overview companies unavailable", error); }

  const recommended = opportunities.filter(row => row.status === "READY").length;
  const awaitingDecision = opportunities.filter(row => !["APPROVED", "REJECTED", "ENGAGED"].includes(row.status)).length;
  const approved = opportunities.filter(row => row.status === "APPROVED").length;
  const topOpportunities = opportunities.filter(row => row.status !== "REJECTED").slice(0, 4);
  const nextOpportunity = opportunities.find(row => !["APPROVED", "REJECTED", "ENGAGED"].includes(row.status));

  return <AppShell title="Overview" user={user} workspaceStats={{ campaigns: campaigns.length, companies: companies.total, replies: 0, opportunities: opportunities.length }}>
    <PageHeader
      eyebrow="Your growth workspace"
      title={greeting(user.name)}
      subtitle="MarketRoute turns research into evidence-backed commercial opportunities and clear next moves, so you can spend more time talking to customers."
      action={<ButtonLink href="/campaigns/new"><Plus size={16}/>New campaign</ButtonLink>}
    />
    <div className="grid cols-4">
      <Metric label="Opportunities" value={String(opportunities.length)} foot={storageReady ? `${awaitingDecision} awaiting a decision` : "Opportunity data is temporarily unavailable"}/>
      <Metric label="Recommended" value={String(recommended)} foot={recommended ? "Best opportunities first" : "Finding your strongest opportunities"}/>
      <Metric label="Approved for engagement" value={String(approved)} foot={approved ? "Ready for outreach planning" : "No approved opportunities yet"}/>
      <Metric label="Campaigns" value={String(campaigns.length)} foot={`${companies.total} companies researched`}/>
    </div>

    <div className="section hero">
      <div className="eyebrow" style={{ color: "#d8f6ff" }}>Your next best move</div>
      {nextOpportunity ? <>
        <h2>Review {nextOpportunity.company_name}</h2>
        <p>MarketRoute has qualified this commercial case for {nextOpportunity.campaign_name} through CIE. Review the commercial reality, authorised access route, evidence and recommended next action in one place.</p>
        <div style={{ marginTop: 18 }}><ButtonLink href={`/opportunities/${nextOpportunity.id}`}>Review opportunity <ArrowRight size={16}/></ButtonLink></div>
      </> : campaigns.length === 0 ? <>
        <h2>Create your first campaign</h2>
        <p>Start with your website. MarketRoute will understand the business and begin assembling your strongest commercial opportunities.</p>
        <div style={{ marginTop: 18 }}><ButtonLink href="/campaigns/new">Create campaign <ArrowRight size={16}/></ButtonLink></div>
      </> : <>
        <h2>Opportunities are assembling</h2>
        <p>{campaigns[0].name} is {presentCampaignStatus(campaigns[0].status).toLowerCase()}. MarketRoute is connecting company fit, commercial need and the strongest access route before asking for your decision.</p>
        <div style={{ marginTop: 18 }}><ButtonLink href={`/campaigns/${campaigns[0].id}`}>Open campaign <ArrowRight size={16}/></ButtonLink></div>
      </>}
    </div>

    <div className="grid cols-2 section">
      <Card>
        <div className="section-head"><div><div className="card-title">Best opportunities</div><div className="card-subtitle">The next commercial cases MarketRoute recommends reviewing.</div></div><ButtonLink href="/opportunities" secondary>View all</ButtonLink></div>
        {topOpportunities.length === 0 ? <div className="empty"><h3>No opportunities assembled yet</h3><p>MarketRoute will compose company evidence, commercial need and access routes here automatically.</p></div> : topOpportunities.map(row => <Link href={`/opportunities/${row.id}`} key={row.id} className="activity">
          <div className="dot"/><div style={{ flex: 1 }}><div className="name">{row.company_name}</div><div className="meta">{row.primary_contact_name ? `${row.primary_contact_name} · ${row.primary_contact_role ?? "Recommended route"}` : "Route research in progress"}</div><div className="meta">{opportunityBand(row)}</div></div><ArrowRight size={15}/>
        </Link>)}
      </Card>
      <Card>
        <div className="section-head"><div><div className="card-title">Why these opportunities rise to the top</div><div className="card-subtitle">Fit, need, evidence and a credible route in become one clear recommendation.</div></div><BriefcaseBusiness size={18}/></div>
        <div className="recommendation-reasons section">
          <div><Sparkles size={19}/><span>Is this organisation likely to need and buy the solution?</span></div>
          <div><Sparkles size={19}/><span>Is there a credible route to someone who can act?</span></div>
          <div><Sparkles size={19}/><span>Can MarketRoute reach them through a supported route?</span></div>
          <div><Sparkles size={19}/><span>Is the evidence strong enough to recommend engagement?</span></div>
        </div>
      </Card>
    </div>
  </AppShell>;
}
