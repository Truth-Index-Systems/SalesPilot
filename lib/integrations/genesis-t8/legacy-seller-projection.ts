import type { GenesisSellerContext } from "./genesis-seller-context";

/**
 * MR-R1 Build 4 compatibility projection.
 *
 * Legacy MarketRoute presentation/read contracts may continue to ask for
 * summary/ICP/industry/pain fields, but those values are now projections of
 * the immutable GenesisSellerContext. This module must never perform new
 * semantic interpretation or mutate seller state.
 */
export const MARKETROUTE_GENESIS_LEGACY_PROJECTION_VERSION = "MR-R1-BUILD4-1.0.0" as const;
export const MARKETROUTE_GENESIS_LEGACY_PROJECTION_SCHEMA = "marketroute_genesis_legacy_seller_projection/v1" as const;

export type GenesisLegacySellerProjection = Readonly<{
  schema: typeof MARKETROUTE_GENESIS_LEGACY_PROJECTION_SCHEMA;
  version: typeof MARKETROUTE_GENESIS_LEGACY_PROJECTION_VERSION;
  campaignId: string;
  sourceFingerprint: string;
  businessName: string;
  businessSummary: string;
  websiteUrl: string;
  industry: string;
  businessModel: string;
  offers: readonly Readonly<{ name: string; description: string; confidence: number }>[];
  icp: readonly Readonly<{
    segment: string;
    industries: readonly string[];
    companySize: string;
    geographies: readonly string[];
    buyerRoles: readonly string[];
    pains: readonly string[];
    confidence: number;
  }>[];
  industries: readonly string[];
  buyerRoles: readonly string[];
  painPoints: readonly string[];
  geographies: readonly string[];
  unknowns: readonly string[];
}>;

function unique(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values.map(value => value.trim()).filter(Boolean))]);
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return value;
}

export function projectLegacySellerFields(context: GenesisSellerContext): GenesisLegacySellerProjection {
  const dna = context.businessDNA;
  return deepFreeze({
    schema: MARKETROUTE_GENESIS_LEGACY_PROJECTION_SCHEMA,
    version: MARKETROUTE_GENESIS_LEGACY_PROJECTION_VERSION,
    campaignId: context.campaignId,
    sourceFingerprint: context.provenance.sourceFingerprint,
    businessName: dna.company.name,
    businessSummary: dna.company.summary,
    websiteUrl: dna.company.website,
    industry: dna.company.industry,
    businessModel: dna.company.businessModel,
    offers: dna.offers,
    icp: dna.idealCustomers,
    industries: unique(dna.idealCustomers.flatMap(item => item.industries)),
    buyerRoles: unique(dna.idealCustomers.flatMap(item => item.buyerRoles)),
    painPoints: unique(dna.idealCustomers.flatMap(item => item.pains)),
    geographies: unique(dna.idealCustomers.flatMap(item => item.geographies)),
    unknowns: Object.freeze([...dna.unknowns]),
  });
}
