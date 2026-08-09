import "server-only";

import { databaseRequest } from "@/lib/database/postgrest";
import { getMrTi2ClaimContract } from "@/lib/genesis-g8/truth-v2/contracts";
import type {
  GenesisG8EntityWrite,
  GenesisG8EvidenceWrite,
  GenesisG8PersistedClaim,
  GenesisG8PersistedEntity,
  GenesisG8PersistedEvidence,
} from "./types";

type DbRow = Record<string, unknown>;
const s = (value: unknown): string => (typeof value === "string" ? value : String(value ?? ""));
const n = (value: unknown): number => Number(value ?? 0);
const b = (value: unknown): boolean => value === true || value === "true";
const nullableString = (value: unknown): string | null => (value == null ? null : s(value));

function mapEntity(row: DbRow): GenesisG8PersistedEntity {
  return {
    id: s(row.id),
    entityType: s(row.entity_type) as GenesisG8PersistedEntity["entityType"],
    canonicalKey: s(row.canonical_key),
    displayName: nullableString(row.display_name),
    contractVersion: s(row.contract_version) as GenesisG8PersistedEntity["contractVersion"],
    status: s(row.status) as GenesisG8PersistedEntity["status"],
    reviewState: s(row.review_state) as GenesisG8PersistedEntity["reviewState"],
    createdAt: s(row.created_at),
    updatedAt: s(row.updated_at),
  };
}

function mapClaim(row: DbRow): GenesisG8PersistedClaim {
  return {
    id: s(row.id),
    entityId: s(row.entity_id),
    claimKey: s(row.claim_key),
    label: s(row.label),
    weight: n(row.weight),
    freshnessHalfLifeDays: n(row.freshness_half_life_days),
    countsTowardCoverage: b(row.counts_toward_coverage),
    minimumEvidence: n(row.minimum_evidence),
    createdAt: s(row.created_at),
    updatedAt: s(row.updated_at),
  };
}

function mapEvidence(row: DbRow): GenesisG8PersistedEvidence {
  const provenance = (row.provenance_json && typeof row.provenance_json === "object" ? row.provenance_json : {}) as GenesisG8PersistedEvidence["provenance"];
  return {
    id: s(row.id),
    claimId: s(row.claim_id),
    direction: s(row.direction) as GenesisG8PersistedEvidence["direction"],
    sourceClass: s(row.source_class) as GenesisG8PersistedEvidence["sourceClass"],
    sourceUri: nullableString(row.source_uri),
    sourceRef: nullableString(row.source_ref),
    sourceFamily: nullableString(row.source_family),
    excerpt: nullableString(row.excerpt),
    strength: n(row.strength),
    traceability: n(row.traceability),
    independence: n(row.independence),
    observedAt: s(row.observed_at),
    channel: s(row.intelligence_channel) as GenesisG8PersistedEvidence["channel"],
    provenance,
    createdAt: s(row.created_at),
  };
}


export async function upsertGenesisG8Entity(input: GenesisG8EntityWrite): Promise<GenesisG8PersistedEntity> {
  const rows = await databaseRequest<DbRow[]>("rpc/upsert_genesis_g8_intelligence_entity", {
    method: "POST",
    body: JSON.stringify({ p_entity_type: input.entityType, p_canonical_key: input.canonicalKey, p_display_name: input.displayName ?? null, p_contract_version: input.contractVersion }),
  });
  if (!rows?.[0]) throw new Error("GENESIS_G8_ENTITY_UPSERT_EMPTY");
  return mapEntity(rows[0]);
}

export async function ensureGenesisG8ContractClaims(entityId: string, entityType: GenesisG8EntityWrite["entityType"]): Promise<GenesisG8PersistedClaim[]> {
  const contract = getMrTi2ClaimContract(entityType);
  // Existing persistence RPC/table retain their historical criticality column for schema compatibility only.
  // All live semantics come from MR-TI-2 impactClass/weight/half-life.
  const claims = contract.claims.map((claim) => ({
    key: claim.key,
    label: claim.label,
    criticality: claim.impactClass === "FOUNDATIONAL" ? "CRITICAL" : claim.impactClass === "COMMERCIAL" ? "REQUIRED" : claim.impactClass,
    weight: claim.weight,
    freshnessHalfLifeDays: claim.freshnessHalfLifeDays,
    minimumEvidence: 1,
    countsTowardCoverage: claim.countsTowardCoverage,
  }));
  const rows = await databaseRequest<DbRow[]>("rpc/ensure_genesis_g8_contract_claims", {
    method: "POST",
    body: JSON.stringify({ p_entity_id: entityId, p_contract_version: contract.version, p_claims: claims }),
  });
  return rows.map(mapClaim);
}

export async function insertGenesisG8Evidence(input: GenesisG8EvidenceWrite): Promise<GenesisG8PersistedEvidence> {
  const rows = await databaseRequest<DbRow[]>("rpc/insert_genesis_g8_evidence", {
    method: "POST",
    body: JSON.stringify({
      p_claim_id: input.claimId, p_direction: input.direction, p_source_class: input.sourceClass,
      p_source_uri: input.sourceUri ?? null, p_source_ref: input.sourceRef ?? null, p_source_family: input.sourceFamily ?? null,
      p_excerpt: input.excerpt ?? null, p_strength: input.strength, p_traceability: input.traceability,
      p_independence: input.independence, p_observed_at: input.observedAt, p_channel: input.channel, p_provenance: input.provenance,
    }),
  });
  if (!rows?.[0]) throw new Error("GENESIS_G8_EVIDENCE_INSERT_EMPTY");
  return mapEvidence(rows[0]);
}
