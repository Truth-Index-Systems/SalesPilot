import "server-only";
import { databaseRequest } from "@/lib/database/postgrest";

export type SchedulerLease = {
  acquired: boolean;
  run_id: string | null;
  lease_expires_at: string | null;
};

export type SchedulerPreparation = {
  campaignsInspected: number;
  companyJobsCreated: number;
  companyTopUpsQueued: number;
  contactJobsCreated: number;
  expiredCompanyLeasesRecovered: number;
  expiredContactLeasesRecovered: number;
};

export async function acquirePipelineSchedulerLease(owner: string, leaseSeconds = 240): Promise<SchedulerLease> {
  const rows = await databaseRequest<SchedulerLease[]>("rpc/acquire_pipeline_scheduler_lease", {
    method: "POST",
    body: JSON.stringify({ p_owner: owner, p_lease_seconds: leaseSeconds }),
  });
  return rows[0] ?? { acquired: false, run_id: null, lease_expires_at: null };
}

export async function releasePipelineSchedulerLease(runId: string): Promise<void> {
  await databaseRequest("rpc/release_pipeline_scheduler_lease", {
    method: "POST",
    body: JSON.stringify({ p_run_id: runId }),
  });
}

export async function preparePipelineWork(runId: string): Promise<SchedulerPreparation> {
  const result = await databaseRequest<SchedulerPreparation | SchedulerPreparation[]>("rpc/prepare_pipeline_work", {
    method: "POST",
    body: JSON.stringify({ p_run_id: runId }),
  });
  if (Array.isArray(result)) return result[0] ?? emptyPreparation();
  return result ?? emptyPreparation();
}

function emptyPreparation(): SchedulerPreparation {
  return {
    campaignsInspected: 0,
    companyJobsCreated: 0,
    companyTopUpsQueued: 0,
    contactJobsCreated: 0,
    expiredCompanyLeasesRecovered: 0,
    expiredContactLeasesRecovered: 0,
  };
}
