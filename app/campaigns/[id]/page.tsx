import { notFound } from "next/navigation";
import { AppShell } from "@/components/shell";
import { Card, PageHeader } from "@/components/ui";
import { CheckCircle2, Circle } from "@/components/icons";
import { getCampaign } from "@/lib/campaigns/repository";
import { presentCampaignDetail } from "@/lib/campaigns/presenter";
import { requirePageUser } from "@/lib/auth/page-user";

export const dynamic = "force-dynamic";

export default async function CampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePageUser(`/campaigns/${id}`);
  let record;
  try { record = await getCampaign(id); } catch (error) { console.error("Campaign detail unavailable", error); }
  if (!record) notFound();
  const campaign = presentCampaignDetail(record);

  return <AppShell title={campaign.name} user={user}>
    <PageHeader eyebrow={`${campaign.statusLabel} · ${campaign.modeLabel}`} title={campaign.name} subtitle="Your approved strategy, real progress and next stage in one place." action={<span className="badge green">{campaign.matchLabel} · {campaign.fitScore}/100</span>}/>

    <div className="hero">
      <div className="eyebrow" style={{ color: "#d8f6ff" }}>Current progress</div>
      <h2>{campaign.statusLabel}</h2>
      <p>SalesPilot has saved the approved business profile and strategy. Company discovery has not started yet.</p>
      <div className="campaign-progress section">
        <div><CheckCircle2 size={18}/><span>Business understood</span></div>
        <div><CheckCircle2 size={18}/><span>Strategy selected</span></div>
        <div><CheckCircle2 size={18}/><span>Campaign created</span></div>
        <div className="pending"><Circle size={18}/><span>Preparing company discovery</span></div>
      </div>
    </div>

    <div className="grid cols-2 section">
      <Card><div className="card-title">Campaign strategy</div><div className="card-subtitle">Version 1 · approved when the campaign was launched.</div>
        <div className="strategy-row section"><div className="label">Objective</div><div className="value">{campaign.objective}</div></div>
        <div className="strategy-row"><div className="label">Audience</div><div className="value">{campaign.audience}</div></div>
        <div className="strategy-row"><div className="label">Buyers</div><div className="value">{campaign.buyerRoles.join(" · ")}</div></div>
        <div className="strategy-row"><div className="label">Recommended message</div><div className="value">{campaign.messageAngle}</div></div>
      </Card>
      <Card><div className="card-title">What happens next</div><div className="card-subtitle">The next build will connect this approved strategy to company discovery.</div>
        <div className="recommendation section"><h3>Find matching companies</h3><p>SalesPilot will next search for companies that match the approved audience, explain why each one fits and hold uncertain results for review.</p></div>
        <div className="section"><span className="badge">Not started yet</span></div>
      </Card>
    </div>

    <div className="grid cols-2 section">
      <Card><div className="card-title">Why this campaign</div>{campaign.why.map((reason, index) => <div className="activity" key={`${index}-${reason}`}><div className="dot"/><div><div className="name">Reason {index + 1}</div><div className="meta">{reason}</div></div></div>)}</Card>
      <Card><div className="card-title">Campaign timeline</div><div className="card-subtitle">Only useful customer-facing progress is shown.</div>{campaign.timeline.map(entry => <div className="activity" key={entry.id}><div className="dot"/><div><div className="name">{entry.title}</div>{entry.description && <div className="meta">{entry.description}</div>}<div className="activity-time">{new Date(entry.occurredAt).toLocaleString("en-GB")}</div></div></div>)}</Card>
    </div>
  </AppShell>;
}
