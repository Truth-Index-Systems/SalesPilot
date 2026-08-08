import { halfLifeFreshness, clamp01 } from "./math";
import type { EvidenceAssessment, TruthEvidence } from "./types";
import type { TruthKernelPolicy } from "./policy";

const DAY_MS = 86_400_000;

function ageInDays(observedAt: string | Date, now: Date): number {
  const observed = observedAt instanceof Date ? observedAt : new Date(observedAt);
  const observedMs = observed.getTime();
  if (!Number.isFinite(observedMs)) return Number.POSITIVE_INFINITY;
  return Math.max(0, (now.getTime() - observedMs) / DAY_MS);
}

export function assessEvidence(
  evidence: TruthEvidence,
  policy: TruthKernelPolicy,
  now: Date,
): EvidenceAssessment {
  const authority = clamp01(policy.sourceAuthority[evidence.sourceClass] ?? 0);
  const freshness = halfLifeFreshness(ageInDays(evidence.observedAt, now), evidence.freshnessHalfLifeDays);
  const effectiveStrength = clamp01(
    clamp01(evidence.strength)
      * authority
      * clamp01(evidence.traceability)
      * clamp01(evidence.independence)
      * freshness,
  );

  return {
    evidenceId: evidence.id,
    direction: evidence.direction,
    authority,
    freshness,
    effectiveStrength,
  };
}
