import "server-only";
import { databaseRequest } from "@/lib/database/postgrest";
import type { TruthEntityType } from "@/lib/genesis-g8/truth";
import type { GenesisG8PersistedKnowledgeBundle } from "../read-model";
import type { GenesisG8PersistedClaim, GenesisG8PersistedEntity, GenesisG8PersistedEvidence, GenesisG8TruthSnapshot } from "./types";

type DbRow = Record<string, unknown>;
const s = (value: unknown): string => (typeof value === "string" ? value : String(value ?? ""));
const n = (value: unknown): number => Number(value ?? 0);
const b = (value: unknown): boolean => value === true || value === "true";
const nullableString = (value: unknown): string | null => value == null ? null : s(value);
const esc = (value: string) => encodeURIComponent(value);

const mapEntity = (row: DbRow): GenesisG8PersistedEntity => ({ id:s(row.id), entityType:s(row.entity_type) as TruthEntityType, canonicalKey:s(row.canonical_key), displayName:nullableString(row.display_name), contractVersion:s(row.contract_version) as GenesisG8PersistedEntity["contractVersion"], status:s(row.status) as GenesisG8PersistedEntity["status"], reviewState:s(row.review_state) as GenesisG8PersistedEntity["reviewState"], createdAt:s(row.created_at), updatedAt:s(row.updated_at) });
const mapClaim = (row: DbRow): GenesisG8PersistedClaim => ({ id:s(row.id), entityId:s(row.entity_id), claimKey:s(row.claim_key), label:s(row.label), criticality:s(row.criticality) as GenesisG8PersistedClaim["criticality"], weight:n(row.weight), freshnessHalfLifeDays:n(row.freshness_half_life_days), countsTowardCoverage:b(row.counts_toward_coverage), minimumEvidence:n(row.minimum_evidence), createdAt:s(row.created_at), updatedAt:s(row.updated_at) });
const mapEvidence = (row: DbRow): GenesisG8PersistedEvidence => ({ id:s(row.id), claimId:s(row.claim_id), direction:s(row.direction) as GenesisG8PersistedEvidence["direction"], sourceClass:s(row.source_class) as GenesisG8PersistedEvidence["sourceClass"], sourceUri:nullableString(row.source_uri), sourceRef:nullableString(row.source_ref), sourceFamily:nullableString(row.source_family), excerpt:nullableString(row.excerpt), strength:n(row.strength), traceability:n(row.traceability), independence:n(row.independence), observedAt:s(row.observed_at), channel:s(row.intelligence_channel) as GenesisG8PersistedEvidence["channel"], provenance:(row.provenance_json && typeof row.provenance_json === "object" ? row.provenance_json : {}) as GenesisG8PersistedEvidence["provenance"], createdAt:s(row.created_at) });
const mapSnapshot = (row: DbRow): GenesisG8TruthSnapshot => ({ id:s(row.id), entityId:s(row.entity_id), equationVersion:s(row.equation_version), contractVersion:s(row.contract_version) as GenesisG8TruthSnapshot["contractVersion"], confidence:n(row.confidence), coverage:n(row.coverage), truthIndex:n(row.truth_index), criticalClaimCeiling:n(row.critical_claim_ceiling), reviewRequired:b(row.review_required), reviewPriorityScore:n(row.review_priority_score), reviewReasons:(Array.isArray(row.review_reasons_json)?row.review_reasons_json:[]) as GenesisG8TruthSnapshot["reviewReasons"], result:row.result_json as GenesisG8TruthSnapshot["result"], calculatedAt:s(row.calculated_at) });

export async function getGenesisG8EntityById(entityId: string): Promise<GenesisG8PersistedEntity | null> {
  const rows = await databaseRequest<DbRow[]>(`genesis_g8_intelligence_entities?id=eq.${esc(entityId)}&limit=1`);
  return rows[0] ? mapEntity(rows[0]) : null;
}

export async function getGenesisG8EntityByCanonicalKey(entityType: TruthEntityType, canonicalKey: string): Promise<GenesisG8PersistedEntity | null> {
  const rows = await databaseRequest<DbRow[]>(`genesis_g8_intelligence_entities?entity_type=eq.${esc(entityType)}&canonical_key=eq.${esc(canonicalKey)}&limit=1`);
  return rows[0] ? mapEntity(rows[0]) : null;
}

export async function readGenesisG8KnowledgeBundle(entityId: string): Promise<GenesisG8PersistedKnowledgeBundle | null> {
  const entity = await getGenesisG8EntityById(entityId);
  if (!entity) return null;
  const claims = (await databaseRequest<DbRow[]>(`genesis_g8_intelligence_claims?entity_id=eq.${esc(entityId)}&order=created_at.asc,claim_key.asc`)).map(mapClaim);
  const claimIds = claims.map((claim) => claim.id);
  const evidence = claimIds.length
    ? (await databaseRequest<DbRow[]>(`genesis_g8_intelligence_evidence?claim_id=in.(${claimIds.map(esc).join(",")})&order=observed_at.desc`)).map(mapEvidence)
    : [];
  const snapshots = await databaseRequest<DbRow[]>(`genesis_g8_truth_snapshots?entity_id=eq.${esc(entityId)}&order=calculated_at.desc&limit=1`);
  return { entity, claims, evidence, latestSnapshot: snapshots[0] ? mapSnapshot(snapshots[0]) : null };
}
