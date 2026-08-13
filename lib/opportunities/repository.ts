import "server-only";
import { requireOrganisationContext } from "@/lib/auth/organisation-context";
import { databaseRequest } from "@/lib/database/postgrest";
import type { OpportunityDetail, OpportunityFoundation, OpportunityOverview, OpportunityStatus } from "./domain";

export type OpportunityFilters = {
  campaignId?: string;
  companyId?: string;
  status?: OpportunityStatus;
};

/**
 * Forensic Build 7 read boundary.
 *
 * Opportunity presentation must come from the canonical R4 -> R5 -> R6 read
 * model. Historical opportunity_overview/opportunity_detail views are no longer
 * consulted by the MarketRoute opportunity UI, so old score/contact/route
 * fields cannot accidentally reconstruct readiness at presentation time.
 */
export async function listOpportunities(filters?: OpportunityFilters): Promise<OpportunityOverview[]> {
  const context = await requireOrganisationContext();
  let path = `cie_authoritative_opportunity_read?organisation_id=eq.${context.organisationId}&order=campaign_id.asc,rank.asc,created_at.asc`;
  if (filters?.campaignId) path += `&campaign_id=eq.${encodeURIComponent(filters.campaignId)}`;
  if (filters?.companyId) path += `&company_id=eq.${encodeURIComponent(filters.companyId)}`;
  if (filters?.status) path += `&status=eq.${encodeURIComponent(filters.status)}`;
  return databaseRequest<OpportunityOverview[]>(path);
}

export async function getOpportunity(id: string): Promise<OpportunityDetail | null> {
  const context = await requireOrganisationContext();
  const rows = await databaseRequest<OpportunityDetail[]>(
    `cie_authoritative_opportunity_detail_read?id=eq.${encodeURIComponent(id)}&organisation_id=eq.${context.organisationId}&limit=1`,
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
  note?: string,
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
      p_note: note ?? null,
    }),
  });
}

export function approveOpportunity(campaignId: string, opportunityId: string, note?: string) {
  return reviewOpportunity(campaignId, opportunityId, "APPROVED", note);
}

export function rejectOpportunity(campaignId: string, opportunityId: string, note?: string) {
  return reviewOpportunity(campaignId, opportunityId, "REJECTED", note);
}
