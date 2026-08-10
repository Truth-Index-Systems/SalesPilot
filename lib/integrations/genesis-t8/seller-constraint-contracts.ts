import { assertGenesisSellerArtifactCommitAuthority } from "./ai-boundary";
import "server-only";
import { createHash } from "node:crypto";
import { databaseRequest } from "@/lib/database/postgrest";
import { sanitisePostgresJson } from "@/lib/database/postgres-json";
import type { GenesisT8CommercialDimension } from "@/lib/genesis-t8/commercial-graph-9d";
import type { GenesisT8ConstraintApplicability, GenesisT8ConstraintClass } from "@/lib/genesis-t8/mathematics/constraints";
import type { MarketRouteGenesisT8CampaignSellerContext } from "./campaign-seller-context";

export const MARKETROUTE_GENESIS_T8_CONSTRAINT_SET_VERSION = "MR-R1-BUILD5-1.0.0" as const;
export const MARKETROUTE_GENESIS_T8_CONSTRAINT_SET_SCHEMA = "marketroute_genesis_t8_seller_constraint_set/v1" as const;

export const MARKETROUTE_GENESIS_T8_SELLER_CONSTRAINT_CLASSES = Object.freeze([
  "BOUNDARY",
  "SUPPORTING",
  "LIMITING",
  "UNKNOWN",
] as const);
export type MarketRouteGenesisSellerConstraintClass = (typeof MARKETROUTE_GENESIS_T8_SELLER_CONSTRAINT_CLASSES)[number];

export type MarketRouteGenesisSellerConstraintContract = Readonly<{
  constraintId: string;
  constraintClass: MarketRouteGenesisSellerConstraintClass;
  applicability: GenesisT8ConstraintApplicability;
  scope: "SELLER" | "OFFERING" | "TARGETING" | "OBJECTIVE";
  semanticDependencyKey: string;
  statement: string;
  sourcePath: string;
  sourceValues: readonly string[];
  relevantDimensions: readonly Exclude<GenesisT8CommercialDimension, "TRUTH">[];
  sourceConfidence: number | null;
}>;

export type MarketRouteGenesisSellerConstraintSet = Readonly<{
  schema: typeof MARKETROUTE_GENESIS_T8_CONSTRAINT_SET_SCHEMA;
  version: typeof MARKETROUTE_GENESIS_T8_CONSTRAINT_SET_VERSION;
  campaignId: string;
  organisationId: string;
  sellerEntityId: string;
  selectedCommercialObjectiveId: string;
  sellerContextFingerprint: string;
  constraintFingerprint: string;
  extractedAt: string;
  boundaryConstraints: readonly MarketRouteGenesisSellerConstraintContract[];
  supportingConstraints: readonly MarketRouteGenesisSellerConstraintContract[];
  limitingConstraints: readonly MarketRouteGenesisSellerConstraintContract[];
  unknownConstraints: readonly MarketRouteGenesisSellerConstraintContract[];
  allConstraints: readonly MarketRouteGenesisSellerConstraintContract[];
}>;

type StoredConstraintSetRow = Readonly<{
  campaign_id: string;
  organisation_id: string;
  schema_version: string;
  integration_version: string;
  seller_context_fingerprint: string;
  constraint_fingerprint: string;
  constraint_set_json: unknown;
  created_at: string;
}>;

function stable(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
function stableId(parts: readonly string[]): string {
  return `mrc:${stable(parts).slice(0, 32)}`;
}
function unique(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values.map(value => value.trim()).filter(Boolean))]);
}
function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return value;
}
function contract(input: Omit<MarketRouteGenesisSellerConstraintContract, "constraintId">): MarketRouteGenesisSellerConstraintContract {
  const sourceValues = unique(input.sourceValues);
  return deepFreeze({
    ...input,
    sourceValues,
    constraintId: stableId([input.constraintClass, input.scope, input.semanticDependencyKey, input.sourcePath, ...sourceValues]),
  });
}

/**
 * Build 5 extraction is deterministic projection of semantics already accepted
 * at the Genesis seller boundary. It performs no new AI interpretation.
 *
 * BOUNDARY is deliberately narrow: a commercially viable target state must be
 * connected to at least one persisted seller offering and the selected
 * commercial objective. ICP fields are LIMITING rather than hard boundaries so
 * the migration does not turn preference into false impossibility.
 */
