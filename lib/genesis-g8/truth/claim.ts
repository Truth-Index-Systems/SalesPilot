import { noisyOr, clamp01 } from "./math";
import { assessEvidence } from "./evidence";
import type { ClaimTruthResult, TruthClaim } from "./types";
import type { TruthKernelPolicy } from "./policy";

export function evaluateClaim(
  claim: TruthClaim,
  policy: TruthKernelPolicy,
  now: Date,
): ClaimTruthResult {
  const assessments = claim.evidence.map((item) => assessEvidence(item, policy, now));
  const support = noisyOr(
    assessments.filter((item) => item.direction === "SUPPORTS").map((item) => item.effectiveStrength),
  );
  const contradiction = noisyOr(
    assessments.filter((item) => item.direction === "CONTRADICTS").map((item) => item.effectiveStrength),
  );

  // Contradiction reduces confidence in the proposition rather than becoming an
  // unrelated penalty at entity level. Strong, fresh contradictory evidence can
  // therefore collapse an otherwise well-supported claim.
  const confidence = clamp01(support * (1 - contradiction));

  return {
    claimId: claim.id,
    key: claim.key,
    label: claim.label,
    criticality: claim.criticality,
    weight: claim.weight ?? policy.criticalityWeights[claim.criticality],
    confidence,
    support,
    contradiction,
    hasEvidence: assessments.length > 0,
    evidence: assessments,
  };
}
