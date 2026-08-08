import type { IntelligenceClaimDefinition } from "./contracts";
import { getIntelligenceContract } from "./contracts";
import type {
  GenesisG8PersistedClaim,
  GenesisG8PersistedEntity,
  GenesisG8PersistedEvidence,
  GenesisG8TruthSnapshot,
} from "./persistence/types";
import { calculateTruthIndex, type TruthClaim, type TruthEvidence, type TruthIndexResult } from "./truth";

export type GenesisG8GapReason =
  | "MISSING_EVIDENCE"
  | "INSUFFICIENT_EVIDENCE"
  | "LOW_CONFIDENCE"
  | "CONTRADICTED"
  | "STALE_EVIDENCE";

export interface GenesisG8IntelligenceGap {
  claimId: string;
  claimKey: string;
  label: string;
  criticality: GenesisG8PersistedClaim["criticality"];
  reason: GenesisG8GapReason;
  priority: number;
  evidenceCount: number;
  minimumEvidence: number;
  confidence: number;
  freshestEvidenceAt: string | null;
}

export interface GenesisG8PersistedKnowledgeBundle {
  entity: GenesisG8PersistedEntity;
  claims: GenesisG8PersistedClaim[];
  evidence: GenesisG8PersistedEvidence[];
  latestSnapshot: GenesisG8TruthSnapshot | null;
}

export interface GenesisG8HydratedKnowledge {
  entity: GenesisG8PersistedEntity;
  evaluable: { id: string; entityType: GenesisG8PersistedEntity["entityType"]; claims: TruthClaim[] };
  truth: TruthIndexResult;
  latestPersistedTruth: GenesisG8TruthSnapshot | null;
  gaps: GenesisG8IntelligenceGap[];
  needsRecalculation: boolean;
  hydratedAt: string;
}

const clamp01 = (value: number) => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
const toMs = (value: string) => {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

function toTruthEvidence(evidence: GenesisG8PersistedEvidence, claim: GenesisG8PersistedClaim): TruthEvidence {
  return {
    id: evidence.id,
    claimId: evidence.claimId,
    direction: evidence.direction,
    sourceClass: evidence.sourceClass,
    strength: clamp01(evidence.strength),
    traceability: clamp01(evidence.traceability),
    independence: clamp01(evidence.independence),
    observedAt: evidence.observedAt,
    freshnessHalfLifeDays: claim.freshnessHalfLifeDays,
  };
}

function gapPriority(definition: IntelligenceClaimDefinition, confidence: number, reason: GenesisG8GapReason) {
  const criticalityFactor = definition.criticality === "CRITICAL" ? 1 : definition.criticality === "REQUIRED" ? 0.8 : definition.criticality === "SUPPORTING" ? 0.5 : 0.25;
  const reasonFactor = reason === "CONTRADICTED" ? 1 : reason === "MISSING_EVIDENCE" ? 0.95 : reason === "STALE_EVIDENCE" ? 0.85 : 0.75;
  return Math.round(100 * clamp01(criticalityFactor * reasonFactor * (1 - confidence / 100)) * 100) / 100;
}

export function hydrateGenesisG8Knowledge(
  bundle: GenesisG8PersistedKnowledgeBundle,
  options: { now?: Date; lowConfidenceThreshold?: number; staleFreshnessThreshold?: number } = {},
): GenesisG8HydratedKnowledge {
  const now = options.now ?? new Date();
  const lowConfidenceThreshold = options.lowConfidenceThreshold ?? 60;
  const staleFreshnessThreshold = options.staleFreshnessThreshold ?? 35;
  const contract = getIntelligenceContract(bundle.entity.entityType);
  const persistedByKey = new Map(bundle.claims.map((claim) => [claim.claimKey, claim]));
  const evidenceByClaim = new Map<string, GenesisG8PersistedEvidence[]>();
  for (const item of bundle.evidence) {
    const current = evidenceByClaim.get(item.claimId) ?? [];
    current.push(item);
    evidenceByClaim.set(item.claimId, current);
  }

  const evaluableClaims: TruthClaim[] = contract.claims.map((definition) => {
    const persisted = persistedByKey.get(definition.key);
    const id = persisted?.id ?? `${bundle.entity.id}:${definition.key}`;
    const evidence = persisted ? (evidenceByClaim.get(persisted.id) ?? []).map((item) => toTruthEvidence(item, persisted)) : [];
    return { id, key: definition.key, label: definition.label, criticality: definition.criticality, weight: definition.weight, evidence };
  });

  const evaluable = { id: bundle.entity.id, entityType: bundle.entity.entityType, claims: evaluableClaims };
  const truth = calculateTruthIndex(evaluable, { now });
  const resultByKey = new Map(truth.claims.map((claim) => [claim.key, claim]));
  const gaps: GenesisG8IntelligenceGap[] = [];

  for (const definition of contract.claims) {
    const persisted = persistedByKey.get(definition.key);
    const storedEvidence = persisted ? evidenceByClaim.get(persisted.id) ?? [] : [];
    const result = resultByKey.get(definition.key);
    const confidence = result?.confidence ?? 0;
    const freshest = storedEvidence.length ? [...storedEvidence].sort((a, b) => toMs(b.observedAt) - toMs(a.observedAt))[0] : null;
    const minFreshness = result?.evidence.length ? Math.min(...result.evidence.map((item) => item.freshness)) : 100;
    const contradiction = result?.contradiction ?? 0;
    let reason: GenesisG8GapReason | null = null;
    if (!storedEvidence.length) reason = "MISSING_EVIDENCE";
    else if (storedEvidence.length < definition.minimumEvidence) reason = "INSUFFICIENT_EVIDENCE";
    else if (contradiction >= 35) reason = "CONTRADICTED";
    else if (minFreshness < staleFreshnessThreshold) reason = "STALE_EVIDENCE";
    else if (confidence < lowConfidenceThreshold) reason = "LOW_CONFIDENCE";
    if (reason) gaps.push({
      claimId: persisted?.id ?? `${bundle.entity.id}:${definition.key}`,
      claimKey: definition.key,
      label: definition.label,
      criticality: definition.criticality,
      reason,
      priority: gapPriority(definition, confidence, reason),
      evidenceCount: storedEvidence.length,
      minimumEvidence: definition.minimumEvidence,
      confidence,
      freshestEvidenceAt: freshest?.observedAt ?? null,
    });
  }

  gaps.sort((a, b) => b.priority - a.priority || a.claimKey.localeCompare(b.claimKey));
  const latestPersistedTruth = bundle.latestSnapshot;
  const latestEvidenceCreatedAt = bundle.evidence.reduce((latest, item) => Math.max(latest, toMs(item.createdAt)), 0);
  const latestSnapshotAt = latestPersistedTruth ? toMs(latestPersistedTruth.calculatedAt) : 0;
  const needsRecalculation = !latestPersistedTruth
    || latestPersistedTruth.equationVersion !== truth.equationVersion
    || latestPersistedTruth.contractVersion !== contract.version
    || latestEvidenceCreatedAt > latestSnapshotAt;

  return { entity: bundle.entity, evaluable, truth, latestPersistedTruth, gaps, needsRecalculation, hydratedAt: now.toISOString() };
}
