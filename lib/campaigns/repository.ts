import "server-only";
import { databaseRequest } from "@/lib/database/postgrest";
import { requireOrganisationContext } from "@/lib/auth/organisation-context";
import { CampaignDetailSchema, CampaignSummarySchema, type CampaignDetail, type CampaignSummary } from "./schemas";
import { loadGenesisSellerContext } from "@/lib/integrations/genesis-t8/genesis-seller-context";
import { projectLegacySellerFields } from "@/lib/integrations/genesis-t8/legacy-seller-projection";

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

  // MR-R1 Build 8: prefer the same immutable GenesisSellerContext consumed by
  // execution stages. Historical campaigns that predate Build 2 may have no
  // persisted Genesis context; campaign_detail already exposes the sanctioned
  // legacy fallback for presentation only. Execution stages remain strict and
  // still require GenesisSellerContext. Never swallow integrity/DB failures.
  let seller: ReturnType<typeof projectLegacySellerFields> | {
    businessName: string | null; businessSummary: string | null; websiteUrl: string | null;
  };
  try {
    const genesisSellerContext = await loadGenesisSellerContext(id, context.organisationId);
    seller = projectLegacySellerFields(genesisSellerContext);
  } catch (error) {
    if (!(error instanceof Error) || error.message !== "GENESIS_SELLER_CONTEXT_NOT_FOUND") throw error;
    if (!row.business_name && !row.business_summary && !row.website_url) throw error;
    seller = {
      businessName: row.business_name ?? null,
      businessSummary: row.business_summary ?? null,
      websiteUrl: row.website_url ?? null,
    };
  }

  return CampaignDetailSchema.parse({
    ...mapSummary(row),
    buyerRoles: row.buyer_roles ?? [],
    messageAngle: row.message_angle,
    why: row.why ?? [],
    businessName: seller.businessName,
    businessSummary: seller.businessSummary,
    websiteUrl: seller.websiteUrl,
    timeline: (row.timeline ?? []).map((entry: Record<string, any>) => ({ id: entry.id, title: entry.title, description: entry.description ?? null, occurredAt: entry.occurred_at })),
  });
}
