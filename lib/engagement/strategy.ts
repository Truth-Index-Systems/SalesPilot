import "server-only";
import { databaseRequest } from "@/lib/database/postgrest";

export type EngagementStrategySyncResult = { updated: number; ready: number; needs_attention: number };

export async function syncEngagementStrategies(schedulerRunId: string): Promise<EngagementStrategySyncResult> {
  const rows = await databaseRequest<EngagementStrategySyncResult[]>("rpc/sync_engagement_strategies", {
    method: "POST",
    body: JSON.stringify({ p_scheduler_run_id: schedulerRunId }),
  });
  return rows[0] ?? { updated: 0, ready: 0, needs_attention: 0 };
}

export async function recordEngagementStage(input: { engagementId: string; schedulerRunId: string; stage: string; state: string; reason?: string; worker?: string; metadata?: Record<string, unknown> }) {
  await databaseRequest("rpc/record_engagement_pipeline_stage", { method: "POST", body: JSON.stringify({
    p_engagement_id: input.engagementId, p_scheduler_run_id: input.schedulerRunId, p_stage: input.stage,
    p_state: input.state, p_reason: input.reason ?? null, p_worker: input.worker ?? null, p_metadata: input.metadata ?? {},
  }) });
}

export async function reconcileEngagementFailures(schedulerRunId: string): Promise<number> {
  return Number(await databaseRequest<number>("rpc/reconcile_engagement_pipeline_failures", { method: "POST", body: JSON.stringify({ p_scheduler_run_id: schedulerRunId }) }));
}
