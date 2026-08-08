import { clamp01 } from "./math";
import type { ClaimTruthResult, TruthReviewFlag, TruthReviewReason } from "./types";
import type { TruthKernelPolicy } from "./policy";

export function buildReviewFlag(input: {
  truthIndex: number;
  confidence: number;
  coverage: number;
  claims: ClaimTruthResult[];
  policy: TruthKernelPolicy;
}): TruthReviewFlag {
  const { truthIndex, confidence, coverage, claims, policy } = input;
  const reasons: TruthReviewReason[] = [];
  const thresholds = policy.reviewThresholds;
  const criticalClaims = claims.filter((claim) => claim.criticality === "CRITICAL");
  const weakestCritical = criticalClaims.length
    ? Math.min(...criticalClaims.map((claim) => claim.confidence))
    : 1;
  const maxContradiction = claims.length
    ? Math.max(...claims.map((claim) => claim.contradiction))
    : 0;

  if (truthIndex < thresholds.truthIndex) reasons.push("LOW_TRUTH_INDEX");
  if (confidence < thresholds.confidence) reasons.push("LOW_CONFIDENCE");
  if (coverage < thresholds.coverage) reasons.push("LOW_COVERAGE");
  if (weakestCritical < thresholds.criticalClaim) reasons.push("CRITICAL_CLAIM_WEAK");
  if (maxContradiction >= thresholds.materialContradiction) reasons.push("MATERIAL_CONTRADICTION");

  const weakestClaimIds = [...claims]
    .sort((a, b) => a.confidence - b.confidence || b.weight - a.weight)
    .slice(0, 3)
    .map((claim) => claim.claimId);

  // Review priority expresses uncertainty and materiality only. It does not
  // mutate Truth Index and it is deliberately deterministic.
  const uncertainty = 1 - truthIndex;
  const criticalExposure = 1 - weakestCritical;
  const contradictionExposure = maxContradiction;
  const priorityScore = clamp01(
    0.5 * uncertainty + 0.3 * criticalExposure + 0.2 * contradictionExposure,
  );

  return {
    required: reasons.length > 0,
    reasons,
    priorityScore,
    weakestClaimIds,
  };
}
