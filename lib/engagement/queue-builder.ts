import "server-only";
import { databaseRequest } from "@/lib/database/postgrest";

export type EngagementQueueBuilderResult = {
  inspected: number;
  queued: number;
  held: number;
  already_queued: number;
};

const EMPTY: EngagementQueueBuilderResult = { inspected: 0, queued: 0, held: 0, already_queued: 0 };

/**
 * Converts human-approved outreach into durable, recipient-local send instructions.
 * This does not send messages. Unknown timezone or route truth is held safely.
 */
export async function buildEngagementSendQueue(schedulerRunId: string): Promise<EngagementQueueBuilderResult> {
  if (!schedulerRunId) throw new Error("ENGAGEMENT_QUEUE_BUILDER_REQUIRES_SCHEDULER_RUN");
  const result = await databaseRequest<EngagementQueueBuilderResult | EngagementQueueBuilderResult[]>(
    "rpc/run_engagement_queue_builder_owned",
    { method: "POST", body: JSON.stringify({ p_scheduler_run_id: schedulerRunId }) },
  );
  return (Array.isArray(result) ? result[0] : result) ?? EMPTY;
}
