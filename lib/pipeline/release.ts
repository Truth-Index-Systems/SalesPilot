import "server-only";
import { databaseRequest } from "@/lib/database/postgrest";

export type PipelineReleaseReadiness = {
  organisation_id: string;
  release_status: "DRAFT" | "OBSERVING" | "PASSED" | "FAILED" | "FROZEN";
  started_at: string | null;
  observation_ends_at: string | null;
  completed_at: string | null;
  frozen_at: string | null;
  notes: string | null;
  expired_leases: number;
  terminal_failures: number;
  overdue_retries: number;
  active_jobs: number;
  last_job_activity: string | null;
};

export type PipelineRepairRun = {
  id: string;
  dry_run: boolean;
  status: string;
  summary_json: Record<string, unknown>;
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
};

export async function getPipelineReleaseReadiness(organisationId: string) {
  const org = encodeURIComponent(organisationId);
  const [readiness, repairs] = await Promise.all([
    databaseRequest<PipelineReleaseReadiness[]>(`pipeline_release_readiness?organisation_id=eq.${org}&select=*&limit=1`),
    databaseRequest<PipelineRepairRun[]>(`pipeline_repair_runs?organisation_id=eq.${org}&select=*&order=started_at.desc&limit=10`),
  ]);
  return { readiness: readiness[0] ?? null, repairs };
}
