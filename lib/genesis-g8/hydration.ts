import "server-only";

import { readGenesisG8KnowledgeBundle } from "./persistence/read-repository";
import type { GenesisG8PersistedEntity } from "./persistence/types";
import { getMrTi2ClaimContract } from "./truth-v2/contracts";
import { calculateAndPersistMrTi2Truth } from "./truth-v2/production-hydration";
import { prioritiseMrTi2Research } from "./truth-v2/research-priority";
import type { MrTi2EntityTruthResult } from "./truth-v2/entity";

export type GenesisG8GapReason = "MISSING_EVIDENCE" | "INSUFFICIENT_EVIDENCE" | "LOW_CONFIDENCE" | "CONTRADICTED" | "STALE_EVIDENCE";
export type GenesisG8CompatibilityCriticality = "CRITICAL" | "REQUIRED" | "SUPPORTING" | "OPTIONAL";

export interface GenesisG8IntelligenceGap {
  claimId: string;
  claimKey: string;
  label: string;
  criticality: GenesisG8CompatibilityCriticality;
  impactClass: "FOUNDATIONAL" | "COMMERCIAL" | "SUPPORTING" | "OPTIONAL";
  reason: GenesisG8GapReason;
  priority: number;
  evidenceCount: number;
  minimumEvidence: number;
  confidence: number;
  freshestEvidenceAt: string | null;
}

export interface GenesisG8ProductionTruth {
  engineVersion: "MR-TI-2.0";
  truthIndex: number;
  confidence: number;
  coverage: number;
  foundationalIntegrity: number;
  maxContradictionSeverity: number;
  review: { required: boolean; state: "AUTO" | "VERIFY" | "HUMAN_REVIEW_REQUIRED" };
  result: MrTi2EntityTruthResult;
}

export interface GenesisG8HydratedKnowledge {
  entity: GenesisG8PersistedEntity;
  truth: GenesisG8ProductionTruth;
  gaps: GenesisG8IntelligenceGap[];
  needsRecalculation: false;
  hydratedAt: string;
}

const compatibilityCriticality = (impact: GenesisG8IntelligenceGap["impactClass"]): GenesisG8CompatibilityCriticality =>
  impact === "FOUNDATIONAL" ? "CRITICAL" : impact === "COMMERCIAL" ? "REQUIRED" : impact;

export async function hydrateGenesisG8EntityTruth(
  entityId: string,
  options: { now?: Date; persistIfChanged?: boolean } = {},
): Promise<GenesisG8HydratedKnowledge | null> {
  const bundle = await readGenesisG8KnowledgeBundle(entityId);
  if (!bundle) return null;
  const result = await calculateAndPersistMrTi2Truth(entityId);
  if (!result) return null;
  const contract = getMrTi2ClaimContract(bundle.entity.entityType);
  const byDefinition = new Map(contract.claims.map((definition) => [definition.key, definition]));
  const byContribution = new Map(result.diagnostics.contributions.map((item) => [item.claimKey, item]));
  const claimIdByKey = new Map(bundle.claims.map((claim) => [claim.claimKey, claim.id]));
  const evidenceByClaimId = new Map<string, typeof bundle.evidence>();
  for (const evidence of bundle.evidence) {
    const current = evidenceByClaimId.get(evidence.claimId) ?? [];
    current.push(evidence);
    evidenceByClaimId.set(evidence.claimId, current);
  }
  const priorities = new Map(prioritiseMrTi2Research(result).map((item) => [item.claimKey, item]));
  const gapKeys = new Set([...result.diagnostics.missingClaims, ...result.diagnostics.limitingClaims, ...result.diagnostics.contradictedClaims]);
  const gaps: GenesisG8IntelligenceGap[] = [];
  for (const claimKey of gapKeys) {
    const definition = byDefinition.get(claimKey);
    if (!definition) continue;
    const contribution = byContribution.get(claimKey);
    const claimId = claimIdByKey.get(claimKey) ?? `${entityId}:${claimKey}`;
    const evidence = claimIdByKey.has(claimKey) ? (evidenceByClaimId.get(claimId) ?? []) : [];
    const freshest = evidence.length ? [...evidence].sort((a,b)=>Date.parse(b.observedAt)-Date.parse(a.observedAt))[0]?.observedAt ?? null : null;
    const reason: GenesisG8GapReason = !contribution?.represented
      ? "MISSING_EVIDENCE"
      : contribution.reviewState !== "AUTO"
        ? "CONTRADICTED"
        : "LOW_CONFIDENCE";
    gaps.push({
      claimId,
      claimKey,
      label: definition.label,
      criticality: compatibilityCriticality(definition.impactClass),
      impactClass: definition.impactClass,
      reason,
      priority: priorities.get(claimKey)?.priority ?? definition.weight * 100,
      evidenceCount: evidence.length,
      minimumEvidence: 1,
      confidence: contribution?.probability === null || contribution?.probability === undefined ? 0 : contribution.probability * 100,
      freshestEvidenceAt: freshest,
    });
  }
  gaps.sort((a,b)=>b.priority-a.priority||a.claimKey.localeCompare(b.claimKey));
  return {
    entity: bundle.entity,
    truth: {
      engineVersion: "MR-TI-2.0",
      truthIndex: result.state.truthIndex,
      confidence: result.state.representedConfidence,
      coverage: result.state.coverage,
      foundationalIntegrity: result.state.foundationalIntegrity,
      maxContradictionSeverity: result.state.maxContradictionSeverity,
      review: { required: result.state.reviewState !== "AUTO", state: result.state.reviewState },
      result,
    },
    gaps,
    needsRecalculation: false,
    hydratedAt: options.now?.toISOString() ?? result.calculatedAt,
  };
}
