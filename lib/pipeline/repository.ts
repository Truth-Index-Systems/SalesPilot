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


export async function recoverPipelineJobs(runId: string): Promise<number> {
  return Number(await databaseRequest<number>("rpc/recover_pipeline_jobs", {
    method: "POST",
    body: JSON.stringify({ p_run_id: runId }),
  }));
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


export type ContactDispatchPlan = {
  dispatch_count: number;
  campaign_id: string | null;
  mode: "NORMAL" | "INITIAL_BURST" | "BUDGET_FALLBACK" | "BUDGET_BLOCKED";
};

export async function planContactDiscoveryDispatch(runId: string): Promise<ContactDispatchPlan> {
  const estimatedCostUsd = Number(process.env.SALESPILOT_CONTACT_DISCOVERY_ESTIMATED_COST_USD ?? "0.35");
  const rows = await databaseRequest<ContactDispatchPlan[]>("rpc/plan_contact_discovery_dispatch", {
    method: "POST",
    body: JSON.stringify({ p_scheduler_run_id: runId, p_estimated_cost_usd: estimatedCostUsd }),
  });
  return rows[0] ?? { dispatch_count: 1, campaign_id: null, mode: "NORMAL" };
}

export async function recordPipelineSchedulerOutcome(runId: string, company: unknown, contact: unknown, opportunity: unknown = null): Promise<void> {
  await databaseRequest("rpc/record_pipeline_scheduler_outcome", {
    method: "POST",
    body: JSON.stringify({ p_run_id: runId, p_company_result: company, p_contact_result: contact, p_opportunity_result: opportunity }),
  });
}
