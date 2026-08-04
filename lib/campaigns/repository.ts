import "server-only";
import { databaseRequest } from "@/lib/database/postgrest";
import { requireOrganisationContext } from "@/lib/auth/organisation-context";
import { CampaignDetailSchema, CampaignSummarySchema, type CampaignDetail, type CampaignSummary } from "./schemas";

function mapSummary(row: Record<string, any>): CampaignSummary {
  return CampaignSummarySchema.parse({ id: row.id, name: row.name, objective: row.objective, status: row.status, automationMode: row.automation_mode, fitScore: row.fit_score, audience: row.audience, createdAt: row.created_at, latestProgress: row.latest_progress ?? null });
}

export async function listCampaigns(): Promise<CampaignSummary[]> {
  const context = await requireOrganisationContext();
  const rows = await databaseRequest<Record<string, any>[]>(`campaign_overview?organisation_id=eq.${encodeURIComponent(context.organisationId)}&order=created_at.desc`);
  return rows.map(mapSummary);
}

export async function getCampaign(id: string): Promise<CampaignDetail | null> {
  const context = await requireOrganisationContext();
  const rows = await databaseRequest<Record<string, any>[]>(`campaign_detail?organisation_id=eq.${encodeURIComponent(context.organisationId)}&id=eq.${encodeURIComponent(id)}&limit=1`);
  if (!rows[0]) return null;
  const row = rows[0];
  return CampaignDetailSchema.parse({ ...mapSummary(row), buyerRoles: row.buyer_roles ?? [], messageAngle: row.message_angle, why: row.why ?? [], businessName: row.business_name, businessSummary: row.business_summary, websiteUrl: row.website_url, timeline: (row.timeline ?? []).map((entry: Record<string, any>) => ({ id: entry.id, title: entry.title, description: entry.description ?? null, occurredAt: entry.occurred_at })) });
}
