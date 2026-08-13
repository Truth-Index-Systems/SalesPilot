import { notFound } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/shell";
import { Card, PageHeader } from "@/components/ui";
import { OpportunityReviewActions } from "@/components/opportunity-review-actions";
import { requirePageUser } from "@/lib/auth/page-user";
import { getOpportunity, listOpportunities } from "@/lib/opportunities/repository";
import { listCampaigns } from "@/lib/campaigns/repository";
import { Building2, CheckCircle2, ContactRound, ExternalLink, Mail, ShieldCheck, Target } from "@/components/icons";
import { buildAccessRoute } from "@/lib/opportunities/route-view";
import { isOpportunityAuthorityReady, presentOpportunityAuthorityState } from "@/lib/opportunities/authority-view";
import { formatDateTime } from "@/lib/date-time";
import { getG5ApprovalStrategyForOpportunity, getG5StrategyStatusForOpportunity } from "@/lib/engagement/g5-assisted-approval";
import { G5AssistedApprovalActions } from "@/components/g5-assisted-approval-actions";
import { getG5LiveTimelineForOpportunity } from "@/lib/engagement/g5-live-timeline";
import { G5EngagementTimeline } from "@/components/g5-engagement-timeline";

export const dynamic = "force-dynamic";

function shortFingerprint(value: string | null | undefined) { return value ? `${value.slice(0, 10)}…${value.slice(-6)}` : "—"; }

function statusLabel(status: string) {
  return ({ BUILDING: "Research in progress", READY: "Ready for review", NEEDS_CONTACT: "Route research needed", NEEDS_EVIDENCE: "Needs evidence", LOW_PRIORITY: "Low priority", APPROVED: "Approved", REJECTED: "Not selected", ENGAGED: "Engaged" } as Record<string, string>)[status] ?? status;
}

