import { notFound } from "next/navigation";
import { AppShell } from "@/components/shell";
import { Card, PageHeader } from "@/components/ui";
import { CheckCircle2, Circle, Target, Users, WandSparkles, ShieldCheck, Rocket, Building2, MessageSquareReply, BriefcaseBusiness } from "@/components/icons";
import { getCampaign, listCampaigns } from "@/lib/campaigns/repository";
import { presentCampaignDetail } from "@/lib/campaigns/presenter";
import { requirePageUser } from "@/lib/auth/page-user";
import { companyCounts, getDiscoveryActivity, getDiscoveryForCampaign } from "@/lib/discovery/repository";
import { DiscoveryRetryButton } from "@/components/discovery-retry-button";
import { DiscoveryActivityTicker } from "@/components/discovery-activity-ticker";
import { CampaignControlActions } from "@/components/campaign-control-actions";
import { contactCounts, listContactDiscoveryForCampaign } from "@/lib/contacts/repository";
import Link from "next/link";
import { derivePipelineCampaignStage } from "@/lib/pipeline/campaign-state";
import { canShowProgress, isJobComplete, isJobRetryScheduled, jobStateLabel, resolvePersistedJobState, truthfulProgress } from "@/lib/pipeline/presentation";

export const dynamic = "force-dynamic";

