import { notFound } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/shell";
import { Card, Metric, PageHeader } from "@/components/ui";
import { AutonomyHealthRefresh } from "@/components/autonomy-health-refresh";
import { requirePageUser } from "@/lib/auth/page-user";
import { requireOrganisationContext } from "@/lib/auth/organisation-context";
import { getAutonomyDiagnostics, type PipelineJobDiagnostic } from "@/lib/pipeline/diagnostics";
import { getAiGovernance } from "@/lib/ai/governance-repository";
import { AiGovernanceControls } from "@/components/ai-governance-controls";
import { jobStateLabel, truthfulProgress } from "@/lib/pipeline/presentation";
import { getPipelineReleaseReadiness } from "@/lib/pipeline/release";
import { PipelineReleaseControls } from "@/components/pipeline-release-controls";

export const dynamic = "force-dynamic";

function ago(value: string | null): string {
  if (!value) return "Never";
  const seconds = Math.max(0, Math.round((Date.now() - Date.parse(value)) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
}

function stateLabel(job: PipelineJobDiagnostic) {
  const progress = truthfulProgress(job);
  if (progress !== null) return `${job.stage.replaceAll("_", " ")} · ${progress}%`;
  return jobStateLabel(job, { queued: "Queued", complete: "Complete", noResults: "No supported results" });
}

export default async function AutonomyHealthPage() {
  const user = await requirePageUser("/internal/autonomy");
  const context = await requireOrganisationContext();
  if (!['OWNER', 'ADMIN'].includes(context.role)) notFound();
  const [diagnostics, governance, release] = await Promise.all([getAutonomyDiagnostics(context.organisationId), getAiGovernance(context.organisationId), getPipelineReleaseReadiness(context.organisationId)]);
  const latestRun = diagnostics.runs[0] ?? null;
  const activeJobs = diagnostics.jobs.filter(job => ["QUEUED", "RUNNING", "FAILED_RETRYABLE"].includes(job.job_state));
  const recentJobs = diagnostics.jobs.slice(0, 20);

  return <AppShell title="Autonomy health" user={user}>
    <AutonomyHealthRefresh />
    <PageHeader eyebrow="Internal diagnostics" title="Autonomy health" subtitle="Authoritative scheduler, lease, retry and worker state for this workspace. This page refreshes every 15 seconds." action={<Link className="button secondary" href="/internal/ai-costs">AI cost baseline</Link>} />

    <Card className="section">
      <div className="card-title">Production readiness and G3 freeze</div>
      <div className="card-subtitle">Run a safe repair preview, start the controlled observation window, and freeze G3 only when persisted health checks pass.</div>
      <div className="grid cols-4 section">
        <Metric label="Release state" value={release.readiness?.release_status ?? "DRAFT"} foot={release.readiness?.frozen_at ? `Frozen ${ago(release.readiness.frozen_at)}` : "Genesis stabilisation S10"} tone={release.readiness?.release_status === "FROZEN" ? "positive" : undefined}/>
        <Metric label="Expired leases" value={String(release.readiness?.expired_leases ?? 0)} foot="Must remain zero" tone={(release.readiness?.expired_leases ?? 0) ? "negative" : "positive"}/>
        <Metric label="Terminal failures" value={String(release.readiness?.terminal_failures ?? 0)} foot="Must remain zero" tone={(release.readiness?.terminal_failures ?? 0) ? "negative" : "positive"}/>
        <Metric label="Overdue retries" value={String(release.readiness?.overdue_retries ?? 0)} foot="Scheduler should clear these" tone={(release.readiness?.overdue_retries ?? 0) ? "negative" : "positive"}/>
      </div>
      <PipelineReleaseControls status={release.readiness?.release_status ?? "DRAFT"} observationEndsAt={release.readiness?.observation_ends_at ?? null} ready={(release.readiness?.expired_leases ?? 0) === 0 && (release.readiness?.terminal_failures ?? 0) === 0 && (release.readiness?.overdue_retries ?? 0) === 0}/>
      {release.repairs[0] && <details><summary>Latest repair run</summary><pre className="diagnostic-json">{JSON.stringify(release.repairs[0], null, 2)}</pre></details>}
    </Card>

    <div className="grid cols-4">
      <Metric label="Engine" value={diagnostics.health?.engine_state ?? "Unknown"} foot={diagnostics.health?.updated_at ? `Updated ${ago(diagnostics.health.updated_at)}` : "No heartbeat recorded"} tone={diagnostics.health?.engine_state === "RUNNING" || diagnostics.health?.engine_state === "IDLE" ? "positive" : "negative"}/>
      <Metric label="Active jobs" value={String(diagnostics.summary.active)} foot={`${diagnostics.summary.running} running · ${diagnostics.summary.queued} queued`} />
      <Metric label="Retry queue" value={String(diagnostics.summary.retryScheduled)} foot={`${diagnostics.summary.dueRetries} due now`} tone={diagnostics.summary.dueRetries ? "negative" : "positive"}/>
      <Metric label="Lease health" value={String(diagnostics.summary.expiredLeases)} foot="Expired active leases" tone={diagnostics.summary.expiredLeases ? "negative" : "positive"}/>
    </div>


    <div className="grid cols-4 section">
      <Metric label="AI autonomy" value={governance.summary?.autonomy_enabled ? "Enabled" : "Stopped"} foot={process.env.SALESPILOT_AI_PLATFORM_ENABLED === "true" ? "Platform gate enabled" : "Platform gate disabled"} tone={governance.summary?.autonomy_enabled && process.env.SALESPILOT_AI_PLATFORM_ENABLED === "true" ? "positive" : "negative"}/>
      <Metric label="AI requests today" value={String(governance.summary?.requests_today ?? 0)} foot={`Limit ${governance.summary?.daily_request_limit ?? 0}`} />
      <Metric label="Estimated spend today" value={`$${Number(governance.summary?.cost_today_usd ?? 0).toFixed(2)}`} foot={`Limit $${Number(governance.summary?.daily_cost_limit_usd ?? 0).toFixed(2)}`} tone={Number(governance.summary?.cost_today_usd ?? 0) >= Number(governance.summary?.daily_cost_limit_usd ?? 0) ? "negative" : "positive"}/>
      <Metric label="Blocked requests" value={String(governance.summary?.blocked_today ?? 0)} foot="Stopped before OpenAI" tone={(governance.summary?.blocked_today ?? 0) ? "negative" : "positive"}/>
    </div>

    <Card className="section">
      <div className="card-title">AI governance and emergency stop</div>
      <div className="card-subtitle">Hard request and estimated-cost limits are checked before every OpenAI request. New work is disabled by default.</div>
      <AiGovernanceControls
        platformEnabled={process.env.SALESPILOT_AI_PLATFORM_ENABLED === "true"}
        enabled={governance.summary?.autonomy_enabled ?? false}
        dailyRequestLimit={governance.summary?.daily_request_limit ?? 25}
        dailyCostLimitUsd={Number(governance.summary?.daily_cost_limit_usd ?? 5)}
        campaignDailyRequestLimit={governance.summary?.campaign_daily_request_limit ?? 10}
        initialContactBurstSize={governance.summary?.initial_contact_burst_size ?? 3}
        requestsToday={governance.summary?.requests_today ?? 0}
        blockedToday={governance.summary?.blocked_today ?? 0}
        costTodayUsd={Number(governance.summary?.cost_today_usd ?? 0)}
        inputTokensToday={governance.summary?.input_tokens_today ?? 0}
        outputTokensToday={governance.summary?.output_tokens_today ?? 0}
      />
    </Card>

    <div className="grid cols-2 section">
      <Card>
        <div className="card-title">Scheduler</div>
        <div className="card-subtitle">The latest single-scheduler execution and why work was prepared.</div>
        <div className="detail-list section">
          <div><span>State</span><strong>{diagnostics.health?.engine_state ?? "Unknown"}</strong></div>
          <div><span>Latest run</span><strong>{latestRun ? ago(latestRun.started_at) : "No run recorded"}</strong></div>
          <div><span>Outcome</span><strong>{latestRun?.status ?? "Unknown"}</strong></div>
          <div><span>Recovered jobs</span><strong>{latestRun?.recovered_jobs ?? 0}</strong></div>
          <div><span>Lease expires</span><strong>{diagnostics.health?.lease_expires_at ? new Date(diagnostics.health.lease_expires_at).toLocaleString("en-GB") : "No active lease"}</strong></div>
        </div>
        {latestRun?.last_error && <div className="website-error section" role="alert"><strong>Scheduler error</strong><span>{latestRun.last_error}</span></div>}
        <details className="section"><summary>Preparation decision</summary><pre className="diagnostic-json">{JSON.stringify(latestRun?.preparation_json ?? {}, null, 2)}</pre></details>
        <details><summary>Worker outcomes</summary><pre className="diagnostic-json">{JSON.stringify(latestRun?.outcome_json ?? {}, null, 2)}</pre></details>
      </Card>

      <Card>
        <div className="card-title">Attention required</div>
        <div className="card-subtitle">Conditions that prevent the autonomous pipeline from progressing normally.</div>
        <div className="detail-list section">
          <div><span>Terminal failures</span><strong>{diagnostics.summary.terminalFailures}</strong></div>
          <div><span>Expired leases</span><strong>{diagnostics.summary.expiredLeases}</strong></div>
          <div><span>Retries due</span><strong>{diagnostics.summary.dueRetries}</strong></div>
        </div>
        {!diagnostics.summary.terminalFailures && !diagnostics.summary.expiredLeases && !diagnostics.summary.dueRetries
          ? <div className="empty-state compact"><strong>No intervention required</strong><span>The scheduler has no overdue recovery work for this workspace.</span></div>
          : <div className="website-error section" role="alert"><strong>Pipeline attention required</strong><span>Review the affected jobs below. S5 recovery will automatically handle retryable states.</span></div>}
      </Card>
    </div>

    <Card className="section">
      <div className="card-title">Active work</div>
      <div className="card-subtitle">Queued, running and retryable jobs. “Researching” appears only for a persisted RUNNING job.</div>
      {activeJobs.length ? <div className="table-wrap section"><table className="data-table"><thead><tr><th>Job</th><th>Campaign</th><th>Company</th><th>State</th><th>Attempts</th><th>Heartbeat</th><th>Reason</th></tr></thead><tbody>
        {activeJobs.map(job => <tr key={`${job.job_type}:${job.job_id}`}><td>{job.job_type === "COMPANY_DISCOVERY" ? "Company discovery" : "Contact discovery"}</td><td>{job.campaign_name}</td><td>{job.company_name ?? "Campaign-wide"}</td><td><span className={`badge ${job.job_state === "RUNNING" ? "green" : ""}`}>{stateLabel(job)}</span></td><td>{job.attempt_count}</td><td>{ago(job.last_heartbeat_at)}</td><td>{job.last_error_code ?? "Normal execution"}</td></tr>)}
      </tbody></table></div> : <div className="empty-state compact section"><strong>No active work</strong><span>The scheduler will create work when a campaign becomes eligible.</span></div>}
    </Card>

    <Card className="section">
      <div className="card-title">Recent job state</div>
      <div className="card-subtitle">The latest authoritative state for company and contact discovery jobs in this workspace.</div>
      <div className="table-wrap section"><table className="data-table"><thead><tr><th>Updated</th><th>Type</th><th>Campaign</th><th>Company</th><th>State</th><th>Result / error</th></tr></thead><tbody>
        {recentJobs.map(job => <tr key={`${job.job_type}:${job.job_id}`}><td>{ago(job.updated_at)}</td><td>{job.job_type.replaceAll("_", " ")}</td><td>{job.campaign_name}</td><td>{job.company_name ?? "—"}</td><td>{stateLabel(job)}</td><td>{job.last_error_message ?? (job.result_summary_json ? JSON.stringify(job.result_summary_json) : "No summary yet")}</td></tr>)}
      </tbody></table></div>
    </Card>

    <Card className="section">
      <div className="card-title">Recent AI usage</div>
      <div className="card-subtitle">Every reserved, completed, failed and blocked OpenAI request is recorded here.</div>
      <div className="table-wrap section"><table className="data-table"><thead><tr><th>Time</th><th>Work</th><th>Status</th><th>Model</th><th>Tokens</th><th>Searches</th><th>Cost</th><th>Reason</th></tr></thead><tbody>
        {governance.usage.map(row=><tr key={row.id}><td>{ago(row.created_at)}</td><td>{row.job_type.replaceAll("_"," ")}</td><td>{row.status}</td><td>{row.model}</td><td>{(row.input_tokens??0)+(row.output_tokens??0)}</td><td>{row.web_search_calls}</td><td>${Number(row.status==="SUCCEEDED"?row.actual_cost_usd:row.estimated_cost_usd).toFixed(4)}</td><td>{row.error_code??"—"}</td></tr>)}
      </tbody></table></div>
    </Card>

  </AppShell>;
}