export default async function OpportunityDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePageUser(`/opportunities/${id}`);
  const [opportunity, all, campaigns, engagementStrategy, engagementStatus, engagementTimeline] = await Promise.all([getOpportunity(id), listOpportunities(), listCampaigns(), getG5ApprovalStrategyForOpportunity(id), getG5StrategyStatusForOpportunity(id), getG5LiveTimelineForOpportunity(id)]);
  if (!opportunity) notFound();
  const route = buildAccessRoute(opportunity);
  const authorityReady = isOpportunityAuthorityReady(opportunity);
  const authorityLabel = presentOpportunityAuthorityState(opportunity.authority_state);
  const authorityHistory = Array.isArray(opportunity.authority_history) ? opportunity.authority_history : [];
  const limitations: string[] = [];
  const companyEvidence = Array.isArray(opportunity.company_evidence) ? opportunity.company_evidence : [];
  const contactEvidence = Array.isArray(opportunity.contact_evidence) ? opportunity.contact_evidence : [];
  const commercialRoutes = Array.isArray(opportunity.commercial_routes) ? opportunity.commercial_routes : [];
  const commercialRouteEvidence = Array.isArray(opportunity.commercial_route_evidence) ? opportunity.commercial_route_evidence : [];
  const organisationMap = opportunity.organisation_map && typeof opportunity.organisation_map === "object" ? opportunity.organisation_map as any : {};
  const buyingPaths = Array.isArray(opportunity.buying_paths) ? opportunity.buying_paths : [];
  const history = Array.isArray(opportunity.history) ? opportunity.history : [];
  const engagementReasoning = engagementStrategy?.commercial_reasoning_json;
  const channelStrategy = engagementStrategy?.channel_strategy_json;
  const outreach = engagementStrategy?.outreach_generation_json;
  const engagementQuality = engagementStrategy?.engagement_quality_json;
  const outreachBody = outreach?.channel === "EMAIL" ? outreach.content.emailBody
    : outreach?.channel === "LINKEDIN" ? (outreach.content.linkedinMessage || outreach.content.linkedinConnectionNote)
    : outreach?.channel === "SWITCHBOARD" ? outreach.content.switchboardOpening
    : outreach?.channel === "REFERRAL" ? outreach.content.referralRequest : null;
  const selectedCommercialRoute = channelStrategy?.primary?.routeId ? commercialRoutes.find((item: any) => item.id === channelStrategy.primary.routeId) as Record<string, unknown> | undefined : null;
  const selectedCommercialRouteLabel = typeof selectedCommercialRoute?.label === "string" && selectedCommercialRoute.label.trim()
    ? selectedCommercialRoute.label
    : typeof selectedCommercialRoute?.targetRole === "string" && selectedCommercialRoute.targetRole.trim()
      ? selectedCommercialRoute.targetRole
      : channelStrategy?.primary?.selectionReason || "Selected commercial route";
  const selectedCommercialRouteChannelType = typeof selectedCommercialRoute?.channelType === "string" ? selectedCommercialRoute.channelType : null;
  const selectedCommercialRouteChannelValue = typeof selectedCommercialRoute?.channelValue === "string" && selectedCommercialRoute.channelValue.trim()
    ? selectedCommercialRoute.channelValue.trim()
    : null;
  const selectedCommercialRouteDisplay = selectedCommercialRouteChannelType === "SWITCHBOARD" && selectedCommercialRouteChannelValue
    ? `${selectedCommercialRouteLabel} · ${selectedCommercialRouteChannelValue}`
    : selectedCommercialRouteLabel;

  return <AppShell title={opportunity.company_name} user={user} workspaceStats={{ campaigns: campaigns.length, companies: new Set(all.map(row => row.company_id)).size, replies: 0, opportunities: all.length }}>
    <PageHeader eyebrow={`Commercial opportunity · ${opportunity.campaign_name}`} title={opportunity.company_name} subtitle="One evidence-backed commercial case combining Commercial Reality, the authorised access route, reachability and transparent evidence." action={<span className={`badge ${authorityReady ? "green" : ""}`}><ShieldCheck size={14}/> {authorityLabel}</span>} />

    <Card className="opportunity-detail-hero">
      <div>
        <span className="eyebrow">CIE commercial case</span>
        <h2>{opportunity.buying_reason || "MarketRoute is still assembling the buying case."}</h2>
        <p>{opportunity.operational_pain || opportunity.company_summary || "No operational pain statement has been supported yet."}</p>
        <div className="opportunity-hero-actions"><a className="button secondary" href={opportunity.company_website_url} target="_blank" rel="noreferrer">Official company website <ExternalLink size={15}/></a>{route.linkedinUrl && <a className="button secondary" href={route.linkedinUrl || "#"} target="_blank" rel="noreferrer">Open LinkedIn route <ExternalLink size={15}/></a>}</div>
      </div>
      <div className="opportunity-score large"><strong>{authorityReady ? "✓" : "…"}</strong><span>CIE authority state</span><small>{authorityLabel}</small></div>
    </Card>

    <div className="grid cols-2 section">
      <Card>
        <div className="card-title">The company</div><div className="card-subtitle">Why this organisation may realistically become a customer.</div>
        <div className="strategy-grid section"><div className="strategy-item"><Building2 size={18}/><div><span>Industry</span><strong>{opportunity.company_industry || "Not confirmed"}</strong></div></div><div className="strategy-item"><Target size={18}/><div><span>Commercial state</span><strong>{opportunity.r4_reality_state || authorityLabel}</strong></div></div><div className="strategy-item"><ShieldCheck size={18}/><div><span>Official evidence</span><strong>{opportunity.company_evidence_count} sources</strong></div></div><div className="strategy-item"><CheckCircle2 size={18}/><div><span>Route authority</span><strong>{route.authorityState}</strong></div></div></div>
        <p className="company-summary">{opportunity.company_summary}</p>
      </Card>
      <Card>
        <div className="card-title">Authorised commercial route</div><div className="card-subtitle">The current CIE-authorised execution path into the relevant buying centre. Pareto-equivalent alternatives remain alternatives rather than being collapsed into a hidden score.</div>
        {(route.personName || opportunity.commercial_route_label) ? <div className="opportunity-person opportunity-route-detail section"><ContactRound size={24}/><div><strong>{route.personName || opportunity.commercial_route_label}</strong><span>{route.role} · {route.typeLabel}</span><small>{route.recommendation}</small></div></div> : <div className="verified-empty section"><span>Research in progress. MarketRoute is resolving an authorised commercial route into this organisation.</span></div>}
        <div className="route-signal-grid section">
          <div><span>Route authority</span><strong>{route.authorityState}</strong><small>{opportunity.r5_current ? "Current CIE-R5 relationship path" : "Route authority unresolved or stale"}</small></div>
          <div><span>Route evidence</span><strong>{route.evidenceState === "EVIDENCE_LINKED" ? "Linked" : "Incomplete"}</strong><small>{route.evidenceSummary}</small></div>
          <div><span>Execution channel</span><strong>{route.typeLabel}</strong><small>No weighted route score is used.</small></div>
        </div>
        <div className="route-strategy-callout section"><Target size={18}/><div><span>Authorised next step</span><strong>{route.nextStep}</strong></div></div>
        <div className="contact-channel-strip section"><div className={route.email ? "contact-channel verified" : "contact-channel unknown"}><Mail size={14}/><div><span>Best email route</span><strong>{route.email || "Unknown"}</strong><small>{route.emailStatus || "Not found"}</small></div></div><div className={route.linkedinUrl ? "contact-channel verified" : "contact-channel unknown"}><ExternalLink size={14}/><div><span>LinkedIn route</span><strong>{route.linkedinUrl ? "Profile matched" : "Unknown"}</strong><small>{route.linkedinUrl ? "Public profile available" : "Not found"}</small></div></div>{route.phone && <div className="contact-channel verified"><ContactRound size={14}/><div><span>Switchboard / phone</span><strong>{route.phone}</strong><small>Verified route number</small></div></div>}</div>
      </Card>
    </div>

    {(commercialRoutes.length > 0 || buyingPaths.length > 0) && <div className="grid cols-2 section">
      <Card>
        <div className="card-title">Organisation & buying path</div><div className="card-subtitle">Route Intelligence uses the existing Company Discovery truth to map only the ownership structure needed to get in.</div>
        {organisationMap.summary && <p className="company-summary section">{String(organisationMap.summary)}</p>}
        {buyingPaths.length ? <div className="review-history section">{buyingPaths.slice(0,4).map((path:any,index:number)=><div className="review-history-item" key={`${path.name || "path"}-${index}`}><div><strong>{path.name || `Buying path ${index+1}`}</strong><span>{Array.isArray(path.steps)?path.steps.join(" → "):""}</span></div><span className="badge">{Number(path.confidence || 0)}%</span></div>)}</div> : <div className="verified-empty section"><span>Buying-path mapping is still in progress.</span></div>}
      </Card>
      <Card>
        <div className="section-head"><div><div className="card-title">Alternative commercial routes</div><div className="card-subtitle">Independent fallback paths protect the opportunity when one contact or channel fails.</div></div><span className="badge green">{commercialRoutes.filter((item:any)=>item.authorityState === "OPEN").length} OPEN</span></div>
        {commercialRoutes.length ? <div className="review-history section">{commercialRoutes.slice(0,6).map((item:any)=>{const routeChannel=String(item.channelType || "UNKNOWN");const routeValue=typeof item.channelValue === "string" && item.channelValue.trim() ? item.channelValue.trim() : null;return <div className="review-history-item" key={item.id}><div><strong>{item.label || item.targetRole}</strong><span>{item.entryRole} → {item.targetRole} · {routeChannel.replaceAll("_"," ").toLowerCase()}{routeChannel === "SWITCHBOARD" && routeValue ? ` · ${routeValue}` : ""}</span><small>{item.rationale}</small></div><span className={item.isSelected ? "badge green" : "badge"}>{item.isSelected ? "Authorised" : item.authorityState === "OPEN" ? "OPEN" : "Research"}</span></div>})}</div> : <div className="verified-empty section"><span>Alternative route research is still in progress.</span></div>}
      </Card>
    </div>}

    {!engagementStrategy && engagementStatus && opportunity.status === "APPROVED" && authorityReady && <Card className="section g5-engagement-progress"><div className="section-head"><div><span className="eyebrow">Preparing your first move</span><div className="card-title">Outreach strategy in progress</div><div className="card-subtitle">MarketRoute is turning the approved opportunity into a clear, evidence-backed first engagement.</div></div><span className="badge">{engagementStatus.state.replaceAll("_", " ").toLowerCase()}</span></div><p>{engagementStatus.human_review_action === "EDIT" ? "Your edits are being sent back through mandatory self-review and Engagement Quality." : engagementStatus.human_review_action === "TRY_SECONDARY_ROUTE" ? "MarketRoute is rebuilding the engagement around the strongest available alternative route." : engagementStatus.state === "FAILED_TERMINAL" ? "This engagement has been stopped and will not progress automatically." : "MarketRoute is continuing from the opportunity you already approved."}</p></Card>}

    {engagementStrategy && engagementReasoning && channelStrategy && outreach && engagementQuality && outreachBody && <Card className="section g5-engagement-workspace">
      <div className="section-head"><div><span className="eyebrow">Your recommended first move</span><div className="card-title">Personalised outreach ready to review</div><div className="card-subtitle">The reason to reach out, strongest route and first-touch message are brought together in one place.</div></div><span className={`badge ${engagementStrategy.state === "APPROVED" ? "green" : ""}`}>{engagementStrategy.state === "APPROVED" ? "Approved" : "Ready for approval"}</span></div>
      <div className="g5-approval-summary section">
        <div className="g5-confidence-panel"><strong>{authorityReady ? "PASS" : "STALE"}</strong><span>Execution safety</span><small>{authorityReady ? "Current R4 → R5 → R6 lineage + safety gates satisfied" : "Stored engagement exists, but current CIE authority is no longer execution-ready"}</small></div>
        <div className="g5-first-move"><span>Recommended first move</span><strong>{channelStrategy.primary.executionChannel}</strong><small>{selectedCommercialRouteDisplay}</small></div>
        <div className="g5-first-move"><span>Why this route</span><strong>{channelStrategy.primary.selectionReason}</strong><small>{channelStrategy.primaryWhyNow}</small></div>
      </div>
      <div className="grid cols-2 section g5-commercial-argument">
        <div><h3>Commercial argument</h3><div className="g5-briefing-list"><div><span>Why this company</span><strong>{engagementReasoning.whyThisCompany}</strong></div><div><span>Problem</span><strong>{engagementReasoning.primaryProblem}</strong></div><div><span>Commercial consequence</span><strong>{engagementReasoning.commercialConsequence}</strong></div><div><span>Credible outcome</span><strong>{engagementReasoning.credibleOutcome}</strong></div><div><span>Smallest next commitment</span><strong>{engagementReasoning.smallestReasonableCommitment}</strong></div></div></div>
        <div><h3>Evidence & quality</h3><div className="g5-briefing-list"><div><span>Verified evidence used</span><strong>{outreach.evidenceUsed.length} source{outreach.evidenceUsed.length === 1 ? "" : "s"}</strong></div><div><span>Self-review</span><strong>PASS</strong></div><div><span>Route authority</span><strong>{opportunity.r5_current ? "OPEN" : "STALE / UNRESOLVED"}</strong></div><div><span>Contact authority</span><strong>{opportunity.r6_current ? "CURRENT" : "STALE / UNRESOLVED"}</strong></div><div><span>Rewrites completed</span><strong>{engagementStrategy.rewrite_count}</strong></div></div><div className="g5-quality-signals">{engagementQuality.explainability.slice(0,6).map(item => <span className={item.passed ? "badge green" : "badge"} key={item.code}>{item.passed ? "✓ " : "• "}{item.label}</span>)}</div></div>
      </div>
      <div className="g5-message-preview section">
        <div className="section-head"><div><h3>Outreach</h3><p>{outreach.channel === "EMAIL" ? "Email" : outreach.channel === "LINKEDIN" ? "LinkedIn" : outreach.channel === "SWITCHBOARD" ? "Switchboard script" : "Referral request"} · {outreach.tone.toLowerCase()} tone</p></div><span className="badge green">AI reviewed</span></div>
        {outreach.channel === "EMAIL" && outreach.content.subject && <div className="g5-message-subject"><span>Subject</span><strong>{outreach.content.subject}</strong></div>}
        {outreach.channel === "SWITCHBOARD" && selectedCommercialRouteChannelValue && <div className="g5-message-subject"><span>Phone number</span><strong>{selectedCommercialRouteChannelValue}</strong></div>}
        <div className="g5-message-body">{outreachBody}</div>
        <div className="g5-message-cta"><span>Call to action</span><strong>{outreach.callToAction}</strong></div>
      </div>
      <div className="g5-evidence-used section"><h3>Evidence used in this engagement</h3>{outreach.evidenceUsed.length ? outreach.evidenceUsed.map(item => <div className="review-history-item" key={`${item.sourceId}-${item.supportedClaim}`}><div><strong>{item.supportedClaim}</strong><span>Source: {item.sourceId}</span></div><span className="badge green">Verified</span></div>) : <div className="verified-empty"><span>No direct evidence reference was required in the final message.</span></div>}</div>
      {authorityReady ? <G5AssistedApprovalActions strategyId={engagementStrategy.id} channel={outreach.channel} state={engagementStrategy.state} hasSecondary={Boolean(channelStrategy.secondary)} subject={outreach.content.subject} body={outreachBody} callToAction={outreach.callToAction}/> : <div className="verified-empty"><span>Execution controls are withheld because the current R4 → R5 → R6 authority lineage is not READY.</span></div>}
    </Card>}

    {engagementTimeline && <Card className="section g5-engagement-timeline-card">
      <div className="section-head"><div><div className="card-title">Engagement activity</div><div className="card-subtitle">See MarketRoute move from commercial reasoning to a ready-to-review first move. This view refreshes automatically while work is active.</div></div><span className="badge green"><span className="live-dot active"/> Live</span></div>
      <G5EngagementTimeline timeline={engagementTimeline}/>
    </Card>}

    <div className="grid cols-2 section">
      <Card>
        <div className="card-title">CIE decision explained</div><div className="card-subtitle">Commercial readiness is categorical and auditable: Commercial Reality, truth-qualified evidence, an OPEN authorised route and route-compatible contact authority. Legacy scores are retained only as historical telemetry.</div>
      </Card>
      <Card>
        <div className="card-title">Workspace decision</div><div className="card-subtitle">Approve the complete opportunity, including the recommended access route.</div>
        <div className="strategy-grid section"><div className="strategy-item"><Target size={18}/><div><span>Recommended action</span><strong>{opportunity.recommended_action || "Continue evidence-led review"}</strong></div></div><div className="strategy-item"><ShieldCheck size={18}/><div><span>Authority state</span><strong>{authorityLabel}</strong><small>Workflow: {statusLabel(opportunity.status)}</small></div></div></div>
        {authorityReady ? <OpportunityReviewActions id={opportunity.id} campaignId={opportunity.campaign_id} status={opportunity.status} note={opportunity.review_note}/> : <div className="verified-empty section"><span>Review controls are withheld until current R4 commercial reality, R5 relationship-path authority and R6 contact authority resolve to READY.</span></div>}
      </Card>
    </div>

    <Card className="section">
      <div className="section-head"><div><div className="card-title">Authority lineage</div><div className="card-subtitle">The exact current reasoning provenance behind this opportunity. Workflow status is shown separately and never creates execution authority.</div></div><span className={`badge ${authorityReady ? "green" : ""}`}>{authorityLabel}</span></div>
      <div className="strategy-grid section">
        <div className="strategy-item"><ShieldCheck size={18}/><div><span>R4 · Commercial Reality</span><strong>{opportunity.r4_current ? (opportunity.r4_disposition || "CURRENT") : "STALE / PENDING"}</strong><small>{opportunity.r4_producer_version || "No current producer"} · {shortFingerprint(opportunity.r4_authority_fingerprint)}</small></div></div>
        <div className="strategy-item"><Target size={18}/><div><span>R5 · Relationship path</span><strong>{opportunity.r5_current ? "CURRENT" : (opportunity.r5_authority_status || "UNRESOLVED")}</strong><small>{opportunity.r5_producer_version || "No current producer"} · {shortFingerprint(opportunity.r5_authority_fingerprint)}</small></div></div>
        <div className="strategy-item"><ContactRound size={18}/><div><span>R6 · Contact authority</span><strong>{opportunity.r6_current ? "CURRENT" : (opportunity.r6_authority_status || "UNRESOLVED")}</strong><small>{opportunity.r6_producer_version || "No current producer"} · {shortFingerprint(opportunity.r6_contact_truth_fingerprint)}</small></div></div>
        <div className="strategy-item"><CheckCircle2 size={18}/><div><span>Authority Truth snapshot</span><strong>{opportunity.authority_truth_index !== null ? `${Number(opportunity.authority_truth_index).toFixed(1)} TI` : "No current Truth"}</strong><small>{opportunity.authority_evidence_sufficiency !== null ? `${Number(opportunity.authority_evidence_sufficiency).toFixed(1)}% evidence sufficiency` : "Sufficiency unavailable"} · {opportunity.authority_probability_state || "UNCALIBRATED"}</small></div></div>
      </div>
      <div className="route-signal-grid section">
        <div><span>Workflow state</span><strong>{statusLabel(opportunity.status)}</strong><small>Human/workspace lifecycle only</small></div>
        <div><span>Authority current</span><strong>{opportunity.authority_current ? "YES" : "NO"}</strong><small>{opportunity.workflow_authority_mismatch ? "Workflow/authority mismatch detected" : "Workflow and authority are not conflated"}</small></div>
        <div><span>Contact revalidation</span><strong>{opportunity.r6_next_revalidation_at ? formatDateTime(opportunity.r6_next_revalidation_at) : opportunity.primary_contact_id ? "Required" : "Organisational route"}</strong><small>{opportunity.latest_invalidation_reason || "No current invalidation reason"}</small></div>
      </div>
      {authorityHistory.length > 0 && <div className="review-history section">{authorityHistory.slice(0,6).map((event:any)=><div className="review-history-item" key={event.id}><div><strong>{String(event.authorityLayer || "authority").toUpperCase()} invalidation</strong><span>{event.reason || "Authority lineage changed"}</span><small>{shortFingerprint(event.previousFingerprint)} → {shortFingerprint(event.nextFingerprint)}</small></div><time>{event.invalidatedAt ? formatDateTime(event.invalidatedAt) : "—"}</time></div>)}</div>}
    </Card>

    {limitations.length > 0 && <Card className="section"><div className="card-title">What still needs human judgement</div><div className="card-subtitle">MarketRoute keeps uncertainty visible instead of hiding the opportunity.</div><div className="uncertainty-box"><ShieldCheck size={18}/><div>{limitations.map(item => <p key={item}>{item}</p>)}</div></div></Card>}

    <Card className="section">
      <div className="section-head"><div><div className="card-title">Opportunity evidence</div><div className="card-subtitle">Company and route evidence are brought together while remaining linked to their original sources.</div></div><span className="badge green">{Number(opportunity.company_evidence_count) + Number(opportunity.contact_evidence_count) + Number(opportunity.commercial_route_evidence_count || 0)} sources</span></div>
      <div className="opportunity-evidence-columns section"><div><h3>Company evidence</h3><div className="evidence-list">{companyEvidence.map((evidence: any) => <div className="evidence-item" key={evidence.id}><div><strong>{evidence.claim}</strong>{evidence.excerpt && <p>“{evidence.excerpt}”</p>}<span>{evidence.sourceTitle || evidence.sourceDomain || "Official company source"}</span></div><a href={evidence.sourceUrl} target="_blank" rel="noreferrer"><ExternalLink size={16}/></a></div>)}</div></div><div><h3>Route evidence</h3><div className="evidence-list">{[...commercialRouteEvidence,...contactEvidence].length ? [...commercialRouteEvidence,...contactEvidence].map((evidence: any) => <div className="evidence-item" key={`${evidence.routeId || "contact"}-${evidence.id}`}><div><strong>{evidence.claim}</strong>{evidence.excerpt && <p>“{evidence.excerpt}”</p>}<span>{evidence.sourceTitle || evidence.sourceKind || "Official route source"}</span></div><a href={evidence.sourceUrl} target="_blank" rel="noreferrer"><ExternalLink size={16}/></a></div>) : <div className="verified-empty"><span>No route evidence has been persisted yet.</span></div>}</div></div></div>
    </Card>

    <Card className="section"><div className="card-title">Opportunity history</div><div className="card-subtitle">Creation, research, CIE authority transitions and workspace decisions remain auditable.</div>{history.length ? <div className="review-history section">{history.map((event: any) => <div className="review-history-item" key={event.id}><div><strong>{String(event.eventType).replaceAll("_", " ").toLowerCase()}</strong><span>{event.metadata?.note || `${event.previousStatus || "New"} → ${event.nextStatus || opportunity.status}`}</span></div><time>{formatDateTime(event.occurredAt)}</time></div>)}</div> : <div className="verified-empty section"><span>No opportunity history has been recorded yet.</span></div>}</Card>

    <div className="section"><Link className="button secondary" href="/opportunities">← Back to opportunities</Link></div>
  </AppShell>;
}
