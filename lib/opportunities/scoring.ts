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
 * Scores opportunities from intelligence already persisted by G2 and G3.
 * It deliberately performs no model or web request and therefore consumes no
 * AI budget or Discovery Credits.
 */
export async function scoreOpportunityIntelligence(
  schedulerRunId: string,
): Promise<OpportunityScoringSummary> {
  const result = await databaseRequest<OpportunityScoringSummary | OpportunityScoringSummary[]>(
    "rpc/score_opportunity_intelligence",
    { method: "POST", body: JSON.stringify({ p_scheduler_run_id: schedulerRunId }) },
  );
  if (Array.isArray(result)) return result[0] ?? EMPTY;
  return result ?? EMPTY;
}
