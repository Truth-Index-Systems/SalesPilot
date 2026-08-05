import { AppShell } from "@/components/shell";
import { ButtonLink, PageHeader } from "@/components/ui";
import { ArrowRight, Plus } from "@/components/icons";
import { listCampaigns } from "@/lib/campaigns/repository";
import { presentAutomationMode, presentCampaignStatus } from "@/lib/campaigns/presenter";
import type { CampaignSummary } from "@/lib/campaigns/schemas";
import { requirePageUser } from "@/lib/auth/page-user";

export const dynamic = "force-dynamic";

export default async function Campaigns() {
  const user = await requirePageUser("/campaigns");
  let campaigns: CampaignSummary[] = [];
  let unavailable = false;
  try { campaigns = await listCampaigns(); } catch (error) { console.error("Campaign list unavailable", error); unavailable = true; }

  return <AppShell title="Campaigns" user={user} workspaceStats={{ campaigns: campaigns.length, companies: 0, replies: 0, opportunities: 0 }}>
    <PageHeader eyebrow="Your growth plans" title="Campaigns" subtitle="Choose the outcome and approve the strategy. SalesPilot handles the ongoing work and brings back results and decisions." action={<ButtonLink href="/campaigns/new"><Plus size={16}/>New campaign</ButtonLink>}/>
    {unavailable ? <div className="card empty"><h3>Campaigns are temporarily unavailable</h3><p>SalesPilot could not load your saved campaigns just now. Please refresh the page or try again shortly.</p><ButtonLink href="/campaigns/new">Return to campaign setup</ButtonLink></div>
      : campaigns.length === 0 ? <div className="card empty"><h3>Your first campaign starts with your website</h3><p>SalesPilot will understand your business, propose the strongest strategy and save the campaign here once you approve it.</p><ButtonLink href="/campaigns/new"><Plus size={16}/>Create campaign</ButtonLink></div>
      : <div className="card list">{campaigns.map(c => <div className="list-row" key={c.id}>
          <div><div className="name">{c.name}</div><div className="meta"><span className="badge green">{presentCampaignStatus(c.status)}</span> · {presentAutomationMode(c.automationMode)}</div></div>
          <div><div className="label">Audience</div><div className="value compact-value">{c.audience}</div></div>
          <div><div className="label">Match</div><div className="value">{c.fitScore}/100</div></div>
          <div><div className="label">Latest progress</div><div className="value compact-value">{c.latestProgress ?? "Campaign created"}</div></div>
          <ButtonLink href={`/campaigns/${c.id}`} secondary><ArrowRight size={15}/></ButtonLink>
        </div>)}</div>}
  </AppShell>;
}
