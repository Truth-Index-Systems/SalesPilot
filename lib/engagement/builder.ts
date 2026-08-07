import "server-only";
import { databaseRequest } from "@/lib/database/postgrest";
import type { EngagementBuilderResult } from "./types";

const EMPTY_RESULT: EngagementBuilderResult = {
  builderRunId: null,
  schedulerRunId: "",
  status: "COMPLETED",
  created: 0,
  updated: 0,
  cancelled: 0,
  readyForDraft: 0,
  needsRoute: 0,
  startedAt: null,
  completedAt: null,
};

/**
 * Runs the scheduler-owned Engagement Builder once for a scheduler cycle.
 *
 * The database function provides single-run ownership, records the execution,
 * and delegates opportunity synchronisation to the frozen idempotent bridge.
 * This phase deliberately performs no AI generation and no sending.
 */
export async function buildEngagements(
  schedulerRunId: string,
): Promise<EngagementBuilderResult> {
  if (!schedulerRunId) throw new Error("ENGAGEMENT_BUILDER_REQUIRES_SCHEDULER_RUN");

  const result = await databaseRequest<EngagementBuilderResult | EngagementBuilderResult[]>(
    "rpc/run_engagement_builder_owned",
    {
      method: "POST",
      body: JSON.stringify({ p_scheduler_run_id: schedulerRunId }),
    },
  );

  const row = Array.isArray(result) ? result[0] : result;
  return row ?? { ...EMPTY_RESULT, schedulerRunId };
}