export function buildMarketRouteGenesisSellerConstraintSet(
  stored: MarketRouteGenesisT8CampaignSellerContext,
  extractedAt = new Date().toISOString(),
): MarketRouteGenesisSellerConstraintSet {
  assertGenesisSellerArtifactCommitAuthority("GENESIS", "CONSTRAINT_CONTRACTS");
  if (!Number.isFinite(Date.parse(extractedAt))) throw new Error("MARKETROUTE_GENESIS_CONSTRAINT_SET_INVALID:EXTRACTED_AT");
  const dna = stored.sellerUnderstanding.legacyBusinessDna;
  const objective = dna.campaigns.find(item => item.id === stored.selectedCommercialObjectiveId);
  if (!objective) throw new Error("MARKETROUTE_GENESIS_CONSTRAINT_SET_INVALID:OBJECTIVE_MISSING");

  const boundaryConstraints = [
    contract({
      constraintClass: "BOUNDARY",
      applicability: "APPLICABLE",
      scope: "OFFERING",
      semanticDependencyKey: "seller.has_persisted_commercial_offering",
      statement: "A viable commercial reality must relate to at least one persisted seller offering.",
      sourcePath: "businessDNA.offers",
      sourceValues: dna.offers.map(item => item.name),
      relevantDimensions: ["COMMERCIAL", "OPERATIONAL"],
      sourceConfidence: dna.offers.length ? Math.max(...dna.offers.map(item => item.confidence)) : null,
    }),
    contract({
      constraintClass: "BOUNDARY",
      applicability: "APPLICABLE",
      scope: "OBJECTIVE",
      semanticDependencyKey: "seller.selected_commercial_objective",
      statement: "Reasoning for this campaign must remain scoped to the immutable selected commercial objective.",
      sourcePath: "businessDNA.campaigns[selectedCommercialObjectiveId]",
      sourceValues: [objective.objective, objective.audience],
      relevantDimensions: ["STRATEGIC", "COMMERCIAL"],
      sourceConfidence: null,
    }),
  ];

  const supportingConstraints = dna.offers.map((offer, index) => contract({
    constraintClass: "SUPPORTING",
    applicability: "APPLICABLE",
    scope: "OFFERING",
    semanticDependencyKey: `seller.offering.${index}`,
    statement: `Persisted seller offering: ${offer.name}.`,
    sourcePath: `businessDNA.offers[${index}]`,
    sourceValues: [offer.name, offer.description],
    relevantDimensions: ["COMMERCIAL", "OPERATIONAL", "SEMANTIC"],
    sourceConfidence: offer.confidence,
  }));

  const limitingConstraints: MarketRouteGenesisSellerConstraintContract[] = [];
  dna.idealCustomers.forEach((icp, index) => {
    const candidates: Array<{ key: string; label: string; values: readonly string[]; dimensions: readonly Exclude<GenesisT8CommercialDimension, "TRUTH">[] }> = [
      { key: "industries", label: "preferred customer industries", values: icp.industries, dimensions: ["COMMERCIAL", "STRATEGIC"] },
      { key: "company_size", label: "preferred company-size segment", values: [icp.companySize], dimensions: ["STRUCTURAL", "COMMERCIAL"] },
      { key: "geographies", label: "preferred customer geographies", values: icp.geographies, dimensions: ["STRUCTURAL", "COMMERCIAL"] },
      { key: "buyer_roles", label: "preferred buyer roles", values: icp.buyerRoles, dimensions: ["RELATIONAL", "COMMERCIAL"] },
      { key: "pains", label: "commercial pains the seller is positioned to address", values: icp.pains, dimensions: ["OPERATIONAL", "COMMERCIAL"] },
    ];
    for (const candidate of candidates) {
      const values = unique(candidate.values);
      if (!values.length) continue;
      limitingConstraints.push(contract({
        constraintClass: "LIMITING",
        applicability: "APPLICABLE",
        scope: "TARGETING",
        semanticDependencyKey: `seller.icp.${index}.${candidate.key}`,
        statement: `Seller Business DNA records ${candidate.label}; this restricts preferred targeting but does not by itself eliminate an otherwise viable commercial reality.`,
        sourcePath: `businessDNA.idealCustomers[${index}].${candidate.key}`,
        sourceValues: values,
        relevantDimensions: candidate.dimensions,
        sourceConfidence: icp.confidence,
      }));
    }
  });

  const unknownConstraints = dna.unknowns.map((unknown, index) => contract({
    constraintClass: "UNKNOWN",
    applicability: "UNRESOLVED",
    scope: "SELLER",
    semanticDependencyKey: `seller.unknown.${index}`,
    statement: unknown,
    sourcePath: `businessDNA.unknowns[${index}]`,
    sourceValues: [unknown],
    relevantDimensions: ["SEMANTIC", "COMMERCIAL", "STRATEGIC"],
    sourceConfidence: null,
  }));

  const allConstraints = deepFreeze([
    ...boundaryConstraints,
    ...supportingConstraints,
    ...limitingConstraints,
    ...unknownConstraints,
  ]);
  const constraintFingerprint = stable({
    sellerContextFingerprint: stored.sourceFingerprint,
    selectedCommercialObjectiveId: stored.selectedCommercialObjectiveId,
    contracts: allConstraints,
    version: MARKETROUTE_GENESIS_T8_CONSTRAINT_SET_VERSION,
  });

  return deepFreeze({
    schema: MARKETROUTE_GENESIS_T8_CONSTRAINT_SET_SCHEMA,
    version: MARKETROUTE_GENESIS_T8_CONSTRAINT_SET_VERSION,
    campaignId: stored.campaignId,
    organisationId: stored.organisationId,
    sellerEntityId: stored.sellerUnderstanding.sellerEntity.genesisEntityId,
    selectedCommercialObjectiveId: stored.selectedCommercialObjectiveId,
    sellerContextFingerprint: stored.sourceFingerprint,
    constraintFingerprint,
    extractedAt,
    boundaryConstraints,
    supportingConstraints,
    limitingConstraints,
    unknownConstraints,
    allConstraints,
  });
}

