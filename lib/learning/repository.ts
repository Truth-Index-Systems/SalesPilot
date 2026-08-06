import "server-only";
import { databaseRequest } from "@/lib/database/postgrest";
import { mapEngagementLearningRecord } from "./mapper";
import type { EngagementLearningBuilderResult, EngagementLearningRecord } from "./types";

const EMPTY: EngagementLearningBuilderResult = { inspected: 0, created: 0, existing: 0, skipped: 0 };

export async function runEngagementLearningBuilder(schedulerRunId: string): Promise<EngagementLearningBuilderResult> {
  const result = await databaseRequest<EngagementLearningBuilderResult | EngagementLearningBuilderResult[]>(
    "rpc/run_engagement_learning_builder",
    { method: "POST", body: JSON.stringify({ p_scheduler_run_id: schedulerRunId }) },
  );
  return (Array.isArray(result) ? result[0] : result) ?? EMPTY;
}

export async function getEngagementLearningRecord(organisationId: string, engagementId: string): Promise<EngagementLearningRecord | null> {
  const rows = await databaseRequest<unknown[]>(
    `engagement_learning_records?organisation_id=eq.${organisationId}&engagement_id=eq.${engagementId}&limit=1`,
  );
  return rows[0] ? mapEngagementLearningRecord(rows[0]) : null;
}
