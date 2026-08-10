/**
 * MarketRoute -> Genesis T8 seller-understanding entry point.
 *
 * MR Phase 3 / R1 / Build 1.
 *
 * This is intentionally an integration adapter, not part of the frozen Genesis
 * T8 CKR or UDOSIB kernels. It establishes the one-way application -> Genesis
 * boundary while preserving the current MarketRoute Business DNA payload for
 * downstream compatibility.
 *
 * IMPORTANT: this module does not reinterpret business prose into ontology.
 * Semantic canonicalisation remains AI-owned. It only validates the existing
 * AI-produced seller understanding and prepares the ontology-governed research
 * surface that later MR-R1 builds will persist and populate.
 */
import {
  GENESIS_T8_AI_RESEARCH_CONTRACT_VERSION,
  buildAIResearchDirectives,
  type GenesisT8PredicateResearchDirective,
} from "@/lib/genesis-t8/ai-research-contract";
import {
  GENESIS_T8_CE_R1_FREEZE_STATUS,
  GENESIS_T8_CE_R1_FREEZE_VERSION,
} from "@/lib/genesis-t8/freeze-kernel";
import {
  assertEntityIdentityInvariant,
  type GenesisT8EntityIdentity,
} from "@/lib/genesis-t8/platform-contracts";
import { GENESIS_T8_PLATFORM } from "@/lib/genesis-t8/constitution";
import { GENESIS_T8_CE_R2_RELEASE, GENESIS_T8_MATHEMATICAL_CONSTITUTION_VERSION } from "@/lib/genesis-t8/mathematics/constitution";

export const MARKETROUTE_GENESIS_T8_SELLER_ENTRY_VERSION = "MR-R1-BUILD1-1.0.0" as const;
export const MARKETROUTE_GENESIS_T8_SELLER_ENTRY_SCHEMA = "marketroute_genesis_t8_seller_entry/v1" as const;

/**
 * Baseline seller predicates are ontology identifiers only. They do not encode
 * semantic conclusions about any particular seller. AI remains responsible for
 * determining the values and for adding relevant ontology predicates later.
 */
export const MARKETROUTE_GENESIS_T8_BASELINE_SELLER_PREDICATES = Object.freeze([
  "identity.legal_name",
  "identity.trading_name",
  "identity.canonical_domain",
  "identity.headquarters_country",
  "identity.operating_country",
  "commercial.industry",
  "commercial.business_model",
  "commercial.product_category",
  "commercial.service_category",
  "commercial.core_capability",
  "commercial.delivery_model",
  "commercial.minimum_contract_value",
  "commercial.route_to_market",
  "market.customer_type",
  "market.customer_industry",
  "market.customer_size_segment",
  "market.served_country",
  "market.contract_model",
  "market.sales_motion",
] as const);

export type MarketRouteBusinessDnaSource = Readonly<{
  company: Readonly<{
    name: string;
    website: string;
    summary: string;
    industry: string;
    businessModel: string;
    locations: readonly string[];
  }>;
  offers: readonly Readonly<{ name: string; description: string; confidence: number }>[];
  idealCustomers: readonly Readonly<{
    segment: string;
    industries: readonly string[];
    companySize: string;
    geographies: readonly string[];
    buyerRoles: readonly string[];
    pains: readonly string[];
    confidence: number;
  }>[];
  campaigns: readonly Readonly<{ id: string; objective: string; audience: string }>[];
  unknowns: readonly string[];
}>;

export type MarketRouteAiEnvelope<T> = Readonly<{
  schemaVersion: string;
  promptVersion: string;
  model: string;
  generatedAt: string;
  confidence: number;
  payload: T;
}>;

export type MarketRouteGenesisT8SellerEntry = Readonly<{
  schema: typeof MARKETROUTE_GENESIS_T8_SELLER_ENTRY_SCHEMA;
  integrationVersion: typeof MARKETROUTE_GENESIS_T8_SELLER_ENTRY_VERSION;
  genesisPlatform: typeof GENESIS_T8_PLATFORM;
  ckrVersion: typeof GENESIS_T8_CE_R1_FREEZE_VERSION;
  ckrStatus: typeof GENESIS_T8_CE_R1_FREEZE_STATUS;
  udosibRelease: typeof GENESIS_T8_CE_R2_RELEASE;
  udosibVersion: typeof GENESIS_T8_MATHEMATICAL_CONSTITUTION_VERSION;
  udosibStatus: "FROZEN";
  aiResearchContractVersion: typeof GENESIS_T8_AI_RESEARCH_CONTRACT_VERSION;
  enteredAt: string;
  sellerEntity: GenesisT8EntityIdentity;
  baselineResearchDirectives: readonly GenesisT8PredicateResearchDirective[];
  legacyBusinessDna: MarketRouteBusinessDnaSource;
  source: Readonly<{
    schemaVersion: string;
    promptVersion: string;
    model: string;
    generatedAt: string;
  }>;
}>;

function assertNonEmpty(value: string, code: string): void {
  if (!value.trim()) throw new Error(`MARKETROUTE_GENESIS_T8_SELLER_ENTRY_VIOLATION:${code}`);
}