function relativeTime(value: string): string {
  const difference = Math.max(0, Date.now() - new Date(value).getTime());
  const minutes = Math.floor(difference / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function humanTimeline(title: string, description: string | null) {
  const normalised = title.toLowerCase();
  if (normalised.includes("business profile")) return { title: "Business understood", description: "SalesPilot completed and saved its approved understanding of your business." };
  if (normalised.includes("strategy selected")) return { title: "Campaign approved", description: "Your chosen outbound sales campaign is now securely in place." };
  if (normalised.includes("campaign created")) return { title: "Campaign saved", description: "Your outbound sales campaign and its first configuration have been saved." };
  if (normalised.includes("preparation")) return { title: "Preparation started", description: "SalesPilot is ready for the company discovery stage when it is enabled." };
  return { title, description };
}

export default async function CampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePageUser(`/campaigns/${id}`);
  let record;
  let campaignCount = 1;
  let discovery: any = null;
  let companyCount = 0;
  let pendingCompanyCount = 0;
  let approvedCompanyCount = 0;
  let rejectedCompanyCount = 0;
  let discoveryActivities: any[] = [];
  let contactCount = 0;
  let pendingContactCount = 0;
  let approvedContactCount = 0;
  let heldContactCount = 0;
  let contactSessions: any[] = [];
  try {
    record = await getCampaign(id);
    campaignCount = (await listCampaigns()).length;
    discovery = await getDiscoveryForCampaign(id);
    const counts = await companyCounts({ campaignId: id });
    companyCount = counts.total;
    pendingCompanyCount = counts.pending;
    approvedCompanyCount = counts.approved;
    rejectedCompanyCount = counts.rejected;
    discoveryActivities = await getDiscoveryActivity(id);
    const contacts = await contactCounts({ campaignId: id });
    contactCount = contacts.total;
    pendingContactCount = contacts.pending;
    approvedContactCount = contacts.approved;
    heldContactCount = contacts.hold;
    contactSessions = await listContactDiscoveryForCampaign(id);
  } catch (error) {
    console.error("Campaign detail unavailable", error);
  }
  if (!record) notFound();
  const campaign = presentCampaignDetail(record);
  const campaignPaused = record.status === "PAUSED";
  const discoveryState = resolvePersistedJobState(discovery);
  const discoveryRunning = !campaignPaused && discoveryState === "RUNNING";
  const discoveryQueued = !campaignPaused && discoveryState === "QUEUED";
  const discoveryComplete = isJobComplete(discovery);
  const discoveryRetryScheduled = isJobRetryScheduled(discovery);
  const discoveryNeedsAttention = discoveryState === "FAILED_TERMINAL";
  const reviewComplete = discoveryComplete && companyCount > 0 && pendingCompanyCount === 0;
  const contactResearching = contactSessions.filter(session => resolvePersistedJobState(session) === "RUNNING").length;
  const contactQueued = contactSessions.filter(session => resolvePersistedJobState(session) === "QUEUED").length;
  const contactRetryScheduled = contactSessions.filter(isJobRetryScheduled).length;
  const contactResearchComplete = contactSessions.length > 0 && contactSessions.every(session => isJobComplete(session) || resolvePersistedJobState(session) === "CANCELLED");
  const contactReviewComplete = contactResearchComplete && contactCount > 0 && pendingContactCount === 0;
  const contactsActive = approvedCompanyCount > 0 && (contactResearching > 0 || contactQueued > 0 || contactRetryScheduled > 0 || contactCount > 0 || contactSessions.length > 0);
  const progress = truthfulProgress(discovery);
  const stageLabel = discoveryRunning ? (({PREPARING:"Preparing company discovery",SEARCHING:"Searching for matching companies",ANALYSING:"Analysing company fit",VALIDATING:"Validating evidence",SAVING:"Saving recommendations",COMPLETE:"Companies ready for review"} as Record<string,string>)[discovery?.stage] ?? "Researching matching companies") : jobStateLabel(discovery, { queued: "Company discovery queued", complete: "Companies ready for review", noResults: "No new supported companies found" });
  const visibleCampaignStage = derivePipelineCampaignStage({
    campaignPaused,
    campaignArchived: record.status === "ARCHIVED",
    businessAnalysisReady: true,
    campaignApproved: true,
    companyDiscoveryActive: discoveryRunning || discoveryQueued,
    companiesAwaitingReview: pendingCompanyCount,
    approvedCompanies: approvedCompanyCount,
    contactDiscoveryActive: contactResearching > 0 || contactQueued > 0,
    contactsAwaitingReview: pendingContactCount,
    approvedReachableContacts: approvedContactCount,
    outreachStarted: false,
    repliesReceived: false,
    opportunitiesCreated: false,
  });
  const stageIndex = ({ BUSINESS_ANALYSIS:0, CAMPAIGN_REVIEW:1, COMPANY_DISCOVERY:2, COMPANY_REVIEW:3, CONTACT_DISCOVERY:4, CONTACT_REVIEW:4, OUTREACH_READY:5, OUTREACH:5, REPLIES:6, OPPORTUNITIES:7, PAUSED:-1, ARCHIVED:-1 } as Record<string,number>)[visibleCampaignStage] ?? 2;
  const journeyLabels = ["Business", "Campaign", "Discovery", "Companies", "Contacts", "Outreach", "Replies", "Opportunities"] as const;
  const journey = journeyLabels.map((label, index) => [label, index < stageIndex ? "complete" : index === stageIndex ? "current" : "future"] as const);

  return <AppShell title={campaign.name} user={user} workspaceStats={{ campaigns: campaignCount, companies: companyCount, replies: 0, opportunities: 0 }}>
    <PageHeader eyebrow="Outbound sales campaign" title={campaign.name} subtitle="Your approved campaign, current position and next milestone in one place." action={<div className="campaign-page-actions"><span className={`badge ${campaignPaused ? "amber" : "green"}`}>{campaignPaused ? "Paused" : `${campaign.matchLabel} · ${campaign.fitScore}/100`}</span><CampaignControlActions campaignId={id} campaignName={campaign.name} status={record.status}/></div>}/>

    <section className="campaign-summary-strip" aria-label="Campaign summary">
      <div><span>Business</span><strong>{campaign.businessName}</strong></div>
      <div className="summary-arrow">→</div>
      <div><span>Audience</span><strong>{campaign.audience}</strong></div>
      <div className="summary-arrow">→</div>
      <div><span>Campaign mode</span><strong>{campaign.modeLabel}</strong></div>
      <div className="summary-arrow">→</div>
      <div><span>Confidence</span><strong>{campaign.fitScore}/100</strong></div>
    </section>

    <div className="hero campaign-control-centre">
      <div className="campaign-control-copy">
        <div className="eyebrow" style={{ color: "#d8f6ff" }}>Campaign status</div>
        <h2>{campaignPaused ? "This outbound sales campaign is paused." : contactReviewComplete ? "Decision-maker review is complete." : contactsActive ? "SalesPilot is identifying the right people." : reviewComplete ? "Company review is complete." : discoveryComplete ? "Matching companies are ready for review." : discoveryRunning ? "SalesPilot is finding matching companies." : discoveryRetryScheduled ? "Company discovery retry is scheduled." : discoveryNeedsAttention ? "Company discovery needs attention." : discoveryQueued ? "Company discovery is queued." : "Your outbound sales campaign is ready."}</h2>
        <p>{campaignPaused ? "Autonomous work is stopped. Your campaign, companies, contacts, evidence and review history remain safely saved." : contactReviewComplete ? `${approvedContactCount} approved contact${approvedContactCount === 1 ? " is" : "s are"} ready for outreach.` : contactsActive ? `${contactResearching} compan${contactResearching === 1 ? "y is" : "ies are"} being researched and ${pendingContactCount} contact${pendingContactCount === 1 ? " is" : "s are"} awaiting review.` : reviewComplete ? `${approvedCompanyCount} approved companies have automatically entered contact discovery.` : discoveryComplete ? `${pendingCompanyCount} evidence-backed compan${pendingCompanyCount === 1 ? "y is" : "ies are"} ready for your review.` : discoveryRunning ? "SalesPilot is continuing the approved campaign automatically. Every recommendation will include evidence and a confidence score." : discoveryRetryScheduled ? "The scheduler will retry automatically at the saved retry time." : discoveryNeedsAttention ? "The job reached a terminal failure and requires an administrator to review the diagnostic reason." : discoveryQueued ? "The scheduler has accepted this campaign and will begin research when a worker is available." : "Business understanding and campaign approval are complete. SalesPilot is preparing company discovery."}</p>
        <div className="campaign-readiness"><span/><strong>{contactReviewComplete ? "Contacts ready for outreach" : contactsActive ? "Autonomous contact discovery" : reviewComplete ? "Company review complete" : stageLabel}</strong><small>{contactReviewComplete ? `${approvedContactCount} approved contacts` : contactsActive ? `${contactResearching} researching · ${contactQueued} queued · ${contactRetryScheduled} retry scheduled · ${pendingContactCount} awaiting review` : reviewComplete ? "Approved companies moved forward automatically" : discoveryComplete ? `${pendingCompanyCount} awaiting review` : discoveryRetryScheduled ? "Retry scheduled" : discoveryNeedsAttention ? "Needs attention" : discoveryQueued ? "Queued" : progress !== null ? `${progress}% complete` : stageLabel}</small></div>
        {discoveryNeedsAttention && <DiscoveryRetryButton campaignId={id}/>}
        {canShowProgress(discovery) && progress !== null && <div className="discovery-progress" aria-label={`Company discovery ${progress}% complete`}><span style={{width:`${Math.max(4,progress)}%`}}/></div>}
        {!campaignPaused && <DiscoveryActivityTicker campaignId={id} initialDiscovery={discovery} initialActivities={discoveryActivities} initialCompanyCount={companyCount}/>}
      </div>
      <div className="next-status-panel">
        <span>{contactReviewComplete ? "Next autonomous stage" : contactsActive ? "Current autonomous stage" : reviewComplete || discoveryComplete ? "Current autonomous stage" : "Next milestone"}</span>
        <strong>{contactReviewComplete ? "Outreach" : contactsActive ? "Contact Discovery" : reviewComplete ? "Contact Discovery" : discoveryComplete ? "Company Review" : "Company Discovery"}</strong>
        <small>{contactReviewComplete ? `${approvedContactCount} contacts ready for G4` : contactsActive ? `${contactResearching} companies researching · ${pendingContactCount} contacts awaiting review` : reviewComplete ? "Approved companies are entering contact research" : discoveryComplete ? `${pendingCompanyCount} recommendations ready for your decision` : stageLabel}</small>
        {contactsActive && <Link className="campaign-stage-link" href={`/contacts?campaign=${id}`}>Open campaign contacts →</Link>}
      </div>
      <div className="campaign-roadmap" aria-label="Sales campaign journey">
        {journey.map(([label, state], index) => <div className={`roadmap-stage ${state}`} key={label}>
          <div className="roadmap-marker">{state === "complete" ? <CheckCircle2 size={18}/> : state === "current" ? <span className="roadmap-pulse"/> : <Circle size={16}/>}</div>
          <span>{label}</span>{index < journey.length - 1 && <i/>}
        </div>)}
      </div>
    </div>

    {approvedCompanyCount > 0 && <Card className="campaign-contact-status">
      <div><span className="eyebrow">Autonomous contact discovery</span><h3>{contactReviewComplete ? "Decision-makers approved" : contactResearching ? "SalesPilot is researching decision-makers" : pendingContactCount ? "Contacts are awaiting your judgement" : "Approved companies are entering contact research"}</h3><p>{contactReviewComplete ? "The campaign now has approved people ready for the Outreach stage." : "Every approved company moves forward automatically. SalesPilot identifies operational buyers, verifies public evidence, and only then asks for review."}</p></div>
      <div className="campaign-contact-metrics"><div><span>Researching</span><strong>{contactResearching}</strong></div><div><span>Awaiting review</span><strong>{pendingContactCount}</strong></div><div><span>Approved</span><strong>{approvedContactCount}</strong></div></div>
      <Link className="button secondary" href={`/contacts?campaign=${id}`}>{pendingContactCount ? "Review contacts" : "View contacts"}</Link>
    </Card>}

    <div className="grid cols-2 section campaign-primary-grid">
      <Card className="strategy-card">
        <div className="section-head"><div><div className="card-title">Campaign strategy</div><div className="card-subtitle">Version 1 · approved and securely saved.</div></div><span className="badge green">{campaign.fitScore}/100 confidence</span></div>
        <div className="strategy-grid section">
          <div className="strategy-item"><Target size={18}/><div><span>Objective</span><strong>{campaign.objective}</strong></div></div>
          <div className="strategy-item"><Building2 size={18}/><div><span>Audience</span><strong>{campaign.audience}</strong></div></div>
          <div className="strategy-item"><Users size={18}/><div><span>Buyer roles</span><strong>{campaign.buyerRoles.join(" · ")}</strong></div></div>
          <div className="strategy-item"><WandSparkles size={18}/><div><span>Recommended message</span><strong>{campaign.messageAngle}</strong></div></div>
          <div className="strategy-item"><ShieldCheck size={18}/><div><span>Campaign mode</span><strong>{campaign.modeLabel}</strong></div></div>
          <div className="strategy-item"><Rocket size={18}/><div><span>Match quality</span><strong>{campaign.matchLabel}</strong></div></div>
        </div>
      </Card>

      <Card className="next-milestone-card">
        <div className="eyebrow">{discoveryComplete ? "Current autonomous stage" : "Next milestone"}</div>
        <div className="card-title large">{reviewComplete ? "Review complete" : discoveryComplete ? "Company Review" : "Company Discovery"}</div>
        <div className="card-subtitle">{reviewComplete ? "Every verified recommendation has received a workspace decision." : discoveryComplete ? "Review the evidence-backed recommendations and approve the strongest commercial matches." : "SalesPilot has started this stage automatically from your approved campaign."}</div>
        <div className="milestone-list section">
          <div><CheckCircle2 size={17}/><span>Find companies matching the approved audience</span></div>
          <div><CheckCircle2 size={17}/><span>Explain why every recommendation fits</span></div>
          <div><CheckCircle2 size={17}/><span>Hold uncertain matches for review</span></div>
          <div><CheckCircle2 size={17}/><span>Provide a confidence score for each result</span></div>
        </div>
        <div className="milestone-state"><span className="roadmap-pulse"/><div><strong>{reviewComplete ? "Review decisions saved" : discoveryComplete ? "Recommendations ready" : stageLabel}</strong><small>{reviewComplete ? `${approvedCompanyCount} approved · ${rejectedCompanyCount} not selected.` : discoveryComplete ? `${pendingCompanyCount} companies are waiting for review.` : progress !== null ? `${progress}% complete · progress is saved automatically.` : stageLabel}</small></div></div>
      </Card>
    </div>

    <div className="grid cols-2 section">
      <Card>
        <div className="card-title">Why SalesPilot recommended this strategy</div>
        <div className="card-subtitle">The recommendation is grounded in evidence from your public website.</div>
        <div className="recommendation-reasons section">{campaign.why.map((reason, index) => <div key={`${index}-${reason}`}><CheckCircle2 size={19}/><span>{reason}</span></div>)}</div>
      </Card>
      <Card>
        <div className="card-title">Campaign timeline</div>
        <div className="card-subtitle">Only useful customer-facing progress is shown.</div>
        <div className="premium-timeline section">{campaign.timeline.filter((entry, index, entries) => {
          if (index === 0) return true;
          const previous = entries[index - 1];
          const key = `${entry.title.trim().toLowerCase()}|${(entry.description ?? "").trim().toLowerCase()}`;
          const previousKey = `${previous.title.trim().toLowerCase()}|${(previous.description ?? "").trim().toLowerCase()}`;
          const closeTogether = Math.abs(Date.parse(entry.occurredAt) - Date.parse(previous.occurredAt)) < 10 * 60 * 1000;
          return key !== previousKey || !closeTogether;
        }).map(entry => {
          const presented = humanTimeline(entry.title, entry.description);
          const exact = new Date(entry.occurredAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
          return <div className="timeline-entry" key={entry.id}><div className="timeline-icon"><CheckCircle2 size={17}/></div><div><div className="name">{presented.title}</div>{presented.description && <div className="meta">{presented.description}</div>}<time title={exact} dateTime={entry.occurredAt}>{relativeTime(entry.occurredAt)}</time></div></div>;
        })}</div>
      </Card>
    </div>
  </AppShell>;
}
