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
 * CIE-R4 foundation-only materialisation. Creates opportunity identity/workflow
 * shells from approved companies but intentionally does not select a contact,
 * infer route readiness, rank by fit, or unlock review. CIE owns all such authority.
 */
export async function syncOpportunityFoundations(schedulerRunId: string): Promise<OpportunitySyncSummary> {
  const result = await databaseRequest<OpportunitySyncSummary | OpportunitySyncSummary[]>(
    "rpc/sync_cie_r4_opportunity_foundations",
    { method: "POST", body: JSON.stringify({ p_scheduler_run_id: schedulerRunId }) },
  );
  if (Array.isArray(result)) return result[0] ?? EMPTY;
  return result ?? EMPTY;
}
