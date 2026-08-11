import "server-only";
import { databaseRequest } from "@/lib/database/postgrest";
import type { CieR4CommercialDecision } from "./commercial-decision-authority";

export type CieR4ApplySummary = Readonly<{
  applied: number;
  rejected: number;
  held: number;
  researchRequired: number;
  candidates: number;
}>;

const EMPTY: CieR4ApplySummary = Object.freeze({ applied: 0, rejected: 0, held: 0, researchRequired: 0, candidates: 0 });

export async function persistCieR4CommercialDecision(decision: CieR4CommercialDecision, schedulerRunId: string): Promise<void> {
  if (decision.authorityMode !== "AUTHORITATIVE") throw new Error("CIE_R4_AUTHORITY_VIOLATION:NON_AUTHORITATIVE_DECISION");
  await databaseRequest("rpc/persist_cie_r4_commercial_decision", {
    method: "POST",
    body: JSON.stringify({
      p_scheduler_run_id: schedulerRunId,
      p_opportunity_id: decision.opportunityId,
      p_reality_id: decision.realityId,
      p_target_entity_id: decision.targetEntityId,
      p_reality_state: decision.realityState,
      p_disposition: decision.disposition,
      p_decision_json: decision,
    }),
  });
}

/** Apply only already-persisted CIE decisions. No legacy fallback is permitted. */
export async function runCieR4CommercialDecisionAuthority(schedulerRunId: string): Promise<CieR4ApplySummary> {
  const result = await databaseRequest<CieR4ApplySummary | CieR4ApplySummary[]>("rpc/apply_cie_r4_commercial_decision_authority", {
    method: "POST",
    body: JSON.stringify({ p_scheduler_run_id: schedulerRunId }),
  });
  return (Array.isArray(result) ? result[0] : result) ?? EMPTY;
}
