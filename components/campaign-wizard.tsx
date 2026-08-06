"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Globe2,
  MessageSquareReply,
  Sparkles,
  Target,
  Users,
} from "@/components/icons";
import type { AiEnvelope } from "@/lib/ai/contracts";
import type { BusinessDnaPayload } from "@/lib/ai/schemas/business-dna";
import { campaignMatchLabel, normaliseBusinessAnalysis } from "@/lib/intelligence/fit-score";

type DiscoveryError = {
  code: string;
  title: string;
  message: string;
  hint: string;
};

type DiscoveryResponse =
  | {
      ok: true;
      analysis: AiEnvelope<BusinessDnaPayload>;
      pagesRead: number;
      canonicalUrl: string;
    }
  | {
      ok: false;
      error: DiscoveryError;
    };


type AnalysisJob = {
  id: string;
  website: string;
  canonicalUrl: string | null;
  status: "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED_RETRYABLE" | "FAILED_TERMINAL" | "CANCELLED";
  stage: string;
  progress: number;
  attemptCount: number;
  nextRetryAt: string | null;
  error: DiscoveryError | null;
  pagesRead: number;
  analysis: AiEnvelope<BusinessDnaPayload> | null;
};

type AnalysisJobResponse =
  | { ok: true; job: AnalysisJob; accessToken?: string }
  | { ok: false; error: DiscoveryError };

type SavedAnalysisJob = { jobId: string; accessToken: string; savedAt: number };

type LaunchError = {
  code: string;
  title: string;
  message: string;
  hint: string;
};

type LaunchResponse =
  | {
      ok: true;
      campaign: {
        id: string;
        redirectUrl: string;
      };
    }
  | {
      ok: false;
      error: LaunchError;
    };

const CAMPAIGN_DRAFT_KEY = "salespilot:campaign-draft:v2";
const ANALYSIS_JOB_KEY = "salespilot:business-analysis-job:v1";
const LEGACY_CAMPAIGN_DRAFT_KEY = "salespilot:campaign-draft:v1";
const CAMPAIGN_DRAFT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

const ANALYSIS_STAGES = [
  { label: "Website reached", detail: "Connecting securely to the public website." },
  { label: "Reading your website", detail: "Reviewing services, products and sector pages." },
  { label: "Understanding what you sell", detail: "Identifying the offer, proof points and positioning." },
  { label: "Finding your ideal buyers", detail: "Looking for customer language and buying signals." },
  { label: "Building your Business DNA", detail: "Structuring the strongest commercial understanding." },
  { label: "Designing outbound sales campaigns", detail: "Creating and ranking focused campaign options." },
  { label: "Preparing recommendations", detail: "Checking confidence before opening your review." },
] as const;

type CampaignDraft = {
  version: 2;
  savedAt: number;
  step: number;
  result: AiEnvelope<BusinessDnaPayload>;
  selectedProposalId: string;
  websiteUrl: string;
  pagesRead: number;
};

function readCampaignDraft(): CampaignDraft | null {
  const rawDraft =
    localStorage.getItem(CAMPAIGN_DRAFT_KEY) ??
    sessionStorage.getItem(LEGACY_CAMPAIGN_DRAFT_KEY);

  if (!rawDraft) return null;

  try {
    const parsed = JSON.parse(rawDraft) as Partial<CampaignDraft> & {
      result?: AiEnvelope<BusinessDnaPayload>;
      selectedProposalId?: string;
      websiteUrl?: string;
    };

    if (!parsed.result || !parsed.selectedProposalId) return null;

    const savedAt = typeof parsed.savedAt === "number" ? parsed.savedAt : Date.now();
    if (Date.now() - savedAt > CAMPAIGN_DRAFT_MAX_AGE_MS) {
      localStorage.removeItem(CAMPAIGN_DRAFT_KEY);
      sessionStorage.removeItem(LEGACY_CAMPAIGN_DRAFT_KEY);
      return null;
    }

    return {
      version: 2,
      savedAt,
      step: typeof parsed.step === "number" ? Math.min(3, Math.max(1, parsed.step)) : 3,
      result: normaliseBusinessAnalysis(parsed.result),
      selectedProposalId: parsed.selectedProposalId,
      websiteUrl: parsed.websiteUrl ?? parsed.result.payload.company.website,
      pagesRead: typeof parsed.pagesRead === "number" ? parsed.pagesRead : 0,
    };
  } catch {
    localStorage.removeItem(CAMPAIGN_DRAFT_KEY);
    sessionStorage.removeItem(LEGACY_CAMPAIGN_DRAFT_KEY);
    return null;
  }
}

