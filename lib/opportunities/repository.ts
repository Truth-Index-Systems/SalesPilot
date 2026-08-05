import "server-only";
import { requireOrganisationContext } from "@/lib/auth/organisation-context";
import { databaseRequest } from "@/lib/database/postgrest";
import type { OpportunityFoundation, OpportunityStatus } from "./domain";

export type OpportunityFilters = {
  campaignId?: string;
  companyId?: string;
  status?: OpportunityStatus;
};

export async function listOpportunities(filters?: OpportunityFilters): Promise<OpportunityFoundation[]> {
  const context = await requireOrganisationContext();
  let path = `opportunity_overview?organisation_id=eq.${context.organisationId}&order=campaign_id.asc,rank.asc,created_at.asc`;
  if (filters?.campaignId) path += `&campaign_id=eq.${encodeURIComponent(filters.campaignId)}`;
  if (filters?.companyId) path += `&company_id=eq.${encodeURIComponent(filters.companyId)}`;
  if (filters?.status) path += `&status=eq.${encodeURIComponent(filters.status)}`;
  return databaseRequest<OpportunityFoundation[]>(path);
}

export async function getOpportunity(id: string) {
  const context = await requireOrganisationContext();
  const rows = await databaseRequest<any[]>(
    `opportunity_detail?id=eq.${encodeURIComponent(id)}&organisation_id=eq.${context.organisationId}&limit=1`,
  );
  return rows[0] ?? null;
}

export async function listCampaignOpportunities(campaignId: string) {
  return listOpportunities({ campaignId });
}

export async function reviewOpportunity(
  campaignId: string,
  opportunityId: string,
  status: "APPROVED" | "REJECTED",
) {
  const context = await requireOrganisationContext();
  if (context.role === "VIEWER") throw new Error("OPPORTUNITY_REVIEW_FORBIDDEN");
  return databaseRequest<OpportunityFoundation>("rpc/review_salespilot_opportunity_scoped", {
    method: "POST",
    body: JSON.stringify({
      p_organisation_id: context.organisationId,
      p_campaign_id: campaignId,
      p_opportunity_id: opportunityId,
      p_user_id: context.userId,
      p_status: status,
    }),
  });
}

export function approveOpportunity(campaignId: string, opportunityId: string) {
  return reviewOpportunity(campaignId, opportunityId, "APPROVED");
}

export function rejectOpportunity(campaignId: string, opportunityId: string) {
  return reviewOpportunity(campaignId, opportunityId, "REJECTED");
}
