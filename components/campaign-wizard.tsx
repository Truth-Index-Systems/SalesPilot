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
  knowledgeMatchStatus?: string;
  knowledgeMatch?: unknown | null;
};

type AnonymousAllowance = { limit: number; used: number; remaining: number };

type AnalysisJobResponse =
  | { ok: true; job: AnalysisJob; accessToken?: string; allowance?: AnonymousAllowance | null }
  | { ok: false; error: DiscoveryError; allowance?: AnonymousAllowance | null };

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
  { label: "Website connected", detail: "Reading your public website securely." },
  { label: "Learning what you sell", detail: "Reviewing your offer, proof points and positioning." },
  { label: "Building your Business DNA", detail: "Turning the evidence into a clear commercial picture." },
  { label: "Finding ideal customers and growth angles", detail: "Matching your strengths to the markets most worth your time." },
  { label: "Preparing recommendations", detail: "Ranking focused campaigns before opening your review." },
] as const;

type CampaignDraft = {
  version: 2;
  savedAt: number;
  step: number;
  result: AiEnvelope<BusinessDnaPayload>;
  selectedProposalId: string;
  websiteUrl: string;
  pagesRead: number;
  knowledgeMatch?: unknown | null;
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
      knowledgeMatch: parsed.knowledgeMatch ?? null,
    };
  } catch {
    localStorage.removeItem(CAMPAIGN_DRAFT_KEY);
    sessionStorage.removeItem(LEGACY_CAMPAIGN_DRAFT_KEY);
    return null;
  }
}

