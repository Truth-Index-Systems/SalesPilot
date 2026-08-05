import { notFound } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/shell";
import { Card, PageHeader } from "@/components/ui";
import { CompanyReviewActions } from "@/components/company-review-actions";
import { requirePageUser } from "@/lib/auth/page-user";
import { getCompany, companyCounts } from "@/lib/discovery/repository";
import { listCampaigns } from "@/lib/campaigns/repository";
import { CheckCircle2, ExternalLink, ShieldCheck } from "@/components/icons";
export const dynamic="force-dynamic";

const fitLabels: Record<string,string>={industryFit:"Industry",audienceFit:"Audience",operationalFit:"Operational",geographyFit:"Geography",commercialFit:"Commercial"};
function reviewLabel(value:string){return ({PENDING_REVIEW:"Awaiting review",APPROVED:"Approved",REJECTED:"Rejected",ARCHIVED:"Archived"} as Record<string,string>)[value]??"Awaiting review";}

export default async function CompanyDetail({params}:{params:Promise<{id:string}>}){
  const {id}=await params;
  const user=await requirePageUser(`/companies/${id}`);
  const [company,counts,campaigns]=await Promise.all([getCompany(id),companyCounts(),listCampaigns()]);
  if(!company)notFound();
  const payload=company.payload??{};
  const fit=payload.fitBreakdown??{};
  return <AppShell title={company.company_name} user={user} workspaceStats={{campaigns:campaigns.length,companies:counts.total,replies:0,opportunities:0}}>
    <PageHeader eyebrow="Verified company recommendation" title={company.company_name} subtitle={`Found for ${company.campaign_name}. Review the independently checked evidence before deciding whether this company should continue.`} action={<span className="badge green"><ShieldCheck size={14}/> Verified · {company.confidence}/100</span>}/>
    <div className="grid cols-2">
      <Card>
        <div className="section-head"><div><div className="card-title">Company overview</div><div className="card-subtitle">Publicly supported information from the company&apos;s official website</div></div><a className="button secondary" href={company.website_url} target="_blank" rel="noreferrer">Official website <ExternalLink size={15}/></a></div>
        <p className="company-summary">{company.summary}</p>
        <div className="company-facts"><div><span>Industry</span><strong>{company.industry||"Not confirmed"}</strong></div><div><span>Country</span><strong>{company.country||"Not confirmed"}</strong></div><div><span>Review status</span><strong>{reviewLabel(company.review_status)}</strong></div><div><span>Evidence quality</span><strong>{company.evidence_quality??"—"}/100</strong></div></div>
        <CompanyReviewActions id={company.id} status={company.review_status} note={company.review_note}/>
      </Card>
      <Card>
        <div className="card-title">How the match was assessed</div><div className="card-subtitle">SalesPilot scores the fit dimensions separately and recalculates confidence after checking the evidence.</div>
        <div className="fit-breakdown section">{Object.entries(fitLabels).map(([key,label])=>{const score=Number(fit[key]??0);return <div className="fit-row" key={key}><div><span>{label}</span><strong>{score}/100</strong></div><div className="fit-track"><span style={{width:`${score}%`}}/></div></div>})}<div className="fit-row evidence"><div><span>Evidence quality</span><strong>{company.evidence_quality??0}/100</strong></div><div className="fit-track"><span style={{width:`${company.evidence_quality??0}%`}}/></div></div></div>
      </Card>
    </div>
    <div className="grid cols-2 section">
      <Card><div className="card-title">Why SalesPilot recommended this company</div><div className="card-subtitle">Campaign fit is explained rather than assumed.</div><div className="recommendation-reasons section">{(payload.why??[]).map((reason:string,index:number)=><div key={index}><CheckCircle2 size={19}/><span>{reason}</span></div>)}</div></Card>
      <Card><div className="card-title">What still needs human judgement</div><div className="card-subtitle">Uncertainty is shown openly before approval.</div>{(payload.uncertainties??[]).length>0?<div className="uncertainty-box"><ShieldCheck size={18}/><div>{payload.uncertainties.map((item:string,index:number)=><p key={index}>{item}</p>)}</div></div>:<div className="verified-empty"><CheckCircle2 size={20}/><span>No material uncertainty was identified from the public evidence.</span></div>}{(payload.riskFlags??[]).length>0&&<div className="risk-flags">{payload.riskFlags.map((item:string,index:number)=><span key={index}>{item}</span>)}</div>}</Card>
    </div>
    <Card className="section"><div className="card-title">Verified evidence</div><div className="card-subtitle">Every displayed source was reached on the company&apos;s official domain. Open the original page before approving.</div><div className="evidence-list section">{(company.evidence??[]).map((e:any)=><div className="evidence-item" key={e.id}><div><div className="evidence-verified"><ShieldCheck size={15}/> Official source verified {e.excerpt_matched&&<span>· excerpt matched</span>}</div><strong>{e.claim}</strong>{e.excerpt&&<p>“{e.excerpt}”</p>}<span>{e.source_title||e.source_domain||"Official website evidence"}</span></div><a href={e.source_url} target="_blank" rel="noreferrer" aria-label="Open evidence source"><ExternalLink size={16}/></a></div>)}</div></Card>

    <Card className="section"><div className="card-title">Review history</div><div className="card-subtitle">A clear record of every decision made inside this workspace.</div>{(company.review_history??[]).length>0?<div className="review-history section">{company.review_history.map((event:any)=><div className="review-history-item" key={event.id}><div><strong>{reviewLabel(event.next_status)}</strong><span>{event.note||"No review note was added."}</span></div><time title={new Date(event.occurred_at).toLocaleString()}>{new Date(event.occurred_at).toLocaleString()}</time></div>)}</div>:<div className="verified-empty section"><CheckCircle2 size={20}/><span>This company is awaiting its first workspace review.</span></div>}</Card>
    <div className="section"><Link className="button secondary" href="/companies">← Back to companies</Link></div>
  </AppShell>;
}
