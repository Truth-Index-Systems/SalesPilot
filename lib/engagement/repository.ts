import "server-only";
import { requireOrganisationContext } from "@/lib/auth/organisation-context";
import { databaseRequest } from "@/lib/database/postgrest";
import { mapEngagementUpdate } from "./mapper";
import type {
  Engagement,
  EngagementFilters,
  EngagementHistory,
  EngagementOverview,
  EngagementStatus,
  EngagementUpdate,
} from "./types";

function withFilters(base: string, organisationId: string, filters?: EngagementFilters) {
  let path = `${base}?organisation_id=eq.${organisationId}`;
  if (filters?.campaignId) path += `&campaign_id=eq.${encodeURIComponent(filters.campaignId)}`;
  if (filters?.opportunityId) path += `&opportunity_id=eq.${encodeURIComponent(filters.opportunityId)}`;
  if (filters?.status) path += `&status=eq.${encodeURIComponent(filters.status)}`;
  return path;
}

export async function listEngagements(filters?: EngagementFilters): Promise<EngagementOverview[]> {
  const context = await requireOrganisationContext();
  const path = `${withFilters("opportunity_engagement_overview", context.organisationId, filters)}&order=source_opportunity_rank.asc,prepared_at.asc`;
  return databaseRequest<EngagementOverview[]>(path);
}

export async function getEngagement(id: string): Promise<EngagementOverview | null> {
  const context = await requireOrganisationContext();
  const rows = await databaseRequest<EngagementOverview[]>(
    `opportunity_engagement_overview?id=eq.${encodeURIComponent(id)}&organisation_id=eq.${context.organisationId}&limit=1`,
  );
  return rows[0] ?? null;
}

export async function getEngagementByOpportunity(opportunityId: string): Promise<EngagementOverview | null> {
  const rows = await listEngagements({ opportunityId });
  return rows[0] ?? null;
}

export async function listCampaignEngagements(campaignId: string): Promise<EngagementOverview[]> {
  return listEngagements({ campaignId });
}

export async function listEngagementHistory(engagementId: string): Promise<EngagementHistory[]> {
  const context = await requireOrganisationContext();
  return databaseRequest<EngagementHistory[]>(
    `opportunity_engagement_history?organisation_id=eq.${context.organisationId}&engagement_id=eq.${encodeURIComponent(engagementId)}&order=occurred_at.desc`,
  );
}

export async function createEngagementFromOpportunity(opportunityId: string): Promise<Engagement> {
  const context = await requireOrganisationContext();
  if (context.role === "VIEWER") throw new Error("ENGAGEMENT_WRITE_FORBIDDEN");
  return databaseRequest<Engagement>("rpc/create_engagement_from_opportunity", {
    method: "POST",
    body: JSON.stringify({
      p_organisation_id: context.organisationId,
      p_opportunity_id: opportunityId,
      p_user_id: context.userId,
    }),
  });
}

export async function updateEngagement(id: string, update: EngagementUpdate): Promise<Engagement> {
  const context = await requireOrganisationContext();
  if (context.role === "VIEWER") throw new Error("ENGAGEMENT_WRITE_FORBIDDEN");
  return databaseRequest<Engagement>("rpc/update_salespilot_engagement", {
    method: "POST",
    body: JSON.stringify({
      p_organisation_id: context.organisationId,
      p_engagement_id: id,
      p_user_id: context.userId,
      ...mapEngagementUpdate(update),
    }),
  });
}

export function changeEngagementStatus(id: string, status: EngagementStatus) {
  return updateEngagement(id, { status });
}
