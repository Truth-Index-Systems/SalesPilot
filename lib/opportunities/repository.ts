import "server-only";
import { requireOrganisationContext } from "@/lib/auth/organisation-context";
import { databaseRequest } from "@/lib/database/postgrest";
import type { OpportunityDetail, OpportunityFoundation, OpportunityOverview, OpportunityStatus } from "./domain";

export type OpportunityFilters = {
  campaignId?: string;
  companyId?: string;
  status?: OpportunityStatus;
};

type R5RouteAuthorityRead = {
  opportunity_id: string;
  organisation_id: string;
  campaign_id: string;
  company_id: string;
  authority_fingerprint: string | null;
  source_fingerprint: string | null;
  producer_version: string | null;
  authority_status: string | null;
  commercial_route_id: string | null;
  commercial_route_type: string | null;
  commercial_route_label: string | null;
  commercial_route_entry_role: string | null;
  commercial_route_target_role: string | null;
  commercial_route_department: string | null;
  commercial_route_contact_name: string | null;
  commercial_route_contact_role: string | null;
  commercial_route_channel_type: string | null;
  commercial_route_channel_value: string | null;
  commercial_route_rationale: string | null;
  commercial_route_next_step: string | null;
  commercial_route_count: number;
  commercial_route_evidence_count: number;
  commercial_routes: Array<Record<string, unknown>> | null;
  commercial_route_evidence: Array<Record<string, unknown>> | null;
};

function overlayR5RouteAuthority<T extends OpportunityOverview>(row: T, authority?: R5RouteAuthorityRead): T {
  const active = authority?.authority_status === "ACTIVE" && authority.producer_version === "MR-T8-FB4-R5-1.0.0";
  return {
    ...row,
    // Build 4 makes legacy route-quality scalars permanently non-authoritative at the read boundary.
    commercial_route_id: active ? authority?.commercial_route_id ?? null : null,
    commercial_route_type: active ? authority?.commercial_route_type ?? null : null,
    commercial_route_label: active ? authority?.commercial_route_label ?? null : null,
    commercial_route_entry_role: active ? authority?.commercial_route_entry_role ?? null : null,
    commercial_route_target_role: active ? authority?.commercial_route_target_role ?? null : null,
    commercial_route_department: active ? authority?.commercial_route_department ?? null : null,
    commercial_route_contact_name: active ? authority?.commercial_route_contact_name ?? null : null,
    commercial_route_contact_role: active ? authority?.commercial_route_contact_role ?? null : null,
    commercial_route_channel_type: active ? authority?.commercial_route_channel_type ?? null : null,
    commercial_route_channel_value: active ? authority?.commercial_route_channel_value ?? null : null,
    commercial_route_quality: null,
    commercial_route_confidence: null,
    commercial_route_authority: null,
    commercial_route_accessibility: null,
    commercial_route_evidence_quality: null,
    commercial_route_resilience: null,
    commercial_route_difficulty: null,
    commercial_route_rationale: active ? authority?.commercial_route_rationale ?? null : null,
    commercial_route_next_step: active ? authority?.commercial_route_next_step ?? null : null,
    commercial_route_count: active ? Number(authority?.commercial_route_count ?? 0) : 0,
    commercial_route_evidence_count: active ? Number(authority?.commercial_route_evidence_count ?? 0) : 0,
  } as T;
}

function overlayR5RouteDetail(row: OpportunityDetail, authority?: R5RouteAuthorityRead): OpportunityDetail {
  const overview = overlayR5RouteAuthority(row, authority);
  return {
    ...overview,
    // Candidate rows remain visible for forensic/research presentation, but only the
    // persisted R5 state can mark one OPEN/selected. Legacy score fields are absent.
    commercial_routes: Array.isArray(authority?.commercial_routes) ? authority!.commercial_routes! : [],
    commercial_route_evidence: Array.isArray(authority?.commercial_route_evidence) ? authority!.commercial_route_evidence! : [],
  };
}

async function listR5RouteAuthority(organisationId: string): Promise<R5RouteAuthorityRead[]> {
  return databaseRequest<R5RouteAuthorityRead[]>(
    `cie_r5_route_authority_read?organisation_id=eq.${encodeURIComponent(organisationId)}`,
  );
}

export async function listOpportunities(filters?: OpportunityFilters): Promise<OpportunityOverview[]> {
  const context = await requireOrganisationContext();
  let path = `opportunity_overview?organisation_id=eq.${context.organisationId}&order=campaign_id.asc,rank.asc,created_at.asc`;
  if (filters?.campaignId) path += `&campaign_id=eq.${encodeURIComponent(filters.campaignId)}`;
  if (filters?.companyId) path += `&company_id=eq.${encodeURIComponent(filters.companyId)}`;
  if (filters?.status) path += `&status=eq.${encodeURIComponent(filters.status)}`;
  const [rows, authorities] = await Promise.all([
    databaseRequest<OpportunityOverview[]>(path),
    listR5RouteAuthority(context.organisationId),
  ]);
  const byOpportunity = new Map(authorities.map(item => [item.opportunity_id, item] as const));
  return rows.map(row => overlayR5RouteAuthority(row, byOpportunity.get(row.id)));
}

export async function getOpportunity(id: string): Promise<OpportunityDetail | null> {
  const context = await requireOrganisationContext();
  const [rows, authorityRows] = await Promise.all([
    databaseRequest<OpportunityDetail[]>(
      `opportunity_detail?id=eq.${encodeURIComponent(id)}&organisation_id=eq.${context.organisationId}&limit=1`,
    ),
    databaseRequest<R5RouteAuthorityRead[]>(
      `cie_r5_route_authority_read?opportunity_id=eq.${encodeURIComponent(id)}&organisation_id=eq.${context.organisationId}&limit=1`,
    ),
  ]);
  const row = rows[0];
  return row ? overlayR5RouteDetail(row, authorityRows[0]) : null;
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
