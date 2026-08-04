import { AppShell } from "@/components/shell";
import { ButtonLink, Card, Metric, PageHeader } from "@/components/ui";
import { ArrowRight, Plus, Sparkles } from "@/components/icons";
import { listCampaigns } from "@/lib/campaigns/repository";
import { presentCampaignStatus } from "@/lib/campaigns/presenter";
import type { CampaignSummary } from "@/lib/campaigns/schemas";

export const dynamic = "force-dynamic";

export default async function Home() {
  let campaigns: CampaignSummary[] = [];
  let storageReady = true;
  try { campaigns = await listCampaigns(); } catch (error) { console.error("Overview campaigns unavailable", error); storageReady = false; }
  const preparing = campaigns.filter(c => c.status === "PREPARING").length;

  return <AppShell title="Overview">
    <PageHeader eyebrow="Your sales workspace" title="Good evening, Jaspal" subtitle="SalesPilot shows only real progress. Results will appear here as each campaign stage is connected." action={<ButtonLink href="/campaigns/new"><Plus size={16}/>New campaign</ButtonLink>}/>
    <div className="grid cols-4">
      <Metric label="Campaigns created" value={String(campaigns.length)} foot={storageReady ? "Saved strategies" : "Campaign storage not connected"}/>
      <Metric label="Preparing" value={String(preparing)} foot="Waiting for company discovery"/>
      <Metric label="Companies found" value="—" foot="Company discovery not started"/>
      <Metric label="Pipeline" value="—" foot="Appears after real opportunities"/>
    </div>
    <div className="section hero">
      <div className="eyebrow" style={{color:"#d8f6ff"}}>Recommended next action</div>
      {campaigns.length === 0 ? <><h2>Create your first campaign</h2><p>Start with your website. SalesPilot will understand the business and propose the strongest first strategy.</p><div style={{marginTop:18}}><ButtonLink href="/campaigns/new">Create campaign <ArrowRight size={16}/></ButtonLink></div></>
      : <><h2>Review your newest campaign</h2><p>{campaigns[0].name} is saved and {presentCampaignStatus(campaigns[0].status).toLowerCase()}. Company discovery is the next build stage.</p><div style={{marginTop:18}}><ButtonLink href={`/campaigns/${campaigns[0].id}`}>Open campaign <ArrowRight size={16}/></ButtonLink></div></>}
    </div>
    <div className="grid cols-2 section">
      <Card><div className="section-head"><div><div className="card-title">Campaigns</div><div className="card-subtitle">Real saved strategies only</div></div><ButtonLink href="/campaigns" secondary>View all</ButtonLink></div>
        {campaigns.length === 0 ? <div className="empty"><h3>No campaigns yet</h3><p>Your approved campaigns will appear here.</p></div> : campaigns.slice(0,3).map(c => <div key={c.id} className="activity"><div className="dot"/><div style={{flex:1}}><div className="name">{c.name}</div><div className="meta">{presentCampaignStatus(c.status)} · Fit {c.fitScore}/100</div></div><ButtonLink href={`/campaigns/${c.id}`} secondary><ArrowRight size={15}/></ButtonLink></div>)}
      </Card>
      <Card><div className="section-head"><div><div className="card-title">What has happened</div><div className="card-subtitle">No invented activity</div></div><Sparkles size={18}/></div>
        <div className="empty"><h3>Campaign timelines are ready</h3><p>Customer-facing progress appears after you launch a campaign. Routine system details remain hidden.</p></div>
      </Card>
    </div>
  </AppShell>;
}
