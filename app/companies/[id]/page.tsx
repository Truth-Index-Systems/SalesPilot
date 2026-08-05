import { notFound } from "next/navigation";
import Link from "next/link";

import { CompanyReviewActions } from "@/components/company-review-actions";
import {
  Building2,
  CheckCircle2,
  ExternalLink,
  Globe2,
  ShieldCheck,
  Target,
} from "@/components/icons";
import { AppShell } from "@/components/shell";
import { Card, PageHeader } from "@/components/ui";
import { requirePageUser } from "@/lib/auth/page-user";
import { listCampaigns } from "@/lib/campaigns/repository";
import {
  companyCounts,
  getCompany,
} from "@/lib/discovery/repository";

export const dynamic = "force-dynamic";

const fitLabels: Record<string, string> = {
  industryFit: "Industry",
  audienceFit: "Audience",
  operationalFit: "Operational",
  geographyFit: "Geography",
  commercialFit: "Commercial",
};

function reviewLabel(value: string) {
  return (
    {
      PENDING_REVIEW: "Awaiting review",
      APPROVED: "Approved",
      REJECTED: "Not selected",
      ARCHIVED: "Archived",
    } as Record<string, string>
  )[value] ?? "Awaiting review";
}

function relativeTime(value: string) {
  const seconds = Math.max(
    0,
    Math.floor((Date.now() - new Date(value).getTime()) / 1000),
  );

  if (seconds < 10) return "Just now";
  if (seconds < 60) return `${seconds}s ago`;

  const minutes = Math.floor(seconds / 60);

  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);

  if (hours < 24) return `${hours}h ago`;

  return `${Math.floor(hours / 24)}d ago`;
}

function stars(score: number) {
  const count = Math.max(
    1,
    Math.min(5, Math.round(score / 20)),
  );

  return `${"★".repeat(count)}${"☆".repeat(5 - count)}`;
}

