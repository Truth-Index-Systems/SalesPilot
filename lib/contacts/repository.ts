import "server-only";
import { requireOrganisationContext } from "@/lib/auth/organisation-context";
import { databaseRequest } from "@/lib/database/postgrest";
import type { ContactConfidenceLabel, ContactReviewStatus } from "./schemas";

export type ContactFilters = {
  status?: ContactReviewStatus;
  campaignId?: string;
  companyId?: string;
  query?: string;
  confidence?: ContactConfidenceLabel | "HIGH" | "MEDIUM" | "LOW";
};

export async function listContacts(filters?: ContactFilters) {
  const context = await requireOrganisationContext();
  let path = `contact_overview?organisation_id=eq.${context.organisationId}&order=overall_confidence.desc,created_at.desc`;

  if (filters?.status) path += `&review_status=eq.${encodeURIComponent(filters.status)}`;
  if (filters?.campaignId) path += `&campaign_id=eq.${encodeURIComponent(filters.campaignId)}`;
  if (filters?.companyId) path += `&company_id=eq.${encodeURIComponent(filters.companyId)}`;
  if (filters?.query) {
    const query = encodeURIComponent(filters.query);
    path += `&or=(full_name.ilike.*${query}*,role_title.ilike.*${query}*,department.ilike.*${query}*,location.ilike.*${query}*,company_name.ilike.*${query}*)`;
  }
  if (filters?.confidence === "HIGH") path += "&overall_confidence=gte.80";
  if (filters?.confidence === "MEDIUM") path += "&overall_confidence=gte.60&overall_confidence=lt.80";
  if (filters?.confidence === "LOW") path += "&overall_confidence=lt.60";
  if (["VERIFIED", "LIKELY", "POSSIBLE", "UNKNOWN"].includes(filters?.confidence ?? "")) {
    path += `&confidence_label=eq.${filters?.confidence}`;
  }

  return databaseRequest<any[]>(path);
}

export async function getContact(id: string) {
  const context = await requireOrganisationContext();
  const rows = await databaseRequest<any[]>(
    `contact_detail?id=eq.${encodeURIComponent(id)}&organisation_id=eq.${context.organisationId}&limit=1`,
  );
  return rows[0] ?? null;
}

export async function getContactDiscoveryForCompany(campaignId: string, companyId: string) {
  const context = await requireOrganisationContext();
  const rows = await databaseRequest<any[]>(
    `contact_discovery_sessions?organisation_id=eq.${context.organisationId}&campaign_id=eq.${encodeURIComponent(campaignId)}&company_id=eq.${encodeURIComponent(companyId)}&limit=1`,
  );
  return rows[0] ?? null;
}

export async function listContactDiscoveryForCampaign(campaignId: string) {
  const context = await requireOrganisationContext();
  return databaseRequest<any[]>(
    `contact_discovery_sessions?organisation_id=eq.${context.organisationId}&campaign_id=eq.${encodeURIComponent(campaignId)}&order=created_at.desc`,
  );
}

export async function contactCounts(filters?: Pick<ContactFilters, "campaignId" | "companyId">) {
  const rows = await listContacts(filters);
  return {
    total: rows.length,
    pending: rows.filter((row) => row.review_status === "PENDING_REVIEW").length,
    approved: rows.filter((row) => row.review_status === "APPROVED").length,
    rejected: rows.filter((row) => row.review_status === "REJECTED").length,
    hold: rows.filter((row) => row.review_status === "HOLD").length,
    archived: rows.filter((row) => row.review_status === "ARCHIVED").length,
  };
}

export async function listContactDiscoveryActivity() {
  const context = await requireOrganisationContext();
  return databaseRequest<any[]>(
    `contact_discovery_sessions?organisation_id=eq.${context.organisationId}&order=updated_at.desc&limit=50`,
  );
}
