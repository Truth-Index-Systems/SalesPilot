import "server-only";
import { databaseRequest } from "@/lib/database/postgrest";
import type { OpportunitySyncSummary } from "./domain";

const EMPTY: OpportunitySyncSummary = {
  created: 0,
  updated: 0,
  ranked: 0,
  ready: 0,
  needsContact: 0,
};

/**
 * Materialises the opportunity foundation from existing company/contact truth.
 * This is deterministic and makes no AI or web requests. The pipeline scheduler
 * is the only runtime caller.
 */
export async function syncOpportunityFoundations(schedulerRunId: string): Promise<OpportunitySyncSummary> {
  const result = await databaseRequest<OpportunitySyncSummary | OpportunitySyncSummary[]>(
    "rpc/sync_opportunity_foundations",
    { method: "POST", body: JSON.stringify({ p_scheduler_run_id: schedulerRunId }) },
  );
  if (Array.isArray(result)) return result[0] ?? EMPTY;
  return result ?? EMPTY;
}
