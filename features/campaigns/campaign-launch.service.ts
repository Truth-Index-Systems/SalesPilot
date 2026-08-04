import "server-only";
import { databaseRequest } from "@/lib/database/postgrest";
import { CampaignSummarySchema, type CampaignSummary, type LaunchCampaignRequest } from "@/lib/campaigns/schemas";
import type { OrganisationContext } from "@/lib/auth/organisation-context";

export async function launchCampaignService(input: LaunchCampaignRequest, context: OrganisationContext): Promise<CampaignSummary> {
  const rows = await databaseRequest<Record<string, unknown>[]>("rpc/launch_campaign", {
    method: "POST",
    body: JSON.stringify({
      p_organisation_id: context.organisationId,
      p_created_by: context.userId,
      p_idempotency_key: input.idempotencyKey,
      p_website_url: input.websiteUrl,
      p_analysis: input.businessAnalysis,
      p_selected_proposal_id: input.selectedProposalId,
    }),
  });
  const row = rows[0];
  return CampaignSummarySchema.parse({
    id: row.id, name: row.name, objective: row.objective, status: row.status,
    automationMode: row.automation_mode, fitScore: row.fit_score, audience: row.audience,
    createdAt: row.created_at, latestProgress: row.latest_progress ?? null,
  });
}