export function CampaignWizard() {
  const router = useRouter();

  const [step, setStep] = useState(0);
  const [url, setUrl] = useState("truthindexsystems.co.uk");
  const [selected, setSelected] = useState(0);
  const [result, setResult] =
    useState<AiEnvelope<BusinessDnaPayload> | null>(null);
  const [pagesRead, setPagesRead] = useState(0);
  const [loading, setLoading] = useState(false);
  const [analysisStage, setAnalysisStage] = useState(0);
  const [analysisComplete, setAnalysisComplete] = useState(false);
  const [error, setError] = useState<DiscoveryError | null>(null);
  const [analysisJob, setAnalysisJob] = useState<AnalysisJob | null>(null);
  const [launching, setLaunching] = useState(false);
  const [launchError, setLaunchError] = useState<LaunchError | null>(null);

  useEffect(() => {
    const draft = readCampaignDraft();
    if (!draft) return;

    const proposalIndex = draft.result.payload.campaigns.findIndex(
      proposal => proposal.id === draft.selectedProposalId,
    );

    setResult(draft.result);
    setSelected(proposalIndex >= 0 ? proposalIndex : 0);
    setUrl(draft.websiteUrl);
    setPagesRead(draft.pagesRead);
    setStep(draft.step);

    localStorage.setItem(CAMPAIGN_DRAFT_KEY, JSON.stringify(draft));
    sessionStorage.removeItem(LEGACY_CAMPAIGN_DRAFT_KEY);
  }, []);

  useEffect(() => {
    const stageMap: Record<string, number> = {
      QUEUED: 0,
      READING_WEBSITE: 1,
      ANALYSING_BUSINESS: 3,
      PREPARING_RECOMMENDATIONS: 6,
      COMPLETE: 6,
      FAILED: Math.max(0, analysisStage),
    };
    if (analysisJob) {
      setAnalysisStage(stageMap[analysisJob.stage] ?? 0);
      setAnalysisComplete(analysisJob.status === "COMPLETED");
    }
  }, [analysisJob, analysisStage]);

  useEffect(() => {
    if (result) return;
    const raw = localStorage.getItem(ANALYSIS_JOB_KEY);
    if (!raw) return;
    try {
      const saved = JSON.parse(raw) as SavedAnalysisJob;
      if (!saved.jobId || !saved.accessToken || Date.now() - saved.savedAt > CAMPAIGN_DRAFT_MAX_AGE_MS) {
        localStorage.removeItem(ANALYSIS_JOB_KEY);
        return;
      }
      void monitorAnalysisJob(saved.jobId, saved.accessToken, true);
    } catch {
      localStorage.removeItem(ANALYSIS_JOB_KEY);
    }
  // Resume once on mount. monitorAnalysisJob intentionally uses stable browser APIs only.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result]);

  useEffect(() => {
    if (!result || !result.payload.campaigns[selected]) return;

    const draft: CampaignDraft = {
      version: 2,
      savedAt: Date.now(),
      step,
      result,
      selectedProposalId: result.payload.campaigns[selected].id,
      websiteUrl: url,
      pagesRead,
    };

    localStorage.setItem(CAMPAIGN_DRAFT_KEY, JSON.stringify(draft));
  }, [pagesRead, result, selected, step, url]);

  const proposals = result?.payload.campaigns ?? [];
  const chosen = proposals[selected];

  const confidenceLabel = useMemo(() => {
    const score = result?.confidence ?? 0;

    if (score >= 0.9) return "High confidence";
    if (score >= 0.72) return "Good confidence";

    return "Review recommended";
  }, [result]);

  function normaliseWebsiteInput(value: string) {
    const trimmed = value.trim();

    if (!trimmed) return "";

    return /^https?:\/\//i.test(trimmed)
      ? trimmed
      : `https://${trimmed}`;
  }

  async function fetchAnalysisJob(jobId: string, accessToken: string) {
    const response = await fetch(`/api/intelligence/business-discovery?jobId=${encodeURIComponent(jobId)}&accessToken=${encodeURIComponent(accessToken)}`, { cache: "no-store" });
    const data = (await response.json()) as AnalysisJobResponse;
    if (!data.ok) throw new Error(data.error.message);
    return data.job;
  }

  async function runAnalysisJob(jobId: string, accessToken: string) {
    await fetch("/api/intelligence/business-discovery/run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jobId, accessToken }),
    });
  }

  async function monitorAnalysisJob(jobId: string, accessToken: string, resume = false) {
    setLoading(true);
    setError(null);
    try {
      let job = await fetchAnalysisJob(jobId, accessToken);
      setAnalysisJob(job);
      setUrl(job.canonicalUrl ?? job.website);

      if (["QUEUED", "FAILED_RETRYABLE"].includes(job.status)) {
        const retryDue = !job.nextRetryAt || new Date(job.nextRetryAt).getTime() <= Date.now();
        if (retryDue) void runAnalysisJob(jobId, accessToken);
      } else if (job.status === "RUNNING" && resume) {
        void runAnalysisJob(jobId, accessToken);
      }

      for (let count = 0; count < 180; count += 1) {
        if (job.status === "COMPLETED") {
          if (!job.analysis || !job.canonicalUrl) throw new Error("Completed analysis did not contain a result.");
          setAnalysisComplete(true);
          setResult(job.analysis);
          setPagesRead(job.pagesRead);
          setUrl(job.canonicalUrl);
          setSelected(0);
          setStep(1);
          localStorage.removeItem(ANALYSIS_JOB_KEY);
          return;
        }
        if (job.status === "FAILED_TERMINAL" || job.status === "CANCELLED") {
          setError(job.error ?? { code: "ANALYSIS_FAILED", title: "SalesPilot couldn't complete the analysis", message: "The saved analysis ended before completion.", hint: "Check the website and try again." });
          return;
        }
        if (job.status === "FAILED_RETRYABLE") {
          setError(job.error ?? { code: "ANALYSIS_RETRY", title: "Analysis paused safely", message: "SalesPilot saved the work after an interruption.", hint: "Use Try again when the retry time arrives." });
          return;
        }
        await new Promise(resolve => window.setTimeout(resolve, 2000));
        job = await fetchAnalysisJob(jobId, accessToken);
        setAnalysisJob(job);
      }
      setError({ code: "ANALYSIS_STILL_RUNNING", title: "Analysis is still running", message: "SalesPilot has saved this analysis and will not lose it.", hint: "You can leave this page and return later." });
    } catch (reason) {
      console.error("Website analysis monitoring failed", reason);
      setError({ code: "SERVICE_UNAVAILABLE", title: "We couldn't refresh the analysis", message: "The analysis job remains saved, but its latest status could not be loaded.", hint: "Check your connection and try again." });
    } finally {
      setLoading(false);
    }
  }

  async function analyse() {
    const normalisedUrl = normaliseWebsiteInput(url);
    if (!normalisedUrl) {
      setError({ code: "INVALID_REQUEST", title: "Enter your company website", message: "SalesPilot needs a public website address before it can begin.", hint: "Enter an address such as yourcompany.com." });
      return;
    }

    setLoading(true);
    setAnalysisComplete(false);
    setAnalysisJob(null);
    setError(null);
    setUrl(normalisedUrl);

    try {
      const response = await fetch("/api/intelligence/business-discovery", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ website: normalisedUrl }),
      });
      const data = (await response.json()) as AnalysisJobResponse;
      if (!data.ok || !data.accessToken) {
        setError(data.ok ? { code: "ANALYSIS_FAILED", title: "Analysis could not start", message: "The saved analysis token was not returned.", hint: "Please try again." } : data.error);
        return;
      }
      const saved = { jobId: data.job.id, accessToken: data.accessToken, savedAt: Date.now() } satisfies SavedAnalysisJob;
      localStorage.setItem(ANALYSIS_JOB_KEY, JSON.stringify(saved));
      setAnalysisJob(data.job);
      // monitorAnalysisJob owns the single worker dispatch. Starting it here as
      // well caused two concurrent claim attempts for the same persisted job.
      await monitorAnalysisJob(data.job.id, data.accessToken);
    } catch (reason) {
      console.error("Website analysis request failed", reason);
      setError({ code: "SERVICE_UNAVAILABLE", title: "We couldn't start the analysis", message: "SalesPilot could not save the website analysis job.", hint: "Check your connection and try again in a moment." });
    } finally {
      setLoading(false);
    }
  }

  async function launchCampaign() {
    if (!result || !chosen) return;

    setLaunching(true);
    setLaunchError(null);

    const idempotencyStorageKey =
      `salespilot:campaign-launch:${chosen.id}`;

    let idempotencyKey =
      localStorage.getItem(idempotencyStorageKey) ??
      sessionStorage.getItem(idempotencyStorageKey);

    if (!idempotencyKey) {
      idempotencyKey =
        `campaign-launch:${crypto.randomUUID()}:${chosen.id}`;

      localStorage.setItem(
        idempotencyStorageKey,
        idempotencyKey,
      );
    }

    localStorage.setItem(
      CAMPAIGN_DRAFT_KEY,
      JSON.stringify({
        version: 2,
        savedAt: Date.now(),
        step: 3,
        result,
        selectedProposalId: chosen.id,
        websiteUrl: url,
        pagesRead,
      } satisfies CampaignDraft),
    );

    try {
      const response = await fetch("/api/campaigns/launch", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          businessAnalysis: result,
          selectedProposalId: chosen.id,
          websiteUrl: url,
          idempotencyKey,
        }),
      });

      const data = (await response.json()) as LaunchResponse;

      if (!data.ok) {
        if (response.status === 401 || data.error.code === "SIGN_IN_REQUIRED") {
          router.push(`/sign-in?next=${encodeURIComponent("/campaigns/new")}`);
          return;
        }
        setLaunchError(data.error);
        return;
      }

      localStorage.removeItem(CAMPAIGN_DRAFT_KEY);
      localStorage.removeItem(idempotencyStorageKey);
      sessionStorage.removeItem(LEGACY_CAMPAIGN_DRAFT_KEY);
      sessionStorage.removeItem(idempotencyStorageKey);

      router.push(data.campaign.redirectUrl);
    } catch (reason) {
      console.error("Campaign launch request failed", reason);

      setLaunchError({
        code: "NETWORK_ERROR",
        title: "Campaign could not be launched",
        message:
          "SalesPilot could not connect to campaign storage.",
        hint:
          "Please try again. Your selected strategy is still available.",
      });
    } finally {
      setLaunching(false);
    }
  }

  const back = () =>
    setStep((value) => Math.max(0, value - 1));

  const next = () =>
    setStep((value) => Math.min(3, value + 1));

  return (
    <>
      <div className="stepper">
        {[0, 1, 2, 3].map((index) => (
          <span
            key={index}
            className={`step ${
              index < step
                ? "done"
                : index === step
                  ? "current"
                  : ""
            }`}
          />
        ))}
      </div>

      {step === 0 && (
        <div className="grid cols-2">
          <div className="card">
            <div className="eyebrow">
              Understand your business
            </div>

            <h2>What is your website?</h2>

            <p className="page-subtitle">
              SalesPilot will read your public website, understand
              what you sell and propose the strongest first
              campaigns.
            </p>

            <div className="field section">
              <label>Company website</label>

              <div style={{ display: "flex", gap: 10 }}>
                <input
                  className="input"
                  value={url}
                  onChange={(event) =>
                    setUrl(event.target.value)
                  }
                  onBlur={() =>
                    setUrl(normaliseWebsiteInput(url))
                  }
                  placeholder="yourcompany.com"
                  disabled={loading}
                  inputMode="url"
                  autoCapitalize="none"
                  autoCorrect="off"
                />

                <button
                  className="button primary"
                  onClick={analyse}
                  disabled={loading || !url.trim()}
                >
                  <Sparkles size={16} />
                  {loading ? "Analysing…" : "Analyse"}
                </button>
              </div>

              {error && (
                <div
                  className="website-error"
                  role="alert"
                >
                  <div className="website-error-icon">
                    <AlertTriangle size={19} />
                  </div>

                  <div className="website-error-copy">
                    <strong>{error.title}</strong>
                    <p>{error.message}</p>
                    <span>{error.hint}</span>
                  </div>

                  {error.code.startsWith("AI_") ? (
                    <button
                      className="button secondary website-error-action"
                      type="button"
                      onClick={() => router.push("/settings")}
                    >
                      Open AI settings
                    </button>
                  ) : (
                    <button
                      className="button secondary website-error-action"
                      type="button"
                      onClick={analyse}
                      disabled={loading}
                    >
                      Try again
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className="section card soft">
              <div className="card-title">
                <Globe2 size={16} />
                What SalesPilot will inspect
              </div>

              <p className="card-subtitle">
                Services, products, sector pages, proof points,
                buyer language and commercial positioning.
                Unknowns are shown rather than invented.
              </p>
            </div>
          </div>

          <div className={`hero analysis-panel ${loading ? "is-analysing" : ""}`}>
            {loading ? (
              <div className="analysis-progress" aria-live="polite">
                <div className="analysis-progress-head">
                  <div>
                    <div className="eyebrow" style={{ color: "#d8f6ff" }}>
                      Understanding your business
                    </div>
                    <h2>{analysisComplete ? "Business understood" : analysisJob?.status === "QUEUED" ? "Analysis queued" : analysisJob?.status === "FAILED_RETRYABLE" ? "Analysis retry scheduled" : "SalesPilot is analysing your website"}</h2>
                  </div>
                  <span className="analysis-percent">
                    {analysisJob?.progress ?? 0}%
                  </span>
                </div>

                <div className="analysis-track" aria-hidden="true">
                  <span style={{ width: `${analysisJob?.progress ?? 0}%` }} />
                </div>

                <div className="analysis-stage-list">
                  {ANALYSIS_STAGES.map((stage, index) => {
                    const complete = analysisComplete || index < analysisStage;
                    const active = !analysisComplete && index === analysisStage;

                    return (
                      <div
                        key={stage.label}
                        className={`analysis-stage ${complete ? "complete" : ""} ${active ? "active" : ""}`}
                      >
                        <span className="analysis-stage-icon">
                          {complete ? <CheckCircle2 size={18} /> : active ? <Sparkles size={17} /> : <span />}
                        </span>
                        <div>
                          <strong>{stage.label}</strong>
                          {(active || complete) && <p>{stage.detail}</p>}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <p className="analysis-privacy">
                  SalesPilot only analyses information that is publicly available on your website.
                </p>
              </div>
            ) : (
              <>
                <div className="eyebrow" style={{ color: "#d8f6ff" }}>
                  One input. A complete strategy.
                </div>
                <h2>Your first campaign should not start with forms.</h2>
                <p>
                  SalesPilot first learns the business, then proposes the answer. You stay in control while the complexity remains in the background.
                </p>
              </>
            )}
          </div>
        </div>
      )}

      {step === 1 && result && (
        <div>
          <div className="page-head">
            <div>
              <div className="eyebrow">
                What SalesPilot understood
              </div>

              <h2 className="page-title">
                {result.payload.company.name}
              </h2>

              <div className="page-subtitle">
                {result.payload.company.summary}
              </div>
            </div>

            <div className="confidence-summary"><span className="badge green">{confidenceLabel} · {pagesRead} pages read</span><small>{result.payload.offers.length > 0 ? "✓ Offer identified" : ""} {result.payload.idealCustomers.length > 0 ? "· ✓ Buyers identified" : ""} {result.payload.positioning.strongestValueProposition ? "· ✓ Positioning understood" : ""}</small></div>
          </div>

          <div className="grid cols-3">
            <div className="card">
              <div className="card-title">Core offer</div>

              <div
                className="metric-value"
                style={{ fontSize: 21 }}
              >
                {result.payload.offers[0]?.name}
              </div>

              <p className="card-subtitle">
                {result.payload.offers[0]?.description}
              </p>
            </div>

            <div className="card">
              <div className="card-title">
                Best-fit customers
              </div>

              <div
                className="metric-value"
                style={{ fontSize: 21 }}
              >
                {result.payload.idealCustomers[0]?.segment}
              </div>

              <p className="card-subtitle">
                {result.payload.idealCustomers[0]?.buyerRoles.join(
                  " · ",
                )}
              </p>
            </div>

            <div className="card">
              <div className="card-title">
                Strongest angle
              </div>

              <div
                className="metric-value"
                style={{ fontSize: 21 }}
              >
                {
                  result.payload.positioning
                    .strongestValueProposition
                }
              </div>

              <p className="card-subtitle">
                Tone:{" "}
                {result.payload.positioning.recommendedTone.join(
                  ", ",
                )}
              </p>
            </div>
          </div>

          <div className="section card recommendation">
            <h3>Recommended first commercial approach</h3>
            <p>{result.payload.campaigns[0]?.messageAngle}</p>
          </div>

          {result.payload.unknowns.length > 0 && (
            <details className="section card soft confirmation-details">
              <summary>Worth confirming <span>{result.payload.unknowns.length}</span></summary>
              <p className="card-subtitle">{result.payload.unknowns.join(" · ")}</p>
            </details>
          )}
        </div>
      )}

      {step === 2 && result && (
        <div>
          <div className="page-head">
            <div>
              <div className="eyebrow">
                Recommended campaigns
              </div>

              <h2 className="page-title">
                Choose the strategy to launch first
              </h2>

              <div className="page-subtitle">
                Ranked using your offer, likely buyer need,
                evidence strength and message fit.
              </div>
            </div>
          </div>

          <div className="proposal-grid">
            {proposals.map((proposal, index) => {
              const matchLabel = campaignMatchLabel(proposal.fitScore);

              const isSelected = selected === index;

              return (
                <button
                  key={proposal.id}
                  onClick={() => setSelected(index)}
                  className={`card proposal ${
                    isSelected ? "selected" : ""
                  }`}
                  aria-pressed={isSelected}
                >
                  <div className="proposal-head">
                    <span className="match-label">
                      {matchLabel}
                    </span>

                    <span className="fit-score">
                      <span>Fit</span>
                      <strong>{proposal.fitScore}</strong>
                      <span>/100</span>
                    </span>
                  </div>

                  <h3>{proposal.name}</h3>

                  <div className="proposal-section">
                    <div className="proposal-section-label">
                      <Target size={15} />
                      Audience
                    </div>

                    <p>{proposal.audience}</p>
                  </div>

                  <div className="proposal-section">
                    <div className="proposal-section-label">
                      <Users size={15} />
                      Buyers
                    </div>

                    <p>
                      {proposal.buyerRoles.join(" · ")}
                    </p>
                  </div>

                  <div className="proposal-section">
                    <div className="proposal-section-label">
                      <MessageSquareReply size={15} />
                      Recommended message
                    </div>

                    <p>{proposal.messageAngle}</p>
                  </div>

                  <div
                    className={`proposal-select ${
                      isSelected ? "active" : ""
                    }`}
                  >
                    {isSelected ? (
                      <>
                        <CheckCircle2 size={16} />
                        Selected campaign
                      </>
                    ) : (
                      "Select campaign"
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {step === 3 && chosen && (
        <div>
          <div className="hero">
            <div
              className="eyebrow"
              style={{ color: "#d8f6ff" }}
            >
              Ready to launch
            </div>

            <h2>{chosen.name}</h2>

            <p>
              {chosen.objective}. SalesPilot will work from the
              approved strategy and bring you in only when
              judgement is useful.
            </p>

            <div className="grid cols-3 section">
              <div>
                <div
                  className="label"
                  style={{ color: "#cce0ff" }}
                >
                  Campaign mode
                </div>

                <div className="value">
                  {chosen.recommendedMode === "approval"
                    ? "Approval mode"
                    : chosen.recommendedMode === "autopilot"
                      ? "Autopilot"
                      : "Assisted mode"}
                </div>
              </div>

              <div>
                <div
                  className="label"
                  style={{ color: "#cce0ff" }}
                >
                  Fit
                </div>

                <div className="value">
                  {chosen.fitScore}/100
                </div>
              </div>

              <div>
                <div
                  className="label"
                  style={{ color: "#cce0ff" }}
                >
                  Initial sending
                </div>

                <div className="value">
                  Recipient-local 08:00–18:00
                </div>
              </div>
            </div>

            <button
              className="button section"
              type="button"
              onClick={launchCampaign}
              disabled={launching}
            >
              {launching
                ? "Launching…"
                : "Launch campaign"}

              {!launching && <ArrowRight size={16} />}
            </button>

            {launchError && (
              <div
                className="website-error launch-error"
                role="alert"
              >
                <div className="website-error-icon">
                  <AlertTriangle size={19} />
                </div>

                <div className="website-error-copy">
                  <strong>{launchError.title}</strong>
                  <p>{launchError.message}</p>
                  <span>{launchError.hint}</span>
                </div>

                <button
                  className="button secondary website-error-action"
                  type="button"
                  onClick={launchCampaign}
                  disabled={launching}
                >
                  Try again
                </button>
              </div>
            )}
          </div>

          <div className="section card">
            <div className="card-title">
              Why this campaign
            </div>

            <div className="grid cols-3 section">
              {chosen.why
                .slice(0, 3)
                .map((reason, index) => (
                  <div key={reason}>
                    <strong>
                      {index + 1}. Evidence-backed fit
                    </strong>

                    <p className="card-subtitle">
                      {reason}
                    </p>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}

      <div
        className="section"
        style={{
          display: "flex",
          justifyContent: "space-between",
        }}
      >
        <button
          className="button ghost"
          onClick={back}
          disabled={step === 0 || loading || launching}
        >
          Back
        </button>

        {step > 0 && step < 3 && (
          <button
            className="button primary"
            onClick={next}
            disabled={launching}
          >
            Continue
            <ArrowRight size={16} />
          </button>
        )}
      </div>
    </>
  );
}