import "server-only";
import { databaseRequest } from "@/lib/database/postgrest";
import { requireOrganisationContext } from "@/lib/auth/organisation-context";

export type CompanyFilters = {
  status?: string;
  campaignId?: string;
  query?: string;
  confidence?: "HIGH" | "MEDIUM" | "LOW";
};

export async function listCompanies(filters?: CompanyFilters) {
  const context = await requireOrganisationContext();
  let path = `company_overview?organisation_id=eq.${context.organisationId}&order=confidence.desc,created_at.desc`;
  if (filters?.status) path += `&review_status=eq.${encodeURIComponent(filters.status)}`;
  if (filters?.campaignId) path += `&campaign_id=eq.${encodeURIComponent(filters.campaignId)}`;
  if (filters?.query) path += `&or=(company_name.ilike.*${encodeURIComponent(filters.query)}*,industry.ilike.*${encodeURIComponent(filters.query)}*,country.ilike.*${encodeURIComponent(filters.query)}*)`;
  if (filters?.confidence === "HIGH") path += "&confidence=gte.80";
  if (filters?.confidence === "MEDIUM") path += "&confidence=gte.60&confidence=lt.80";
  if (filters?.confidence === "LOW") path += "&confidence=lt.60";
  return databaseRequest<any[]>(path);
}

export async function getCompany(id: string) {
  const context = await requireOrganisationContext();
  const rows = await databaseRequest<any[]>(`company_detail?id=eq.${encodeURIComponent(id)}&organisation_id=eq.${context.organisationId}&limit=1`);
  return rows[0] ?? null;
}

export async function getDiscoveryForCampaign(campaignId: string) {
  const context = await requireOrganisationContext();
  const rows = await databaseRequest<any[]>(`discovery_sessions?campaign_id=eq.${encodeURIComponent(campaignId)}&organisation_id=eq.${context.organisationId}&limit=1`);
  return rows[0] ?? null;
}

export async function companyCounts() {
  const rows = await listCompanies();
  return {
    total: rows.length,
    pending: rows.filter(row => row.review_status === "PENDING_REVIEW").length,
    approved: rows.filter(row => row.review_status === "APPROVED").length,
    rejected: rows.filter(row => row.review_status === "REJECTED").length,
  };
}

export async function getDiscoveryActivity(campaignId: string, limit = 8) {
  const context = await requireOrganisationContext();
  return databaseRequest<any[]>(`discovery_activity?campaign_id=eq.${encodeURIComponent(campaignId)}&organisation_id=eq.${context.organisationId}&order=occurred_at.desc&limit=${Math.max(1, Math.min(20, limit))}`);
}
