import { AppShell } from "@/components/shell";
import { PublicLanding } from "@/components/public-landing";
import { ButtonLink, Card, Metric, PageHeader } from "@/components/ui";
import { ArrowRight, Plus, Sparkles } from "@/components/icons";
import { listCampaigns } from "@/lib/campaigns/repository";
import { presentCampaignStatus } from "@/lib/campaigns/presenter";
import { getCurrentUser } from "@/lib/auth/current-user";
import type { CampaignSummary } from "@/lib/campaigns/schemas";
import { companyCounts } from "@/lib/discovery/repository";

export const dynamic = "force-dynamic";

function greeting(name: string): string {
  const hour = new Date().getHours();
  const daypart = hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";
  return `Good ${daypart}, ${name}`;
}

export default async function Home() {
  const user = await getCurrentUser();
  if (!user) return <PublicLanding />;

  let campaigns: CampaignSummary[] = [];
  let storageReady = true;
  try {
    campaigns = await listCampaigns();
  } catch (error) {
    console.error("Overview campaigns unavailable", error);
    storageReady = false;
  }

  const preparing = campaigns.filter(campaign => campaign.status === "PREPARING").length;
  let companies = { total: 0, pending: 0, approved: 0 };
  try { companies = await companyCounts(); } catch (error) { console.error("Overview companies unavailable", error); }

  return <AppShell title="Overview" user={user} workspaceStats={{ campaigns: campaigns.length, companies: companies.total, replies: 0, opportunities: 0 }}>
    <PageHeader
      eyebrow="Your sales workspace"
      title={greeting(user.name)}
      subtitle="SalesPilot shows only real progress. Results will appear here as each campaign stage is connected."
      action={<ButtonLink href="/campaigns/new"><Plus size={16}/>New campaign</ButtonLink>}
    />
    <div className="grid cols-4">
      <Metric label="Campaigns" value={String(campaigns.length)} foot={storageReady ? (campaigns.length === 1 ? "1 saved outbound sales campaign" : `${campaigns.length} saved outbound sales campaigns`) : "Campaigns are temporarily unavailable"}/>
      <Metric label="Ready for discovery" value={String(preparing)} foot={preparing ? "Approved campaigns awaiting the next stage" : "No campaigns waiting"}/>
      <Metric label="Companies" value={String(companies.total)} foot={companies.pending ? `${companies.pending} awaiting review` : companies.total ? `${companies.approved} approved` : "Discovery will begin automatically"}/>
      <Metric label="Pipeline" value="—" foot="Builds from real opportunities"/>
    </div>
    <div className="section hero">
      <div className="eyebrow" style={{ color: "#d8f6ff" }}>Recommended next action</div>
      {campaigns.length === 0 ? <>
        <h2>Create your first campaign</h2>
        <p>Start with your website. SalesPilot will understand the business and propose the strongest first strategy.</p>
        <div style={{ marginTop: 18 }}><ButtonLink href="/campaigns/new">Create campaign <ArrowRight size={16}/></ButtonLink></div>
      </> : <>
        <h2>Review your newest campaign</h2>
        <p>{campaigns[0].name} is saved and {presentCampaignStatus(campaigns[0].status).toLowerCase()}. Company discovery is the next milestone.</p>
        <div style={{ marginTop: 18 }}><ButtonLink href={`/campaigns/${campaigns[0].id}`}>Open campaign <ArrowRight size={16}/></ButtonLink></div>
      </>}
    </div>
    <div className="grid cols-2 section">
      <Card>
        <div className="section-head"><div><div className="card-title">Campaigns</div><div className="card-subtitle">Real saved strategies only</div></div><ButtonLink href="/campaigns" secondary>View all</ButtonLink></div>
        {campaigns.length === 0 ? <div className="empty"><h3>No campaigns yet</h3><p>Your approved campaigns will appear here.</p></div> : campaigns.slice(0, 3).map(campaign => <div key={campaign.id} className="activity"><div className="dot"/><div style={{ flex: 1 }}><div className="name">{campaign.name}</div><div className="meta">{presentCampaignStatus(campaign.status)} · Fit {campaign.fitScore}/100</div></div><ButtonLink href={`/campaigns/${campaign.id}`} secondary><ArrowRight size={15}/></ButtonLink></div>)}
      </Card>
      <Card>
        <div className="section-head"><div><div className="card-title">What has happened</div><div className="card-subtitle">No invented activity</div></div><Sparkles size={18}/></div>
        <div className="empty"><h3>Campaign timelines are ready</h3><p>Customer-facing progress appears after you launch a campaign. Routine system details remain hidden.</p></div>
      </Card>
    </div>
  </AppShell>;
}
