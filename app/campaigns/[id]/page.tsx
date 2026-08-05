import { notFound } from "next/navigation";
import { AppShell } from "@/components/shell";
import { Card, PageHeader } from "@/components/ui";
import { CheckCircle2, Circle, Target, Users, WandSparkles, ShieldCheck, Rocket, Building2, MessageSquareReply, BriefcaseBusiness } from "@/components/icons";
import { getCampaign, listCampaigns } from "@/lib/campaigns/repository";
import { presentCampaignDetail } from "@/lib/campaigns/presenter";
import { requirePageUser } from "@/lib/auth/page-user";
import { getDiscoveryActivity, getDiscoveryForCampaign, listCompanies } from "@/lib/discovery/repository";
import { DiscoveryRetryButton } from "@/components/discovery-retry-button";
import { DiscoveryActivityTicker } from "@/components/discovery-activity-ticker";

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
  let discoveryActivities: any[] = [];
  try {
    record = await getCampaign(id);
    campaignCount = (await listCampaigns()).length;
    discovery = await getDiscoveryForCampaign(id);
    companyCount = (await listCompanies({ campaignId: id })).length;
    discoveryActivities = await getDiscoveryActivity(id);
  } catch (error) {
    console.error("Campaign detail unavailable", error);
  }
  if (!record) notFound();
  const campaign = presentCampaignDetail(record);
  const discoveryRunning = discovery?.status === "RUNNING" || discovery?.status === "QUEUED";
  const discoveryComplete = discovery?.status === "COMPLETED";
  const discoveryFailed = discovery?.status === "FAILED";
  const progress = Number(discovery?.progress ?? 0);
  const stageLabel = ({PREPARING:"Preparing company discovery",SEARCHING:"Searching for matching companies",ANALYSING:"Analysing company fit",VALIDATING:"Validating evidence",SAVING:"Saving recommendations",COMPLETE:"Companies ready for review"} as Record<string,string>)[discovery?.stage] ?? "Preparing company discovery";
  const journey = [
    ["Business", "complete"], ["Campaign", "complete"],
    ["Discovery", discoveryComplete ? "complete" : "current"],
    ["Companies", discoveryComplete ? "current" : "future"],
    ["Contacts", "future"], ["Outreach", "future"],
    ["Replies", "future"], ["Opportunities", "future"],
  ] as const;

  return <AppShell title={campaign.name} user={user} workspaceStats={{ campaigns: campaignCount, companies: companyCount, replies: 0, opportunities: 0 }}>
    <PageHeader eyebrow="Outbound sales campaign" title={campaign.name} subtitle="Your approved campaign, current position and next milestone in one place." action={<span className="badge green">{campaign.matchLabel} · {campaign.fitScore}/100</span>}/>

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
        <h2>{discoveryComplete ? "Matching companies are ready for review." : discoveryRunning ? "SalesPilot is finding matching companies." : discoveryFailed ? "Company discovery needs another attempt." : "Your outbound sales campaign is ready."}</h2>
        <p>{discoveryComplete ? `${companyCount} evidence-backed compan${companyCount === 1 ? "y is" : "ies are"} ready for your review.` : discoveryRunning ? "SalesPilot is continuing the approved campaign automatically. Every recommendation will include evidence and a confidence score." : discoveryFailed ? "No partial company recommendations were saved. Restart discovery when you are ready." : "Business understanding and campaign approval are complete. SalesPilot is preparing company discovery."}</p>
        <div className="campaign-readiness"><span/><strong>{stageLabel}</strong><small>{discoveryComplete ? "Review recommendations in Companies" : discoveryFailed ? "Safe to retry" : `${progress}% complete`}</small></div>
        {discoveryFailed && <DiscoveryRetryButton campaignId={id}/>}
        {!discoveryComplete && !discoveryFailed && <div className="discovery-progress" aria-label={`Company discovery ${progress}% complete`}><span style={{width:`${Math.max(4,progress)}%`}}/></div>}
        <DiscoveryActivityTicker campaignId={id} initialDiscovery={discovery} initialActivities={discoveryActivities} initialCompanyCount={companyCount}/>
      </div>
      <div className="next-status-panel">
        <span>{discoveryComplete ? "Next autonomous stage" : "Next milestone"}</span>
        <strong>{discoveryComplete ? "Company Review" : "Company Discovery"}</strong>
        <small>{discoveryComplete ? `${companyCount} recommendations ready for your decision` : stageLabel}</small>
      </div>
      <div className="campaign-roadmap" aria-label="Sales campaign journey">
        {journey.map(([label, state], index) => <div className={`roadmap-stage ${state}`} key={label}>
          <div className="roadmap-marker">{state === "complete" ? <CheckCircle2 size={18}/> : state === "current" ? <span className="roadmap-pulse"/> : <Circle size={16}/>}</div>
          <span>{label}</span>{index < journey.length - 1 && <i/>}
        </div>)}
      </div>
    </div>

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
        <div className="card-title large">{discoveryComplete ? "Company Review" : "Company Discovery"}</div>
        <div className="card-subtitle">{discoveryComplete ? "Review the evidence-backed recommendations and approve the strongest commercial matches." : "SalesPilot has started this stage automatically from your approved campaign."}</div>
        <div className="milestone-list section">
          <div><CheckCircle2 size={17}/><span>Find companies matching the approved audience</span></div>
          <div><CheckCircle2 size={17}/><span>Explain why every recommendation fits</span></div>
          <div><CheckCircle2 size={17}/><span>Hold uncertain matches for review</span></div>
          <div><CheckCircle2 size={17}/><span>Provide a confidence score for each result</span></div>
        </div>
        <div className="milestone-state"><span className="roadmap-pulse"/><div><strong>{discoveryComplete ? "Recommendations ready" : stageLabel}</strong><small>{discoveryComplete ? `${companyCount} companies are waiting for review.` : `${progress}% complete · progress is saved automatically.`}</small></div></div>
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
        <div className="premium-timeline section">{campaign.timeline.map(entry => {
          const presented = humanTimeline(entry.title, entry.description);
          const exact = new Date(entry.occurredAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
          return <div className="timeline-entry" key={entry.id}><div className="timeline-icon"><CheckCircle2 size={17}/></div><div><div className="name">{presented.title}</div>{presented.description && <div className="meta">{presented.description}</div>}<time title={exact} dateTime={entry.occurredAt}>{relativeTime(entry.occurredAt)}</time></div></div>;
        })}</div>
      </Card>
    </div>
  </AppShell>;
}