function canonicalHostname(website: string): string {
  let parsed: URL;
  try { parsed = new URL(website); }
  catch { throw new Error("MARKETROUTE_GENESIS_T8_SELLER_ENTRY_VIOLATION:WEBSITE_URL"); }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("MARKETROUTE_GENESIS_T8_SELLER_ENTRY_VIOLATION:WEBSITE_PROTOCOL");
  }
  const hostname = parsed.hostname.toLowerCase().replace(/^www\./, "");
  assertNonEmpty(hostname, "WEBSITE_HOSTNAME");
  return hostname;
}

function sellerEntityIdFromHostname(hostname: string): string {
  return `gen:organisation:domain:${hostname.replace(/[^a-z0-9_-]+/g, "_")}`;
}

export function assertMarketRouteBusinessDnaEntryInvariant(source: MarketRouteBusinessDnaSource): void {
  assertNonEmpty(source.company.name, "COMPANY_NAME");
  assertNonEmpty(source.company.summary, "COMPANY_SUMMARY");
  assertNonEmpty(source.company.industry, "COMPANY_INDUSTRY");
  assertNonEmpty(source.company.businessModel, "BUSINESS_MODEL");
  canonicalHostname(source.company.website);
  if (!source.offers.length) throw new Error("MARKETROUTE_GENESIS_T8_SELLER_ENTRY_VIOLATION:OFFERS_REQUIRED");
  if (!source.idealCustomers.length) throw new Error("MARKETROUTE_GENESIS_T8_SELLER_ENTRY_VIOLATION:IDEAL_CUSTOMERS_REQUIRED");
  if (!source.campaigns.length) throw new Error("MARKETROUTE_GENESIS_T8_SELLER_ENTRY_VIOLATION:COMMERCIAL_OBJECTIVES_REQUIRED");
  for (const offer of source.offers) {
    assertNonEmpty(offer.name, "OFFER_NAME");
    assertNonEmpty(offer.description, "OFFER_DESCRIPTION");
    if (!Number.isFinite(offer.confidence) || offer.confidence < 0 || offer.confidence > 1) {
      throw new Error("MARKETROUTE_GENESIS_T8_SELLER_ENTRY_VIOLATION:OFFER_CONFIDENCE");
    }
  }
}

/**
 * The first live MarketRoute -> Genesis T8 application boundary.
 *
 * Build 1 deliberately returns the existing Business DNA as a compatibility
 * payload. No deterministic semantic translation is performed here. Later R1
 * builds will replace that compatibility payload with persisted canonical
 * Genome objects generated through the AI Research Contract.
 */
export function enterMarketRouteSellerUnderstanding<T extends MarketRouteBusinessDnaSource>(
  envelope: MarketRouteAiEnvelope<T>,
  enteredAt = new Date().toISOString(),
): MarketRouteGenesisT8SellerEntry {
  assertMarketRouteBusinessDnaEntryInvariant(envelope.payload);
  if (!Number.isFinite(Date.parse(envelope.generatedAt))) {
    throw new Error("MARKETROUTE_GENESIS_T8_SELLER_ENTRY_VIOLATION:GENERATED_AT");
  }
  if (!Number.isFinite(Date.parse(enteredAt))) {
    throw new Error("MARKETROUTE_GENESIS_T8_SELLER_ENTRY_VIOLATION:ENTERED_AT");
  }
  const hostname = canonicalHostname(envelope.payload.company.website);
  const sellerEntity: GenesisT8EntityIdentity = Object.freeze({
    genesisEntityId: sellerEntityIdFromHostname(hostname),
    entityType: "ORGANISATION",
    canonicalLabel: envelope.payload.company.name.trim(),
    resolvedBy: "AI",
    aliasIds: Object.freeze([`marketroute:domain:${hostname}`]),
  });
  assertEntityIdentityInvariant(sellerEntity);

  return Object.freeze({
    schema: MARKETROUTE_GENESIS_T8_SELLER_ENTRY_SCHEMA,
    integrationVersion: MARKETROUTE_GENESIS_T8_SELLER_ENTRY_VERSION,
    genesisPlatform: GENESIS_T8_PLATFORM,
    ckrVersion: GENESIS_T8_CE_R1_FREEZE_VERSION,
    ckrStatus: GENESIS_T8_CE_R1_FREEZE_STATUS,
    udosibRelease: GENESIS_T8_CE_R2_RELEASE,
    udosibVersion: GENESIS_T8_MATHEMATICAL_CONSTITUTION_VERSION,
    udosibStatus: "FROZEN",
    aiResearchContractVersion: GENESIS_T8_AI_RESEARCH_CONTRACT_VERSION,
    enteredAt,
    sellerEntity,
    baselineResearchDirectives: buildAIResearchDirectives(MARKETROUTE_GENESIS_T8_BASELINE_SELLER_PREDICATES),
    legacyBusinessDna: envelope.payload,
    source: Object.freeze({
      schemaVersion: envelope.schemaVersion,
      promptVersion: envelope.promptVersion,
      model: envelope.model,
      generatedAt: envelope.generatedAt,
    }),
  });
}
