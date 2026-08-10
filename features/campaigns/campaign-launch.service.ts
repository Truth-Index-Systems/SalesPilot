import "server-only";
import { databaseRequest } from "@/lib/database/postgrest";
import { CampaignSummarySchema, type CampaignSummary, type LaunchCampaignRequest } from "@/lib/campaigns/schemas";
import type { OrganisationContext } from "@/lib/auth/organisation-context";
import { mergeGenesisG8KnowledgeIntoCampaign, sanitiseGenesisG8LaunchKnowledgeMatch } from "@/lib/genesis-g8/knowledge-discovery-merge";
import { buildMarketRouteCampaignSellerContext, persistMarketRouteCampaignSellerContext } from "@/lib/integrations/genesis-t8/campaign-seller-context";

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
  if (row?.id) {
    const genesisSellerContext=buildMarketRouteCampaignSellerContext({campaignId:String(row.id),organisationId:context.organisationId,selectedCommercialObjectiveId:input.selectedProposalId,businessAnalysis:input.businessAnalysis});
    await persistMarketRouteCampaignSellerContext(genesisSellerContext);
    await mergeGenesisG8KnowledgeIntoCampaign({ campaignId: String(row.id), context, knowledgeMatch: sanitiseGenesisG8LaunchKnowledgeMatch(input.knowledgeMatch) });
  }
  return CampaignSummarySchema.parse({
    id: row.id, name: row.name, objective: row.objective, status: row.status,
    automationMode: row.automation_mode, fitScore: row.fit_score, audience: row.audience,
    createdAt: row.created_at, latestProgress: row.latest_progress ?? null,
  });
}
