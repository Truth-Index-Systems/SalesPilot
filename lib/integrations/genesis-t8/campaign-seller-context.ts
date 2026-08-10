import "server-only";
import { createHash } from "node:crypto";
import { databaseRequest } from "@/lib/database/postgrest";
import { sanitisePostgresJson } from "@/lib/database/postgres-json";
import {
  enterMarketRouteSellerUnderstanding,
  type MarketRouteAiEnvelope,
  type MarketRouteBusinessDnaSource,
  type MarketRouteGenesisT8SellerEntry,
} from "./marketroute-seller-entry";

export const MARKETROUTE_GENESIS_T8_CAMPAIGN_CONTEXT_VERSION = "MR-R1-BUILD2-1.0.0" as const;
export const MARKETROUTE_GENESIS_T8_CAMPAIGN_CONTEXT_SCHEMA = "marketroute_genesis_t8_campaign_seller_context/v1" as const;

export type MarketRouteGenesisT8CampaignSellerContext = Readonly<{
  schema: typeof MARKETROUTE_GENESIS_T8_CAMPAIGN_CONTEXT_SCHEMA;
  integrationVersion: typeof MARKETROUTE_GENESIS_T8_CAMPAIGN_CONTEXT_VERSION;
  campaignId: string;
  organisationId: string;
  selectedCommercialObjectiveId: string;
  persistedAt: string;
  sellerUnderstanding: MarketRouteGenesisT8SellerEntry;
  sourceFingerprint: string;
}>;

function stableSourceFingerprint(entry: MarketRouteGenesisT8SellerEntry, selectedCommercialObjectiveId: string): string {
  const stable = JSON.stringify({
    sellerEntity: entry.sellerEntity,
    source: entry.source,
    legacyBusinessDna: entry.legacyBusinessDna,
    baselinePredicateIds: entry.baselineResearchDirectives.map(item => item.predicate),
    selectedCommercialObjectiveId,
    ckrVersion: entry.ckrVersion,
    udosibVersion: entry.udosibVersion,
    aiResearchContractVersion: entry.aiResearchContractVersion,
  });
  return createHash("sha256").update(stable).digest("hex");
}

export function buildMarketRouteCampaignSellerContext<T extends MarketRouteBusinessDnaSource>(input: {
  campaignId: string;
  organisationId: string;
  selectedCommercialObjectiveId: string;
  businessAnalysis: MarketRouteAiEnvelope<T>;
  persistedAt?: string;
}): MarketRouteGenesisT8CampaignSellerContext {
  const persistedAt = input.persistedAt ?? new Date().toISOString();
  if (!Number.isFinite(Date.parse(persistedAt))) throw new Error("MARKETROUTE_GENESIS_T8_CAMPAIGN_CONTEXT_VIOLATION:PERSISTED_AT");
  if (!input.campaignId) throw new Error("MARKETROUTE_GENESIS_T8_CAMPAIGN_CONTEXT_VIOLATION:CAMPAIGN_ID");
  if (!input.organisationId) throw new Error("MARKETROUTE_GENESIS_T8_CAMPAIGN_CONTEXT_VIOLATION:ORGANISATION_ID");
  if (!input.selectedCommercialObjectiveId) throw new Error("MARKETROUTE_GENESIS_T8_CAMPAIGN_CONTEXT_VIOLATION:OBJECTIVE_ID");

  const sellerUnderstanding = enterMarketRouteSellerUnderstanding(input.businessAnalysis, persistedAt);
  if (!sellerUnderstanding.legacyBusinessDna.campaigns.some(item => item.id === input.selectedCommercialObjectiveId)) {
    throw new Error("MARKETROUTE_GENESIS_T8_CAMPAIGN_CONTEXT_VIOLATION:OBJECTIVE_NOT_IN_SELLER_DNA");
  }
  const sourceFingerprint = stableSourceFingerprint(sellerUnderstanding, input.selectedCommercialObjectiveId);

  return Object.freeze({
    schema: MARKETROUTE_GENESIS_T8_CAMPAIGN_CONTEXT_SCHEMA,
    integrationVersion: MARKETROUTE_GENESIS_T8_CAMPAIGN_CONTEXT_VERSION,
    campaignId: input.campaignId,
    organisationId: input.organisationId,
    selectedCommercialObjectiveId: input.selectedCommercialObjectiveId,
    persistedAt,
    sellerUnderstanding,
    sourceFingerprint,
  });
}

export async function persistMarketRouteCampaignSellerContext(context: MarketRouteGenesisT8CampaignSellerContext): Promise<void> {
  await databaseRequest("rpc/persist_campaign_genesis_t8_seller_context", {
    method: "POST",
    body: JSON.stringify({
      p_campaign_id: context.campaignId,
      p_organisation_id: context.organisationId,
      p_schema_version: context.schema,
      p_integration_version: context.integrationVersion,
      p_genesis_entity_id: context.sellerUnderstanding.sellerEntity.genesisEntityId,
      p_source_fingerprint: context.sourceFingerprint,
      p_context: sanitisePostgresJson(context),
    }),
  });
}