export async function persistMarketRouteGenesisSellerConstraintSet(set: MarketRouteGenesisSellerConstraintSet): Promise<void> {
  await databaseRequest("rpc/persist_campaign_genesis_t8_constraint_set", {
    method: "POST",
    body: JSON.stringify({
      p_campaign_id: set.campaignId,
      p_organisation_id: set.organisationId,
      p_schema_version: set.schema,
      p_integration_version: set.version,
      p_seller_context_fingerprint: set.sellerContextFingerprint,
      p_constraint_fingerprint: set.constraintFingerprint,
      p_constraint_set: sanitisePostgresJson(set),
    }),
  });
}

function assertStoredConstraintSet(
  row: StoredConstraintSetRow,
  stored: MarketRouteGenesisT8CampaignSellerContext,
): MarketRouteGenesisSellerConstraintSet {
  if (row.campaign_id !== stored.campaignId || row.organisation_id !== stored.organisationId) throw new Error("GENESIS_SELLER_CONSTRAINT_BOUNDARY_MISMATCH");
  if (row.schema_version !== MARKETROUTE_GENESIS_T8_CONSTRAINT_SET_SCHEMA || row.integration_version !== MARKETROUTE_GENESIS_T8_CONSTRAINT_SET_VERSION) throw new Error("GENESIS_SELLER_CONSTRAINT_VERSION_UNSUPPORTED");
  if (row.seller_context_fingerprint !== stored.sourceFingerprint) throw new Error("GENESIS_SELLER_CONSTRAINT_SOURCE_MISMATCH");
  if (!row.constraint_set_json || typeof row.constraint_set_json !== "object" || Array.isArray(row.constraint_set_json)) throw new Error("GENESIS_SELLER_CONSTRAINT_PAYLOAD_INVALID");
  const set = row.constraint_set_json as MarketRouteGenesisSellerConstraintSet;
  if (set.constraintFingerprint !== row.constraint_fingerprint || set.sellerContextFingerprint !== row.seller_context_fingerprint) throw new Error("GENESIS_SELLER_CONSTRAINT_FINGERPRINT_MISMATCH");
  if (!Array.isArray(set.allConstraints) || !Array.isArray(set.boundaryConstraints) || !Array.isArray(set.supportingConstraints) || !Array.isArray(set.limitingConstraints) || !Array.isArray(set.unknownConstraints)) throw new Error("GENESIS_SELLER_CONSTRAINT_BUCKETS_INVALID");
  for (const item of set.allConstraints) {
    if (!MARKETROUTE_GENESIS_T8_SELLER_CONSTRAINT_CLASSES.includes(item.constraintClass)) throw new Error("GENESIS_SELLER_CONSTRAINT_CLASS_INVALID");
  }
  return deepFreeze(set);
}

export async function loadOrMaterialiseMarketRouteGenesisSellerConstraintSet(
  stored: MarketRouteGenesisT8CampaignSellerContext,
): Promise<MarketRouteGenesisSellerConstraintSet> {
  const rows = await databaseRequest<StoredConstraintSetRow[]>(
    `campaign_genesis_t8_constraint_sets?campaign_id=eq.${encodeURIComponent(stored.campaignId)}&organisation_id=eq.${encodeURIComponent(stored.organisationId)}&select=campaign_id,organisation_id,schema_version,integration_version,seller_context_fingerprint,constraint_fingerprint,constraint_set_json,created_at&limit=1`,
  );
  const existing = rows[0];
  if (existing) return assertStoredConstraintSet(existing, stored);

  // Historical Build 2-4 campaigns are materialised deterministically on first
  // Genesis read. No AI call occurs and the immutable seller context is not changed.
  const set = buildMarketRouteGenesisSellerConstraintSet(stored);
  await persistMarketRouteGenesisSellerConstraintSet(set);
  return set;
}

export function constraintContractsForDownstream(set: MarketRouteGenesisSellerConstraintSet): Readonly<Record<string, unknown>> {
  return deepFreeze({
    schema: set.schema,
    version: set.version,
    constraintFingerprint: set.constraintFingerprint,
    boundary: set.boundaryConstraints,
    supporting: set.supportingConstraints,
    limiting: set.limitingConstraints,
    unknown: set.unknownConstraints,
  });
}

// Compile-time assertion that Build 5 classes remain a strict subset of the
// frozen CE-R2 constraint language.
const _constraintClassCompatibility: readonly GenesisT8ConstraintClass[] = MARKETROUTE_GENESIS_T8_SELLER_CONSTRAINT_CLASSES;
void _constraintClassCompatibility;
