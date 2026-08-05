import "server-only";
import { requireOrganisationContext } from "@/lib/auth/organisation-context";
import { databaseRequest } from "@/lib/database/postgrest";
import type { EngagementOverview, EngagementSyncSummary } from "./domain";

export async function listEngagements(): Promise<EngagementOverview[]> {
  const context = await requireOrganisationContext();
  return databaseRequest<EngagementOverview[]>(
    `opportunity_engagement_overview?organisation_id=eq.${context.organisationId}&order=source_opportunity_rank.asc,prepared_at.asc`,
  );
}

export async function syncOpportunityEngagementBridge(schedulerRunId: string): Promise<EngagementSyncSummary> {
  const empty: EngagementSyncSummary = { created: 0, updated: 0, cancelled: 0, readyForDraft: 0, needsRoute: 0 };
  const result = await databaseRequest<EngagementSyncSummary | EngagementSyncSummary[]>(
    "rpc/sync_opportunity_engagement_bridge",
    { method: "POST", body: JSON.stringify({ p_scheduler_run_id: schedulerRunId }) },
  );
  if (Array.isArray(result)) return result[0] ?? empty;
  return result ?? empty;
}