export default async function CompanyDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requirePageUser(`/companies/${id}`);

  const [company, counts, campaigns] = await Promise.all([
    getCompany(id),
    companyCounts(),
    listCampaigns(),
  ]);

  if (!company) {
    notFound();
  }

  const payload = company.payload ?? {};
  const fit = payload.fitBreakdown ?? {};
  const evidenceQuality = company.evidence_quality ?? 0;

  return (
    <AppShell
      title={company.company_name}
      user={user}
      workspaceStats={{
        campaigns: campaigns.length,
        companies: counts.total,
        replies: 0,
        opportunities: 0,
      }}
    >
      <PageHeader
        eyebrow="Company intelligence report"
        title={company.company_name}
        subtitle={`Found for ${company.campaign_name}. Review the independently checked commercial fit and official-source evidence before deciding whether this company should continue.`}
        action={
          <span className="badge green">
            <ShieldCheck size={14} />
            Verified recommendation
          </span>
        }
      />

      <Card className="company-report-hero">
        <div>
          <div className="report-kicker">
            <ShieldCheck size={15} />
            Independently checked against official sources
          </div>

          <p className="company-summary">{company.summary}</p>

          <div
            className="report-section-nav"
            aria-label="Company report sections"
          >
            <a href="#commercial-fit">Commercial fit</a>
            <a href="#recommendation">Why selected</a>
            <a href="#evidence">Evidence</a>
            <a href="#review-history">Review history</a>
          </div>

          <div className="company-facts report-facts">
            <div>
              <span>Industry</span>
              <strong>{company.industry || "Not confirmed"}</strong>
            </div>

            <div>
              <span>Country</span>
              <strong>{company.country || "Not confirmed"}</strong>
            </div>

            <div>
              <span>Review status</span>
              <strong>{reviewLabel(company.review_status)}</strong>
            </div>

            <div>
              <span>Evidence quality</span>
              <strong>{evidenceQuality}/100</strong>
            </div>
          </div>

          <a
            className="button secondary"
            href={company.website_url}
            target="_blank"
            rel="noreferrer"
          >
            Open official website
            <ExternalLink size={15} />
          </a>
        </div>

        <div
          className="company-score-card"
          aria-label={`${company.confidence} out of 100 confidence`}
        >
          <div className="confidence-stars" aria-hidden="true">
            {stars(company.confidence)}
          </div>

          <strong>{company.confidence}</strong>
          <span>Overall confidence</span>

          <div className="fit-track section">
            <span style={{ width: `${company.confidence}%` }} />
          </div>

          <span>{company.match_label}</span>
        </div>
      </Card>

      <div className="report-two-column section">
        <section id="commercial-fit">
          <Card>
            <div className="card-title">
              How the match was assessed
            </div>

            <div className="card-subtitle">
              SalesPilot scores each dimension independently, then
              recalculates confidence after evidence verification.
            </div>

            <div className="fit-breakdown section">
              {Object.entries(fitLabels).map(([key, label]) => {
                const score = Number(fit[key] ?? 0);

                return (
                  <div className="fit-row" key={key}>
                    <div>
                      <span>{label}</span>
                      <strong>{score}/100</strong>
                    </div>

                    <div className="fit-track">
                      <span style={{ width: `${score}%` }} />
                    </div>
                  </div>
                );
              })}

              <div className="fit-row evidence">
                <div>
                  <span>Evidence quality</span>
                  <strong>{evidenceQuality}/100</strong>
                </div>

                <div className="fit-track">
                  <span style={{ width: `${evidenceQuality}%` }} />
                </div>
              </div>
            </div>
          </Card>
        </section>

        <Card>
          <div className="card-title">Workspace decision</div>

          <div className="card-subtitle">
            Approve strong commercial matches, or hold back companies
            that should not continue.
          </div>

          <div className="strategy-grid section">
            <div className="strategy-item">
              <Target size={18} />

              <div>
                <span>Campaign</span>
                <strong>{company.campaign_name}</strong>
              </div>
            </div>

            <div className="strategy-item">
              <Building2 size={18} />

              <div>
                <span>Current status</span>
                <strong>{reviewLabel(company.review_status)}</strong>
              </div>
            </div>

            <div className="strategy-item">
              <Globe2 size={18} />

              <div>
                <span>Official sources</span>
                <strong>
                  {company.evidence?.length ?? 0} verified
                </strong>
              </div>
            </div>
          </div>

          <CompanyReviewActions
            id={company.id}
            status={company.review_status}
            note={company.review_note}
          />
        </Card>
      </div>

      <div className="grid cols-2 section" id="recommendation">
        <Card>
          <div className="card-title">
            Why SalesPilot recommended this company
          </div>

          <div className="card-subtitle">
            Campaign fit is explained rather than assumed.
          </div>

          <div className="recommendation-reasons section">
            {(payload.why ?? []).map(
              (reason: string, index: number) => (
                <div key={index}>
                  <CheckCircle2 size={19} />
                  <span>{reason}</span>
                </div>
              ),
            )}
          </div>
        </Card>

        <Card>
          <div className="card-title">
            What still needs human judgement
          </div>

          <div className="card-subtitle">
            Uncertainty is shown openly before approval.
          </div>

          {(payload.uncertainties ?? []).length > 0 ? (
            <div className="uncertainty-box">
              <ShieldCheck size={18} />

              <div>
                {payload.uncertainties.map(
                  (item: string, index: number) => (
                    <p key={index}>{item}</p>
                  ),
                )}
              </div>
            </div>
          ) : (
            <div className="verified-empty">
              <CheckCircle2 size={20} />
              <span>
                No material uncertainty was identified from the public
                evidence.
              </span>
            </div>
          )}

          {(payload.riskFlags ?? []).length > 0 && (
            <div className="risk-flags">
              {payload.riskFlags.map(
                (item: string, index: number) => (
                  <span key={index}>{item}</span>
                ),
              )}
            </div>
          )}
        </Card>
      </div>

      <section id="evidence" className="section">
        <Card>
          <div className="section-head">
            <div>
              <div className="card-title">
                Verified evidence from official sources
              </div>

              <div className="card-subtitle">
                Every displayed source was reached on the
                company&apos;s official domain. Open the original page
                before approving.
              </div>
            </div>

            <span className="badge green">
              {company.evidence?.length ?? 0} official source
              {(company.evidence?.length ?? 0) === 1 ? "" : "s"}
            </span>
          </div>

          <div className="evidence-list section">
            {(company.evidence ?? []).map((e: any) => (
              <div className="evidence-item" key={e.id}>
                <div>
                  <div className="evidence-verified">
                    <ShieldCheck size={15} />
                    Official source verified
                    {e.excerpt_matched && (
                      <span> · excerpt matched</span>
                    )}
                  </div>

                  <strong>{e.claim}</strong>

                  {e.excerpt && <p>“{e.excerpt}”</p>}

                  <span>
                    {e.source_title ||
                      e.source_domain ||
                      "Official website evidence"}
                  </span>
                </div>

                <a
                  href={e.source_url}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="Open evidence source"
                >
                  <ExternalLink size={16} />
                </a>
              </div>
            ))}
          </div>
        </Card>
      </section>

      <section id="review-history" className="section">
        <Card>
          <div className="card-title">Review history</div>

          <div className="card-subtitle">
            A clear record of every workspace decision.
          </div>

          {(company.review_history ?? []).length > 0 ? (
            <div className="review-history section">
              {company.review_history.map((event: any) => (
                <div
                  className="review-history-item"
                  key={event.id}
                >
                  <div>
                    <strong>
                      {reviewLabel(event.next_status)}
                    </strong>

                    <span>
                      {event.note ||
                        "No review note was added."}
                    </span>
                  </div>

                  <time
                    title={new Date(
                      event.occurred_at,
                    ).toLocaleString()}
                    dateTime={event.occurred_at}
                  >
                    {relativeTime(event.occurred_at)}
                  </time>
                </div>
              ))}
            </div>
          ) : (
            <div className="verified-empty section">
              <CheckCircle2 size={20} />
              <span>
                This company is awaiting its first workspace review.
              </span>
            </div>
          )}
        </Card>
      </section>

      <div className="section">
        <Link className="button secondary" href="/companies">
          ← Back to companies
        </Link>
      </div>
    </AppShell>
  );
}