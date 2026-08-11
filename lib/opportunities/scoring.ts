import "server-only";
import { databaseRequest } from "@/lib/database/postgrest";
import type { OpportunityScoringSummary } from "./domain";

const EMPTY: OpportunityScoringSummary = {
  scored: 0,
  reranked: 0,
  recommended: 0,
  review: 0,
  needsContact: 0,
  needsEvidence: 0,
  lowPriority: 0,
};

/**
 * LEGACY SHADOW ONLY after CIE-R4. This function is retained for historical
 * comparison/audit and MUST NOT be called by the live scheduler or mutate live
 * commercial authority. Existing SQL scorers remain legacy artifacts pending
 * CIE-R8 eradication.
 */
export async function scoreOpportunityIntelligenceShadow(
  schedulerRunId: string,
): Promise<OpportunityScoringSummary> {
  throw new Error("CIE_R4_AUTHORITY_VIOLATION:LEGACY_OPPORTUNITY_SCORER_MAY_NOT_CONTROL_LIVE_STATE");
  /* istanbul ignore next -- unreachable legacy reference retained for eradication audit */
  const result = await databaseRequest<OpportunityScoringSummary | OpportunityScoringSummary[]>(
    "rpc/score_opportunity_intelligence",
    { method: "POST", body: JSON.stringify({ p_scheduler_run_id: schedulerRunId }) },
  );
  await databaseRequest<number>("rpc/apply_route_intelligence_opportunity_scoring", {
    method: "POST", body: JSON.stringify({ p_scheduler_run_id: schedulerRunId }),
  });
  // Final compatibility fence: the historical v2 scorer can calculate fit
  // components, but it cannot unlock review or expose legacy route scores while
  // G4.7 Route Intelligence is still BUILDING/EXPANDING/EXHAUSTED.
  await databaseRequest<number>("rpc/enforce_opportunity_route_readiness", {
    method: "POST", body: JSON.stringify({ p_scheduler_run_id: schedulerRunId }),
  });
  if (Array.isArray(result)) return result[0] ?? EMPTY;
  return result ?? EMPTY;
}
