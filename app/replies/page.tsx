import Link from "next/link";
import { AppShell } from "@/components/shell";
import { Card, Metric, PageHeader } from "@/components/ui";
import { requirePageUser } from "@/lib/auth/page-user";
import { listEngagements } from "@/lib/engagement/repository";
import { CheckCircle2, ContactRound, ExternalLink, MessageSquareReply, ShieldCheck } from "@/components/icons";

export const dynamic = "force-dynamic";

function stateLabel(status: string) {
  if (status === "READY_FOR_DRAFT") return "Ready for outreach draft";
  if (status === "NEEDS_ROUTE") return "Needs a reachable route";
  if (status === "DRAFT_REVIEW") return "Draft awaiting review";
  if (status === "APPROVED_TO_SEND") return "Approved to send";
  if (status === "QUEUED_FOR_SEND") return "Queued for send";
  if (status === "SENT") return "Sent";
  if (status === "PAUSED") return "Paused";
  return "Cancelled";
}

export default async function EngagementPage() {
  const user = await requirePageUser("/replies");
  const rows = await listEngagements();
  const ready = rows.filter(row => row.status === "READY_FOR_DRAFT").length;
  const needsRoute = rows.filter(row => row.status === "NEEDS_ROUTE").length;
  const queued = rows.filter(row => ["DRAFT_REVIEW", "APPROVED_TO_SEND", "QUEUED_FOR_SEND"].includes(row.status)).length;
  const sent = rows.filter(row => row.status === "SENT").length;

  return <AppShell title="Engagement" user={user}>
    <PageHeader eyebrow="Opportunity engagement" title="Approved opportunities, ready for the next move" subtitle="SalesPilot converts an approved opportunity into one engagement record with the strongest buyer, best supported route, campaign policy and full audit trail. G4 Phase 1 now provides the production engagement domain, history and versioning foundation. No outreach is generated or sent yet." />

    <div className="grid cols-4">
      <Metric label="Ready for draft" value={String(ready)} foot="Reachable opportunities prepared" tone={ready ? "positive" : undefined}/>
      <Metric label="Needs a route" value={String(needsRoute)} foot="Opportunity remains visible"/>
      <Metric label="In engagement flow" value={String(queued)} foot="Draft, approval or send queue"/>
      <Metric label="Sent" value={String(sent)} foot="Reserved for later G4 phases"/>
    </div>

    <Card className="opportunity-review-flow section">
      <div><CheckCircle2 size={18}/><span>Opportunity approved</span></div><i>→</i>
      <div className="active"><ContactRound size={18}/><span>Route selected</span></div><i>→</i>
      <div><MessageSquareReply size={18}/><span>Personalised outreach</span></div><i>→</i>
      <div><ShieldCheck size={18}/><span>Reply intelligence</span></div>
    </Card>

    {rows.length ? <div className="grid section">{rows.map(row => <Card key={row.id}>
      <div className="section-head">
        <div>
          <div className="name">#{row.source_opportunity_rank} · {row.company_name}</div>
          <div className="meta">{row.recipient_name ? `${row.recipient_name} · ${row.recipient_role ?? "Buying contact"}` : "Buyer route still assembling"}</div>
        </div>
        <span className={`badge ${row.status === "READY_FOR_DRAFT" ? "green" : ""}`}>{stateLabel(row.status)}</span>
      </div>
      <div className="grid cols-2 section">
        <div className="detail-list">
          <div><span>Opportunity score</span><strong>{row.opportunity_score ?? 0}/100</strong></div>
          <div><span>Channel</span><strong>{row.channel_type === "EMAIL" ? row.recipient_email : row.channel_type === "LINKEDIN" ? "LinkedIn" : "Unknown"}</strong></div>
          <div><span>Outreach policy</span><strong>{row.outreach_policy.replaceAll("_", " ")}</strong></div>
          <div><span>Reply policy</span><strong>{row.reply_policy.replaceAll("_", " ")}</strong></div>
        </div>
        <div className="recommendation">
          <h3>Why this engagement is prepared</h3>
          <p>{row.buying_reason ?? "SalesPilot has approved commercial intelligence and is waiting for the strongest supported route."}</p>
        </div>
      </div>
      <div className="company-review-actions">
        <Link href={`/opportunities/${row.opportunity_id}`} className="button secondary">Open opportunity</Link>
        {row.route_source_url && <a href={row.route_source_url} target="_blank" rel="noreferrer" className="button text">Route evidence <ExternalLink size={14}/></a>}
      </div>
    </Card>)}</div> : <Card className="section"><div className="empty"><h3>No approved opportunities have entered Engagement yet</h3><p>Approve an opportunity and the scheduler will prepare its strongest supported route automatically. No email is sent during G3.5. No outreach is generated or sent during G4 Phase 1.</p><Link href="/opportunities" className="button primary">Review opportunities</Link></div></Card>}
  </AppShell>;
}
