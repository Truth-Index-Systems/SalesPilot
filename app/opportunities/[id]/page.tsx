import { notFound } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/shell";
import { Card, PageHeader } from "@/components/ui";
import { OpportunityReviewActions } from "@/components/opportunity-review-actions";
import { requirePageUser } from "@/lib/auth/page-user";
import { getOpportunity, listOpportunities } from "@/lib/opportunities/repository";
import { listCampaigns } from "@/lib/campaigns/repository";
import { Building2, CheckCircle2, ContactRound, ExternalLink, Mail, ShieldCheck, Target } from "@/components/icons";
import { buildAccessRoute, routeConfidenceClass } from "@/lib/opportunities/route-view";
import { formatDateTime } from "@/lib/date-time";

export const dynamic = "force-dynamic";

function statusLabel(status: string) {
  return ({ BUILDING: "Research in progress", READY: "Ready for review", NEEDS_CONTACT: "Route research needed", NEEDS_EVIDENCE: "Needs evidence", LOW_PRIORITY: "Low priority", APPROVED: "Approved", REJECTED: "Not selected", ENGAGED: "Engaged" } as Record<string, string>)[status] ?? status;
}

function componentLabel(key: string) {
  return ({ companyFit: "Company fit", operationalFit: "Operational fit", routeQuality: "Route quality", routeConfidence: "Route confidence", buyingAuthority: "Buying authority", contactability: "Route accessibility", routeAccessibility: "Route accessibility", evidenceQuality: "Evidence quality", commercialValue: "Commercial value", urgency: "Urgency" } as Record<string, string>)[key] ?? key;
}

