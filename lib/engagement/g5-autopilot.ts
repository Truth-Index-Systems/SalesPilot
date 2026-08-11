import "server-only";
import { databaseRequest } from "@/lib/database/postgrest";

export type G5AutopilotApprovalResult = {
  inspected: number;
  approved: number;
  held: number;
  reason?: string;
  strategyId?: string;
  engagementConfidence?: number;
};

type AutopilotRow = {
  inspected: number;
  approved: number;
  held: number;
  reason: string | null;
  strategy_id: string | null;
  engagement_confidence: number | null;
};

/**
 * Deterministic G5 R12 Autopilot approval gate.
 *
 * This performs no model call. R2-R7 have already established the strategy,
 * safety and independent PASS. Engagement Confidence is telemetry only. The SQL authority
 * independently revalidates campaign mode, Opportunity readiness and the live
 * immutable G4 route before READY_FOR_APPROVAL -> APPROVED is committed.
 */
export async function runG5AutopilotApproval(schedulerRunId: string): Promise<G5AutopilotApprovalResult> {
  const raw = await databaseRequest<AutopilotRow[] | AutopilotRow>("rpc/run_g5_autopilot_approval_owned", { method: "POST", body: JSON.stringify({ p_scheduler_run_id: schedulerRunId }) });
  const row = (Array.isArray(raw) ? raw[0] : raw) ?? {
    inspected: 0,
    approved: 0,
    held: 0,
    reason: null,
    strategy_id: null,
    engagement_confidence: null,
  };
  return {
    inspected: row.inspected,
    approved: row.approved,
    held: row.held,
    ...(row.reason ? { reason: row.reason } : {}),
    ...(row.strategy_id ? { strategyId: row.strategy_id } : {}),
    ...(typeof row.engagement_confidence === "number" ? { engagementConfidence: row.engagement_confidence } : {}),
  };
}
