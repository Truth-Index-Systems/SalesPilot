import "server-only";
import { databaseRequest } from "@/lib/database/postgrest";

export type SchedulerHealth = {
  run_id: string | null;
  owner: string | null;
  acquired_at: string | null;
  lease_expires_at: string | null;
  updated_at: string;
  engine_state: "IDLE" | "RUNNING" | "LEASE_EXPIRED";
  latest_run_status: string | null;
  latest_run_started_at: string | null;
  latest_run_completed_at: string | null;
  recovered_jobs: number | null;
  preparation_json: Record<string, unknown> | null;
  outcome_json: Record<string, unknown> | null;
  last_error: string | null;
};

export type PipelineJobDiagnostic = {
  job_type: "COMPANY_DISCOVERY" | "CONTACT_DISCOVERY";
  job_id: string;
  organisation_id: string;
  campaign_id: string;
  company_id: string | null;
  campaign_name: string;
  company_name: string | null;
  job_state: string;
  legacy_status: string;
  stage: string;
  progress: number;
  attempt_count: number;
  claimed_at: string | null;
  last_heartbeat_at: string | null;
  lease_expires_at: string | null;
  next_retry_at: string | null;
  last_error_code: string | null;
  last_error_message: string | null;
  scheduler_run_id: string | null;
  result_summary_json: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

export type SchedulerRun = {
  id: string;
  owner: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  preparation_json: Record<string, unknown> | null;
  outcome_json: Record<string, unknown> | null;
  recovered_jobs: number;
  last_error: string | null;
};

export async function getAutonomyDiagnostics(organisationId: string) {
  const org = encodeURIComponent(organisationId);
  const [healthRows, jobs, runs] = await Promise.all([
    databaseRequest<SchedulerHealth[]>("pipeline_scheduler_health?select=*&limit=1"),
    databaseRequest<PipelineJobDiagnostic[]>(
      `pipeline_job_diagnostics?organisation_id=eq.${org}&select=*&order=updated_at.desc&limit=100`,
    ),
    databaseRequest<SchedulerRun[]>(
      "pipeline_scheduler_runs?select=id,owner,status,started_at,completed_at,preparation_json,outcome_json,recovered_jobs,last_error&order=started_at.desc&limit=20",
    ),
  ]);

  const now = Date.now();
  const active = jobs.filter(job => ["QUEUED", "RUNNING", "FAILED_RETRYABLE"].includes(job.job_state));
  const expired = jobs.filter(job => job.job_state === "RUNNING" && job.lease_expires_at && Date.parse(job.lease_expires_at) <= now);
  const dueRetries = jobs.filter(job => job.job_state === "FAILED_RETRYABLE" && job.next_retry_at && Date.parse(job.next_retry_at) <= now);
  const terminal = jobs.filter(job => job.job_state === "FAILED_TERMINAL");

  return {
    health: healthRows[0] ?? null,
    jobs,
    runs,
    summary: {
      active: active.length,
      running: jobs.filter(job => job.job_state === "RUNNING").length,
      queued: jobs.filter(job => job.job_state === "QUEUED").length,
      retryScheduled: jobs.filter(job => job.job_state === "FAILED_RETRYABLE").length,
      dueRetries: dueRetries.length,
      expiredLeases: expired.length,
      terminalFailures: terminal.length,
    },
  };
}