export default async function OpportunityDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePageUser(`/opportunities/${id}`);
  const [opportunity, all, campaigns] = await Promise.all([getOpportunity(id), listOpportunities(), listCampaigns()]);
  if (!opportunity) notFound();
  const score = opportunity.opportunity_score ?? 0;
  const explanation = opportunity.score_explanation_json;
  const route = buildAccessRoute(opportunity);
  const limitations = explanation?.limitations ?? [];

  return <AppShell title={opportunity.company_name} user={user} workspaceStats={{ campaigns: campaigns.length, companies: new Set(all.map(row => row.company_id)).size, replies: 0, opportunities: all.length }}>
    <PageHeader eyebrow={`Opportunity #${opportunity.rank} · ${opportunity.campaign_name}`} title={opportunity.company_name} subtitle="One commercial recommendation combining the business match, the best access route, reachability and transparent evidence." action={<span className="badge green"><ShieldCheck size={14}/> {statusLabel(opportunity.status)}</span>} />

    <Card className="opportunity-detail-hero">
      <div>
        <span className="eyebrow">SalesPilot recommendation</span>
        <h2>{opportunity.buying_reason || "SalesPilot is still assembling the buying case."}</h2>
        <p>{opportunity.operational_pain || opportunity.company_summary || "No operational pain statement has been supported yet."}</p>
        <div className="opportunity-hero-actions"><a className="button secondary" href={opportunity.company_website_url} target="_blank" rel="noreferrer">Official company website <ExternalLink size={15}/></a>{route.linkedinUrl && <a className="button secondary" href={route.linkedinUrl || "#"} target="_blank" rel="noreferrer">Open LinkedIn route <ExternalLink size={15}/></a>}</div>
      </div>
      <div className="opportunity-score large"><strong>{score}</strong><span>Opportunity score</span><small>{score >= 80 ? "Strong opportunity" : score >= 55 ? "Worth reviewing" : "Lower priority · still visible"}</small></div>
    </Card>

    <div className="grid cols-2 section">
      <Card>
        <div className="card-title">The company</div><div className="card-subtitle">Why this organisation may realistically become a customer.</div>
        <div className="strategy-grid section"><div className="strategy-item"><Building2 size={18}/><div><span>Industry</span><strong>{opportunity.company_industry || "Not confirmed"}</strong></div></div><div className="strategy-item"><Target size={18}/><div><span>Company fit</span><strong>{opportunity.company_fit ?? 0}/100</strong></div></div><div className="strategy-item"><ShieldCheck size={18}/><div><span>Official evidence</span><strong>{opportunity.company_evidence_count} sources</strong></div></div><div className="strategy-item"><CheckCircle2 size={18}/><div><span>Commercial value</span><strong>{opportunity.commercial_value ?? 0}/100</strong></div></div></div>
        <p className="company-summary">{opportunity.company_summary}</p>
      </Card>
      <Card>
        <div className="card-title">Best access route</div><div className="card-subtitle">The strongest currently supported commercial route into this organisation.</div>
        {route.personName ? <div className="opportunity-person opportunity-route-detail section"><ContactRound size={24}/><div><strong>{route.personName}</strong><span>{route.role} · {route.typeLabel}</span><small>{route.recommendation}</small></div></div> : <div className="verified-empty section"><span>Research in progress. SalesPilot is analysing the strongest commercial route into this organisation.</span></div>}
        <div className="route-signal-grid section">
          <div><span>Route quality</span><strong className="route-stars" aria-label={`${route.quality} out of 5 stars`}>{route.qualityStars}</strong><small>{route.qualityLabel}</small></div>
          <div><span>Route confidence</span><strong className={`route-confidence ${routeConfidenceClass(route.confidence)}`}>{route.confidence}%</strong><small>{route.confidenceLabel}</small></div>
          <div><span>Recommended route</span><strong>{route.typeLabel}</strong><small>{route.confidenceSummary}</small></div>
        </div>
        <div className="route-strategy-callout section"><Target size={18}/><div><span>Recommended entry strategy</span><strong>{route.nextStep}</strong></div></div>
        <div className="contact-channel-strip section"><div className={route.email ? "contact-channel verified" : "contact-channel unknown"}><Mail size={14}/><div><span>Best email route</span><strong>{route.email || "Unknown"}</strong><small>{route.emailStatus || "Not found"}</small></div></div><div className={route.linkedinUrl ? "contact-channel verified" : "contact-channel unknown"}><ExternalLink size={14}/><div><span>LinkedIn route</span><strong>{route.linkedinUrl ? "Profile matched" : "Unknown"}</strong><small>{route.linkedinUrl ? "Public profile available" : "Not found"}</small></div></div></div>
      </Card>
    </div>

    <div className="grid cols-2 section">
      <Card>
        <div className="card-title">Opportunity score explained</div><div className="card-subtitle">Each component is independently visible. The final recommendation is not a black box.</div>
        <div className="fit-breakdown section">{Object.entries(explanation?.components ?? {}).map(([key, value]) => <div className="fit-row" key={key}><div><span>{componentLabel(key)}</span><strong>{Number(value)}/100</strong></div><div className="fit-track"><span style={{ width: `${Number(value)}%` }}/></div></div>)}</div>
      </Card>
      <Card>
        <div className="card-title">Workspace decision</div><div className="card-subtitle">Approve the complete opportunity, including the recommended access route.</div>
        <div className="strategy-grid section"><div className="strategy-item"><Target size={18}/><div><span>Recommended action</span><strong>{opportunity.recommended_action || "Continue evidence-led review"}</strong></div></div><div className="strategy-item"><ShieldCheck size={18}/><div><span>Current state</span><strong>{statusLabel(opportunity.status)}</strong></div></div></div>
        <OpportunityReviewActions id={opportunity.id} campaignId={opportunity.campaign_id} status={opportunity.status} note={opportunity.review_note}/>
      </Card>
    </div>

    {limitations.length > 0 && <Card className="section"><div className="card-title">What still needs human judgement</div><div className="card-subtitle">SalesPilot keeps uncertainty visible instead of hiding the opportunity.</div><div className="uncertainty-box"><ShieldCheck size={18}/><div>{limitations.map(item => <p key={item}>{item}</p>)}</div></div></Card>}

    <Card className="section">
      <div className="section-head"><div><div className="card-title">Opportunity evidence</div><div className="card-subtitle">Company and route evidence are brought together while remaining linked to their original sources.</div></div><span className="badge green">{Number(opportunity.company_evidence_count) + Number(opportunity.contact_evidence_count)} sources</span></div>
      <div className="opportunity-evidence-columns section"><div><h3>Company evidence</h3><div className="evidence-list">{opportunity.company_evidence.map((evidence: any) => <div className="evidence-item" key={evidence.id}><div><strong>{evidence.claim}</strong>{evidence.excerpt && <p>“{evidence.excerpt}”</p>}<span>{evidence.sourceTitle || evidence.sourceDomain || "Official company source"}</span></div><a href={evidence.sourceUrl} target="_blank" rel="noreferrer"><ExternalLink size={16}/></a></div>)}</div></div><div><h3>Route evidence</h3><div className="evidence-list">{opportunity.contact_evidence.length ? opportunity.contact_evidence.map((evidence: any) => <div className="evidence-item" key={evidence.id}><div><strong>{evidence.claim}</strong>{evidence.excerpt && <p>“{evidence.excerpt}”</p>}<span>{evidence.sourceTitle || evidence.sourceKind || "Official route source"}</span></div><a href={evidence.sourceUrl} target="_blank" rel="noreferrer"><ExternalLink size={16}/></a></div>) : <div className="verified-empty"><span>No route evidence has been persisted yet.</span></div>}</div></div></div>
    </Card>

    <Card className="section"><div className="card-title">Opportunity history</div><div className="card-subtitle">Creation, scoring, ranking and workspace decisions remain auditable.</div>{opportunity.history.length ? <div className="review-history section">{opportunity.history.map((event: any) => <div className="review-history-item" key={event.id}><div><strong>{String(event.eventType).replaceAll("_", " ").toLowerCase()}</strong><span>{event.metadata?.note || `${event.previousStatus || "New"} → ${event.nextStatus || opportunity.status}`}</span></div><time>{formatDateTime(event.occurredAt)}</time></div>)}</div> : <div className="verified-empty section"><span>No opportunity history has been recorded yet.</span></div>}</Card>

    <div className="section"><Link className="button secondary" href="/opportunities">← Back to opportunities</Link></div>
  </AppShell>;
}
