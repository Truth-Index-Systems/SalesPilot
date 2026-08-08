import "server-only";

import { databaseRequest } from "@/lib/database/postgrest";
import { getIntelligenceContract } from "@/lib/genesis-g8/contracts";
import type { TruthIndexResult } from "@/lib/genesis-g8/truth";
import type {
  GenesisG8EntityWrite,
  GenesisG8EvidenceWrite,
  GenesisG8HumanReviewAction,
  GenesisG8HumanReviewReceipt,
  GenesisG8PersistedClaim,
  GenesisG8PersistedEntity,
  GenesisG8PersistedEvidence,
  GenesisG8TruthSnapshot,
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
    criticality: s(row.criticality) as GenesisG8PersistedClaim["criticality"],
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

function mapTruthSnapshot(row: DbRow): GenesisG8TruthSnapshot {
  return {
    id: s(row.id),
    entityId: s(row.entity_id),
    equationVersion: s(row.equation_version),
    contractVersion: s(row.contract_version) as GenesisG8TruthSnapshot["contractVersion"],
    confidence: n(row.confidence),
    coverage: n(row.coverage),
    truthIndex: n(row.truth_index),
    criticalClaimCeiling: n(row.critical_claim_ceiling),
    reviewRequired: b(row.review_required),
    reviewPriorityScore: n(row.review_priority_score),
    reviewReasons: (Array.isArray(row.review_reasons_json) ? row.review_reasons_json : []) as GenesisG8TruthSnapshot["reviewReasons"],
    result: row.result_json as GenesisG8TruthSnapshot["result"],
    calculatedAt: s(row.calculated_at),
  };
}

function mapReviewReceipt(row: DbRow): GenesisG8HumanReviewReceipt {
  return {
    id: s(row.id),
    entityId: s(row.entity_id),
    action: s(row.action) as GenesisG8HumanReviewReceipt["action"],
    reasonCode: nullableString(row.reason_code),
    note: nullableString(row.note),
    correction: row.correction_json && typeof row.correction_json === "object" ? row.correction_json as Record<string, unknown> : null,
    reviewerUserId: nullableString(row.reviewer_user_id),
    reviewedAt: s(row.reviewed_at),
    truthSnapshotId: nullableString(row.truth_snapshot_id),
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
  const contract = getIntelligenceContract(entityType);
  const rows = await databaseRequest<DbRow[]>("rpc/ensure_genesis_g8_contract_claims", {
    method: "POST",
    body: JSON.stringify({ p_entity_id: entityId, p_contract_version: contract.version, p_claims: contract.claims }),
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

export async function persistGenesisG8TruthSnapshot(entityId: string, contractVersion: string, result: TruthIndexResult): Promise<GenesisG8TruthSnapshot> {
  const rows = await databaseRequest<DbRow[]>("rpc/insert_genesis_g8_truth_snapshot", {
    method: "POST",
    body: JSON.stringify({
      p_entity_id: entityId, p_contract_version: contractVersion, p_equation_version: result.equationVersion,
      p_confidence: result.confidence, p_coverage: result.coverage, p_truth_index: result.truthIndex,
      p_critical_claim_ceiling: result.criticalClaimCeiling, p_review_required: result.review.required,
      p_review_priority_score: result.review.priorityScore, p_review_reasons: result.review.reasons,
      p_result: result, p_calculated_at: result.calculatedAt,
    }),
  });
  if (!rows?.[0]) throw new Error("GENESIS_G8_TRUTH_SNAPSHOT_INSERT_EMPTY");
  return mapTruthSnapshot(rows[0]);
}

export async function recordGenesisG8HumanReview(input: {
  entityId: string;
  action: GenesisG8HumanReviewAction;
  reviewerUserId?: string | null;
  reasonCode?: string | null;
  note?: string | null;
  correction?: Record<string, unknown> | null;
  truthSnapshotId?: string | null;
}): Promise<GenesisG8HumanReviewReceipt> {
  const rows = await databaseRequest<DbRow[]>("rpc/record_genesis_g8_human_review", {
    method: "POST",
    body: JSON.stringify({
      p_entity_id: input.entityId, p_action: input.action, p_reviewer_user_id: input.reviewerUserId ?? null,
      p_reason_code: input.reasonCode ?? null, p_note: input.note ?? null, p_correction: input.correction ?? null,
      p_truth_snapshot_id: input.truthSnapshotId ?? null,
    }),
  });
  if (!rows?.[0]) throw new Error("GENESIS_G8_REVIEW_INSERT_EMPTY");
  return mapReviewReceipt(rows[0]);
}
