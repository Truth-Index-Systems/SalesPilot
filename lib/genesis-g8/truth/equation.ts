import { evaluateClaim } from "./claim";
import { buildReviewFlag } from "./review";
import { clamp01, roundPercent, weightedMean } from "./math";
import { DEFAULT_TRUTH_KERNEL_POLICY, type TruthKernelPolicy } from "./policy";
import type { TruthEvaluable, TruthIndexResult } from "./types";

export interface CalculateTruthIndexOptions {
  now?: Date;
  policy?: TruthKernelPolicy;
}

export function calculateTruthIndex(
  entity: TruthEvaluable,
  options: CalculateTruthIndexOptions = {},
): TruthIndexResult {
  const now = options.now ?? new Date();
  const policy = options.policy ?? DEFAULT_TRUTH_KERNEL_POLICY;
  const claims = entity.claims.map((claim) => evaluateClaim(claim, policy, now));

  const totalWeight = claims.reduce((sum, claim) => sum + claim.weight, 0);
  const evidencedWeight = claims
    .filter((claim) => claim.hasEvidence)
    .reduce((sum, claim) => sum + claim.weight, 0);
  const coverage01 = totalWeight > 0 ? clamp01(evidencedWeight / totalWeight) : 0;

  // Confidence deliberately describes only the reliability of represented
  // knowledge. Missing claims affect coverage, not the confidence denominator.
  const represented = claims.filter((claim) => claim.hasEvidence);
  const confidence01 = weightedMean(
    represented.map((claim) => ({ value: claim.confidence, weight: claim.weight })),
  );

  const criticalClaims = claims.filter((claim) => claim.criticality === "CRITICAL");
  const criticalCeiling01 = criticalClaims.length
    ? Math.min(...criticalClaims.map((claim) => claim.confidence))
    : 1;

  // MR-TI-1.0: completeness constrains represented confidence; a weak critical
  // proposition is a hard ceiling so strong supporting claims cannot mask it.
  const calculated01 = clamp01(confidence01 * coverage01);
  const truthIndex01 = Math.min(calculated01, criticalCeiling01);

  const review = buildReviewFlag({
    truthIndex: truthIndex01,
    confidence: confidence01,
    coverage: coverage01,
    claims,
    policy,
  });

  return {
    entityId: entity.id,
    entityType: entity.entityType,
    equationVersion: policy.equationVersion,
    calculatedAt: now.toISOString(),
    confidence: roundPercent(confidence01),
    coverage: roundPercent(coverage01),
    truthIndex: roundPercent(truthIndex01),
    criticalClaimCeiling: roundPercent(criticalCeiling01),
    claims: claims.map((claim) => ({
      ...claim,
      confidence: roundPercent(claim.confidence),
      support: roundPercent(claim.support),
      contradiction: roundPercent(claim.contradiction),
      evidence: claim.evidence.map((item) => ({
        ...item,
        authority: roundPercent(item.authority),
        freshness: roundPercent(item.freshness),
        effectiveStrength: roundPercent(item.effectiveStrength),
      })),
    })),
    review: {
      ...review,
      priorityScore: roundPercent(review.priorityScore),
    },
  };
}
