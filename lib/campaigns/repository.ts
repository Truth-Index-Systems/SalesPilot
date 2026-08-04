import "server-only";
import { databaseRequest } from "@/lib/database/postgrest";
import { getDatabaseConfig } from "@/lib/database/config";
import { CampaignDetailSchema, CampaignSummarySchema, type CampaignDetail, type CampaignSummary, type LaunchCampaignRequest } from "./schemas";

function mapSummary(row: Record<string, any>): CampaignSummary {
  return CampaignSummarySchema.parse({
    id: row.id,
    name: row.name,
    objective: row.objective,
    status: row.status,
    automationMode: row.automation_mode,
    fitScore: row.fit_score,
    audience: row.audience,
    createdAt: row.created_at,
    latestProgress: row.latest_progress ?? null,
  });
}

export async function launchCampaign(input: LaunchCampaignRequest): Promise<CampaignSummary> {
  const config = getDatabaseConfig();
  const [row] = await databaseRequest<Record<string, any>[]>("rpc/launch_campaign", {
    method: "POST",
    body: JSON.stringify({
      p_organisation_id: config.organisationId,
      p_created_by: config.createdBy,
      p_idempotency_key: input.idempotencyKey,
      p_website_url: input.websiteUrl,
      p_analysis: input.businessAnalysis,
      p_selected_proposal_id: input.selectedProposalId,
    }),
  });
  return mapSummary(row);
}

export async function listCampaigns(): Promise<CampaignSummary[]> {
  const config = getDatabaseConfig();
  const rows = await databaseRequest<Record<string, any>[]>(
    `campaign_overview?organisation_id=eq.${encodeURIComponent(config.organisationId)}&order=created_at.desc`
  );
  return rows.map(mapSummary);
}

export async function getCampaign(id: string): Promise<CampaignDetail | null> {
  const config = getDatabaseConfig();
  const rows = await databaseRequest<Record<string, any>[]>(
    `campaign_detail?organisation_id=eq.${encodeURIComponent(config.organisationId)}&id=eq.${encodeURIComponent(id)}&limit=1`
  );
  if (!rows[0]) return null;
  const row = rows[0];
  return CampaignDetailSchema.parse({
    ...mapSummary(row),
    buyerRoles: row.buyer_roles ?? [],
    messageAngle: row.message_angle,
    why: row.why ?? [],
    businessName: row.business_name,
    businessSummary: row.business_summary,
    websiteUrl: row.website_url,
    timeline: (row.timeline ?? []).map((entry: Record<string, any>) => ({
      id: entry.id,
      title: entry.title,
      description: entry.description ?? null,
      occurredAt: entry.occurred_at,
    })),
  });
}
