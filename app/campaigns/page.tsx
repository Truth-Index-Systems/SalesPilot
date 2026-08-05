import { AppShell } from "@/components/shell";
import { ButtonLink, PageHeader } from "@/components/ui";
import { ArrowRight, Plus } from "@/components/icons";
import { listCampaigns } from "@/lib/campaigns/repository";
import { presentAutomationMode, presentCampaignStatus } from "@/lib/campaigns/presenter";
import type { CampaignSummary } from "@/lib/campaigns/schemas";
import { requirePageUser } from "@/lib/auth/page-user";
import { listOpportunities } from "@/lib/opportunities/repository";
import type { OpportunityOverview } from "@/lib/opportunities/domain";

export const dynamic = "force-dynamic";

export default async function Campaigns() {
  const user = await requirePageUser("/campaigns");
  let campaigns: CampaignSummary[] = [];
  let opportunities: OpportunityOverview[] = [];
  let unavailable = false;
  try { [campaigns, opportunities] = await Promise.all([listCampaigns(), listOpportunities()]); } catch (error) { console.error("Campaign list unavailable", error); unavailable = true; }

  const opportunitiesByCampaign = new Map<string, OpportunityOverview[]>();
  opportunities.forEach(row => opportunitiesByCampaign.set(row.campaign_id, [...(opportunitiesByCampaign.get(row.campaign_id) ?? []), row]));
  const companyCount = new Set(opportunities.map(row => row.company_id)).size;

  return <AppShell title="Campaigns" user={user} workspaceStats={{ campaigns: campaigns.length, companies: companyCount, replies: 0, opportunities: opportunities.length }}>
    <PageHeader eyebrow="Opportunity strategies" title="Campaigns" subtitle="Each campaign gives SalesPilot a commercial objective. The engine turns that strategy into ranked opportunities rather than disconnected company and contact lists." action={<ButtonLink href="/campaigns/new"><Plus size={16}/>New campaign</ButtonLink>}/>
    {unavailable ? <div className="card empty"><h3>Campaigns are temporarily unavailable</h3><p>SalesPilot could not load your saved campaigns just now. Please refresh the page or try again shortly.</p><ButtonLink href="/campaigns/new">Return to campaign setup</ButtonLink></div>
      : campaigns.length === 0 ? <div className="card empty"><h3>Your first campaign starts with your website</h3><p>SalesPilot will understand your business, propose the strongest strategy and begin assembling commercial opportunities once you approve it.</p><ButtonLink href="/campaigns/new"><Plus size={16}/>Create campaign</ButtonLink></div>
      : <div className="card list">{campaigns.map(c => {
          const rows = opportunitiesByCampaign.get(c.id) ?? [];
          const awaiting = rows.filter(row => !["APPROVED", "REJECTED", "ENGAGED"].includes(row.status)).length;
          const recommended = rows.filter(row => (row.opportunity_score ?? 0) >= 80 && !["APPROVED", "REJECTED", "ENGAGED"].includes(row.status)).length;
          return <div className="list-row" key={c.id}>
            <div><div className="name">{c.name}</div><div className="meta"><span className="badge green">{presentCampaignStatus(c.status)}</span> · {presentAutomationMode(c.automationMode)}</div></div>
            <div><div className="label">Audience</div><div className="value compact-value">{c.audience}</div></div>
            <div><div className="label">Opportunities</div><div className="value">{rows.length}</div><div className="meta">{recommended} recommended</div></div>
            <div><div className="label">Next decision</div><div className="value compact-value">{awaiting ? `${awaiting} awaiting review` : rows.length ? "Opportunity review complete" : c.latestProgress ?? "Intelligence assembling"}</div></div>
            <ButtonLink href={`/campaigns/${c.id}`} secondary><ArrowRight size={15}/></ButtonLink>
          </div>;
        })}</div>}
  </AppShell>;
}
