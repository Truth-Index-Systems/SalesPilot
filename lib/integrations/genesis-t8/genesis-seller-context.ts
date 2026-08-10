import "server-only";
import { databaseRequest } from "@/lib/database/postgrest";
import type { GenesisT8EntityIdentity } from "@/lib/genesis-t8/platform-contracts";
import type { GenesisT8PredicateResearchDirective } from "@/lib/genesis-t8/ai-research-contract";
import {
  MARKETROUTE_GENESIS_T8_CAMPAIGN_CONTEXT_SCHEMA,
  MARKETROUTE_GENESIS_T8_CAMPAIGN_CONTEXT_VERSION,
  type MarketRouteGenesisT8CampaignSellerContext,
} from "./campaign-seller-context";
import type { MarketRouteBusinessDnaSource } from "./marketroute-seller-entry";
import { loadOrMaterialiseMarketRouteGenesisSellerConstraintSet, type MarketRouteGenesisSellerConstraintSet } from "./seller-constraint-contracts";
import { loadOrMaterialiseMarketRouteGenesisBusinessDnaCompleteness, type MarketRouteGenesisBusinessDnaCompleteness } from "./business-dna-completeness";
import { MARKETROUTE_GENESIS_AI_BOUNDARY_VERSION } from "./ai-boundary";

export const MARKETROUTE_GENESIS_SELLER_CONTEXT_API_VERSION = "MR-R1-BUILD3-1.0.0" as const;
export const MARKETROUTE_GENESIS_SELLER_CONTEXT_API_SCHEMA = "marketroute_genesis_seller_context/v1" as const;

export type GenesisSellerContext = Readonly<{
  schema: typeof MARKETROUTE_GENESIS_SELLER_CONTEXT_API_SCHEMA;
  apiVersion: typeof MARKETROUTE_GENESIS_SELLER_CONTEXT_API_VERSION;
  campaignId: string;
  organisationId: string;
  sellerIdentity: GenesisT8EntityIdentity;
  businessDNA: MarketRouteBusinessDnaSource;
  commercialObjectives: MarketRouteBusinessDnaSource["campaigns"];
  selectedCommercialObjective: MarketRouteBusinessDnaSource["campaigns"][number];
  researchDirectives: readonly GenesisT8PredicateResearchDirective[];
  constraintSet: MarketRouteGenesisSellerConstraintSet;
  completeness: MarketRouteGenesisBusinessDnaCompleteness;
  provenance: Readonly<{
    sourceFingerprint: string;
    persistedAt: string;
    sourceSchemaVersion: string;
    sourcePromptVersion: string;
    sourceModel: string;
    sourceGeneratedAt: string;
    ckrVersion: string;
    ckrStatus: string;
    udosibRelease: string;
    udosibVersion: string;
    udosibStatus: string;
    aiResearchContractVersion: string;
    sellerEntryVersion: string;
    campaignContextVersion: string;
    aiBoundaryVersion: string;
    authoritativeSellerWriter: "GENESIS";
    truthAuthority: "TRUTH_INDEX";
    rankingAuthority: "UDOSIB";
  }>;
}>;

type StoredCampaignSellerContextRow = Readonly<{
  campaign_id: string;
  organisation_id: string;
  schema_version: string;
  integration_version: string;
  source_fingerprint: string;
  context_json: unknown;
  created_at: string;
}>;

function assertObject(value: unknown, code: string): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`GENESIS_SELLER_CONTEXT_INVALID:${code}`);
  }
}

function assertStoredContext(
  row: StoredCampaignSellerContextRow,
  campaignId: string,
  organisationId: string,
): MarketRouteGenesisT8CampaignSellerContext {
  if (row.campaign_id !== campaignId || row.organisation_id !== organisationId) {
    throw new Error("GENESIS_SELLER_CONTEXT_BOUNDARY_MISMATCH");
  }
  if (row.schema_version !== MARKETROUTE_GENESIS_T8_CAMPAIGN_CONTEXT_SCHEMA) {
    throw new Error("GENESIS_SELLER_CONTEXT_SCHEMA_UNSUPPORTED");
  }
  if (row.integration_version !== MARKETROUTE_GENESIS_T8_CAMPAIGN_CONTEXT_VERSION) {
    throw new Error("GENESIS_SELLER_CONTEXT_VERSION_UNSUPPORTED");
  }
  assertObject(row.context_json, "CONTEXT_JSON");
  const context = row.context_json as unknown as MarketRouteGenesisT8CampaignSellerContext;
  if (context.campaignId !== campaignId || context.organisationId !== organisationId) {
    throw new Error("GENESIS_SELLER_CONTEXT_PAYLOAD_BOUNDARY_MISMATCH");
  }
  if (context.schema !== row.schema_version || context.integrationVersion !== row.integration_version) {
    throw new Error("GENESIS_SELLER_CONTEXT_PAYLOAD_VERSION_MISMATCH");
  }
  if (context.sourceFingerprint !== row.source_fingerprint) {
    throw new Error("GENESIS_SELLER_CONTEXT_FINGERPRINT_MISMATCH");
  }
  if (!context.sellerUnderstanding?.legacyBusinessDna || !context.sellerUnderstanding?.sellerEntity) {
    throw new Error("GENESIS_SELLER_CONTEXT_PAYLOAD_INCOMPLETE");
  }
  return context;
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return value;
}