export function CampaignWizard({ isAuthenticated = false }: { isAuthenticated?: boolean }) {
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
  const [knowledgeMatch, setKnowledgeMatch] = useState<unknown | null>(null);
  const [launching, setLaunching] = useState(false);
  const [launchError, setLaunchError] = useState<LaunchError | null>(null);
  const [anonymousAllowance, setAnonymousAllowance] = useState<AnonymousAllowance | null>(null);

  useEffect(() => {
    if (isAuthenticated) return;
    let cancelled = false;
    fetch("/api/intelligence/business-discovery", { method: "GET", cache: "no-store" })
      .then(response => response.json())
      .then(data => {
        if (!cancelled && data?.ok && data?.allowance) setAnonymousAllowance(data.allowance as AnonymousAllowance);
      })
      .catch(reason => console.warn("Anonymous analysis allowance could not be loaded", reason));
    return () => { cancelled = true; };
  }, [isAuthenticated]);

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
    setKnowledgeMatch(draft.knowledgeMatch ?? null);
    setStep(draft.step);

    localStorage.setItem(CAMPAIGN_DRAFT_KEY, JSON.stringify(draft));
    sessionStorage.removeItem(LEGACY_CAMPAIGN_DRAFT_KEY);
  }, []);

  useEffect(() => {
    if (!analysisJob) return;
    const stageMap: Record<string, number> = {
      QUEUED: 0,
      READING_WEBSITE: 0,
      WEBSITE_CONNECTED: 1,
      BUILDING_BUSINESS_DNA: 2,
      BUSINESS_DNA_READY: 3,
      GROWTH_STRATEGY_RUNNING: 3,
      PREPARING_RECOMMENDATIONS: 4,
      COMPLETE: 4,
    };
    // Checklist state is derived from the same persisted percentage/stage as the
    // badge, so background handoffs cannot make the UI run ahead of reality.
    const failedStage = analysisJob.progress >= 92 ? 4 : analysisJob.progress >= 70 ? 3 : analysisJob.progress >= 20 ? 2 : analysisJob.progress >= 8 ? 1 : 0;
    setAnalysisStage(analysisJob.stage === "FAILED" ? failedStage : (stageMap[analysisJob.stage] ?? failedStage));
    setAnalysisComplete(analysisJob.status === "COMPLETED");
  }, [analysisJob]);

  useEffect(() => {
    if (result) return;
    // Remove the superseded persistent token copy from older builds.
    localStorage.removeItem(ANALYSIS_JOB_KEY);
    const raw = sessionStorage.getItem(ANALYSIS_JOB_KEY);
    if (!raw) return;
    try {
      const saved = JSON.parse(raw) as SavedAnalysisJob;
      if (!saved.jobId || !saved.accessToken || Date.now() - saved.savedAt > CAMPAIGN_DRAFT_MAX_AGE_MS) {
        sessionStorage.removeItem(ANALYSIS_JOB_KEY);
        return;
      }
      void monitorAnalysisJob(saved.jobId, saved.accessToken, true);
    } catch {
      sessionStorage.removeItem(ANALYSIS_JOB_KEY);
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
      knowledgeMatch,
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
    const response = await fetch("/api/intelligence/business-discovery/status", {
      method: "POST",
      cache: "no-store",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jobId, accessToken }),
    });
    const data = (await response.json()) as AnalysisJobResponse;
    if (!data.ok) throw new Error(data.error.message);
    return data.job;
  }

  async function runAnalysisJob(jobId: string, accessToken: string) {
    const response = await fetch("/api/intelligence/business-discovery/run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jobId, accessToken }),
    });
    const data = await response.json().catch(() => null) as { ok?: boolean; error?: DiscoveryError } | null;
    if (!response.ok || data?.ok === false) {
      throw new Error(data?.error?.message ?? "Business analysis request failed.");
    }
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
        if (retryDue) void runAnalysisJob(jobId, accessToken).catch(reason => console.warn("Business analysis dispatch failed", reason));
      } else if (job.status === "RUNNING" && resume) {
        void runAnalysisJob(jobId, accessToken).catch(reason => console.warn("Business analysis resume dispatch failed", reason));
      }

      for (let count = 0; count < 180; count += 1) {
        if (job.status === "COMPLETED") {
          if (!job.analysis || !job.canonicalUrl) throw new Error("Completed analysis did not contain a result.");
          setAnalysisComplete(true);
          setResult(job.analysis);
          setKnowledgeMatch(job.knowledgeMatchStatus === "COMPLETED" ? (job.knowledgeMatch ?? null) : null);
          setPagesRead(job.pagesRead);
          setUrl(job.canonicalUrl);
          setSelected(0);
          setStep(1);
          sessionStorage.removeItem(ANALYSIS_JOB_KEY);
          return;
        }
        if (job.status === "FAILED_TERMINAL" || job.status === "CANCELLED") {
          setError(job.error ?? { code: "ANALYSIS_FAILED", title: "MarketRoute couldn't complete the analysis", message: "The saved analysis ended before completion.", hint: "Check the website and try again." });
          return;
        }
        if (job.status === "QUEUED") {
          // Background OpenAI work deliberately returns the persisted owner job
          // to QUEUED while the dedicated collector obtains the provider result.
          // Once nextRetryAt is due we must wake the SAME job again so it can
          // consume the cached completion. Without this hand-off the browser can
          // poll a perfectly healthy queued analysis forever.
          setError(null);
          const retryAt = job.nextRetryAt ? new Date(job.nextRetryAt).getTime() : Date.now();
          const waitMs = Math.max(1_000, Math.min(5_000, retryAt - Date.now()));
          await new Promise(resolve => window.setTimeout(resolve, waitMs));
          if (!job.nextRetryAt || new Date(job.nextRetryAt).getTime() <= Date.now()) {
            void runAnalysisJob(jobId, accessToken).catch(reason => console.warn("Business analysis queued resume dispatch failed", reason));
          }
          job = await fetchAnalysisJob(jobId, accessToken);
          setAnalysisJob(job);
          continue;
        }
        if (job.status === "FAILED_RETRYABLE") {
          // Retryable infrastructure/structured-output interruptions are an
          // implementation detail. Keep the analysis experience alive and
          // automatically resume when the persisted retry becomes due.
          setError(null);
          const retryAt = job.nextRetryAt ? new Date(job.nextRetryAt).getTime() : Date.now();
          const waitMs = Math.max(1_000, Math.min(5_000, retryAt - Date.now()));
          await new Promise(resolve => window.setTimeout(resolve, waitMs));
          if (!job.nextRetryAt || new Date(job.nextRetryAt).getTime() <= Date.now()) {
            void runAnalysisJob(jobId, accessToken).catch(reason => console.warn("Business analysis automatic retry dispatch failed", reason));
          }
          job = await fetchAnalysisJob(jobId, accessToken);
          setAnalysisJob(job);
          continue;
        }
        await new Promise(resolve => window.setTimeout(resolve, 2000));
        job = await fetchAnalysisJob(jobId, accessToken);
        setAnalysisJob(job);
      }
      setError({ code: "ANALYSIS_STILL_RUNNING", title: "Analysis is still running", message: "MarketRoute has saved this analysis and will not lose it.", hint: "You can leave this page and return later." });
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
      setError({ code: "INVALID_REQUEST", title: "Enter your company website", message: "MarketRoute needs a public website address before it can begin.", hint: "Enter an address such as yourcompany.com." });
      return;
    }

    setLoading(true);
    setAnalysisComplete(false);
    setAnalysisJob(null);
    setKnowledgeMatch(null);
    setError(null);
    setUrl(normalisedUrl);

    try {
      const response = await fetch("/api/intelligence/business-discovery", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ website: normalisedUrl }),
      });
      const data = (await response.json()) as AnalysisJobResponse;
      if (data.allowance) setAnonymousAllowance(data.allowance);
      if (!data.ok || !data.accessToken) {
        setError(data.ok ? { code: "ANALYSIS_FAILED", title: "Analysis could not start", message: "The saved analysis token was not returned.", hint: "Please try again." } : data.error);
        return;
      }
      const saved = { jobId: data.job.id, accessToken: data.accessToken, savedAt: Date.now() } satisfies SavedAnalysisJob;
      sessionStorage.setItem(ANALYSIS_JOB_KEY, JSON.stringify(saved));
      setAnalysisJob(data.job);
      // monitorAnalysisJob owns the single background dispatch. Starting it here as
      // well caused two concurrent claim attempts for the same persisted job.
      await monitorAnalysisJob(data.job.id, data.accessToken);
    } catch (reason) {
      console.error("Website analysis request failed", reason);
      setError({ code: "SERVICE_UNAVAILABLE", title: "We couldn't start the analysis", message: "MarketRoute could not save the website analysis job.", hint: "Check your connection and try again in a moment." });
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
        knowledgeMatch,
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
          knowledgeMatch,
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
          "MarketRoute could not connect to campaign storage.",
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
              MarketRoute will read your public website, understand
              what you sell, who it helps and the strongest first
              route to potential customers.
            </p>

            {!isAuthenticated && anonymousAllowance && (
              <div className={`anonymous-analysis-balance ${anonymousAllowance.remaining === 0 ? "is-empty" : ""}`} aria-live="polite">
                <Sparkles size={16} />
                <div>
                  <strong>{anonymousAllowance.remaining > 0 ? `${anonymousAllowance.remaining} complimentary website ${anonymousAllowance.remaining === 1 ? "analysis" : "analyses"} remaining` : "Complimentary analyses complete"}</strong>
                  <span>{anonymousAllowance.remaining > 0 ? "Explore MarketRoute before creating an account." : "Create an account or sign in to keep building your route to customers."}</span>
                </div>
              </div>
            )}

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
                  {loading ? "Learning your business…" : "Start with my website"}
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

                  {error.code === "ANALYSIS_LIMIT_REACHED" ? (
                    <div className="website-error-actions">
                      <button className="button primary website-error-action" type="button" onClick={() => router.push(`/sign-up?next=${encodeURIComponent("/campaigns/new")}`)}>Create account</button>
                      <button className="button secondary website-error-action" type="button" onClick={() => router.push(`/sign-in?next=${encodeURIComponent("/campaigns/new")}`)}>Sign in</button>
                    </div>
                  ) : error.code.startsWith("AI_") ? (
                    <button
                      className="button secondary website-error-action"
                      type="button"
                      onClick={() => router.push("/settings")}
                    >
                      Open automation settings
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
                What MarketRoute looks for
              </div>

              <p className="card-subtitle">
                Your offer, ideal customers, proof points, buyer language
                and the reasons someone should choose you. Unknowns stay
                visible rather than being guessed.
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
                    <h2>{analysisComplete ? "Business understood" : "MarketRoute is learning your business"}</h2>
                  </div>
                  <span className="analysis-percent">
                    {analysisJob?.progress ?? 0}%
                  </span>
                </div>

                <div className="analysis-coffee-note">
                  <span className="analysis-coffee-icon" aria-hidden="true">☕</span>
                  <div>
                    <strong>Make yourself a coffee while MarketRoute gets to work.</strong>
                    <p>This is the only time we'll perform a full analysis of your business. Every opportunity, contact and outreach recommendation is built from this foundation.</p>
                  </div>
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
                  MarketRoute only analyses information that is publicly available on your website.
                </p>
              </div>
            ) : (
              <>
                <div className="eyebrow" style={{ color: "#d8f6ff" }}>
                  One input. A route to customers.
                </div>
                <h2>Start with your business, not a blank CRM.</h2>
                <p>
                  MarketRoute learns what makes your business worth buying from, then turns that into a focused route to potential customers. You stay in control while the research stays in the background.
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
                What MarketRoute learned
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
                Recommended growth angles
              </div>

              <h2 className="page-title">
                Choose where MarketRoute should look first
              </h2>

              <div className="page-subtitle">
                Ranked around your offer, likely customer need,
                evidence strength and how naturally your message fits.
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
                      Best-fit companies
                    </div>

                    <p>{proposal.audience}</p>
                  </div>

                  <div className="proposal-section">
                    <div className="proposal-section-label">
                      <Users size={15} />
                      People to reach
                    </div>

                    <p>
                      {proposal.buyerRoles.join(" · ")}
                    </p>
                  </div>

                  <div className="proposal-section">
                    <div className="proposal-section-label">
                      <MessageSquareReply size={15} />
                      Why they should care
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
                        Selected
                      </>
                    ) : (
                      "Choose this route"
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
              Ready to find customers
            </div>

            <h2>{chosen.name}</h2>

            <p>
              {chosen.objective}. MarketRoute will use this direction to find
              strong-fit companies, build credible routes in and bring you
              the decisions worth your attention.
            </p>

            <div className="grid cols-3 section">
              <div>
                <div
                  className="label"
                  style={{ color: "#cce0ff" }}
                >
                  Working mode
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
                  Outreach window
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
                : "Start finding customers"}

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
              Why this is a strong starting point
            </div>

            <div className="grid cols-3 section">
              {chosen.why
                .slice(0, 3)
                .map((reason, index) => (
                  <div key={reason}>
                    <strong>
                      {index + 1}. Commercial signal
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