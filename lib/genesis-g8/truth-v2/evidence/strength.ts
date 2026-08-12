import { MR_TI_2_EVIDENCE_STRENGTH_CAP } from "./constants";
import { assessMrTi2FreshnessAge, calculateMrTi2FreshnessModifier } from "./freshness";
import { calculateMrTi2IndependenceModifier } from "./independence";
import { calculateMrTi2EvidenceQuality } from "./quality";
import type { MrTi2EvidenceMathResult, MrTi2EvidencePrimitiveInput } from "./types";

export function calculateMrTi2EvidenceStrength(input:MrTi2EvidencePrimitiveInput):MrTi2EvidenceMathResult {
  const quality=calculateMrTi2EvidenceQuality(input);
  const freshness=assessMrTi2FreshnessAge(input.sourcePublishedAt,input.observedAt,input.referenceTime??new Date());
  const freshnessModifier=calculateMrTi2FreshnessModifier(freshness.ageDays,input.freshnessHalfLifeDays);
  const independenceModifier=calculateMrTi2IndependenceModifier(input.derivativeDepth);
  const effectiveStrength=Math.min(MR_TI_2_EVIDENCE_STRENGTH_CAP,Math.max(0,quality.intrinsicQuality*freshnessModifier*independenceModifier));
  return {
    ...quality,
    ageDays:freshness.ageDays,
    freshnessModifier,
    freshnessBasis:freshness.basis,
    sourcePublicationKnown:freshness.sourcePublicationKnown,
    referenceTime:freshness.referenceTime,
    independenceModifier,
    effectiveStrength,
  };
}