export function projectGenesisSellerContext(
  stored: MarketRouteGenesisT8CampaignSellerContext,
  constraintSet: MarketRouteGenesisSellerConstraintSet,
  completeness: MarketRouteGenesisBusinessDnaCompleteness,
): GenesisSellerContext {
  const dna = stored.sellerUnderstanding.legacyBusinessDna;
  const selected = dna.campaigns.find(item => item.id === stored.selectedCommercialObjectiveId);
  if (!selected) throw new Error("GENESIS_SELLER_CONTEXT_SELECTED_OBJECTIVE_MISSING");

  return deepFreeze({
    schema: MARKETROUTE_GENESIS_SELLER_CONTEXT_API_SCHEMA,
    apiVersion: MARKETROUTE_GENESIS_SELLER_CONTEXT_API_VERSION,
    campaignId: stored.campaignId,
    organisationId: stored.organisationId,
    sellerIdentity: stored.sellerUnderstanding.sellerEntity,
    businessDNA: dna,
    commercialObjectives: dna.campaigns,
    selectedCommercialObjective: selected,
    researchDirectives: stored.sellerUnderstanding.baselineResearchDirectives,
    constraintSet,
    completeness,
    provenance: {
      sourceFingerprint: stored.sourceFingerprint,
      persistedAt: stored.persistedAt,
      sourceSchemaVersion: stored.sellerUnderstanding.source.schemaVersion,
      sourcePromptVersion: stored.sellerUnderstanding.source.promptVersion,
      sourceModel: stored.sellerUnderstanding.source.model,
      sourceGeneratedAt: stored.sellerUnderstanding.source.generatedAt,
      ckrVersion: stored.sellerUnderstanding.ckrVersion,
      ckrStatus: stored.sellerUnderstanding.ckrStatus,
      udosibRelease: stored.sellerUnderstanding.udosibRelease,
      udosibVersion: stored.sellerUnderstanding.udosibVersion,
      udosibStatus: stored.sellerUnderstanding.udosibStatus,
      aiResearchContractVersion: stored.sellerUnderstanding.aiResearchContractVersion,
      sellerEntryVersion: stored.sellerUnderstanding.integrationVersion,
      campaignContextVersion: stored.integrationVersion,
      aiBoundaryVersion: MARKETROUTE_GENESIS_AI_BOUNDARY_VERSION,
      authoritativeSellerWriter: "GENESIS",
      truthAuthority: "TRUTH_INDEX",
      rankingAuthority: "UDOSIB",
    },
  });
}

export async function loadGenesisSellerContext(
  campaignId: string,
  organisationId: string,
): Promise<GenesisSellerContext> {
  if (!campaignId) throw new Error("GENESIS_SELLER_CONTEXT_CAMPAIGN_ID_REQUIRED");
  if (!organisationId) throw new Error("GENESIS_SELLER_CONTEXT_ORGANISATION_ID_REQUIRED");

  const rows = await databaseRequest<StoredCampaignSellerContextRow[]>(
    `campaign_genesis_t8_seller_contexts?campaign_id=eq.${encodeURIComponent(campaignId)}&organisation_id=eq.${encodeURIComponent(organisationId)}&select=campaign_id,organisation_id,schema_version,integration_version,source_fingerprint,context_json,created_at&limit=1`,
  );
  const row = rows[0];
  if (!row) throw new Error("GENESIS_SELLER_CONTEXT_NOT_FOUND");
  const stored = assertStoredContext(row, campaignId, organisationId);
  const constraintSet = await loadOrMaterialiseMarketRouteGenesisSellerConstraintSet(stored);
  const completeness = await loadOrMaterialiseMarketRouteGenesisBusinessDnaCompleteness(stored, constraintSet);
  return projectGenesisSellerContext(stored, constraintSet, completeness);
}
