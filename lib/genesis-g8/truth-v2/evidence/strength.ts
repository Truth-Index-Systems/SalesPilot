import { MR_TI_2_PROBABILITY_CAP } from "./constants";
import { calculateMrTi2AgeDays, calculateMrTi2FreshnessModifier } from "./freshness";
import { calculateMrTi2IndependenceModifier } from "./independence";
import { calculateMrTi2EvidenceQuality } from "./quality";
import type { MrTi2EvidenceMathResult, MrTi2EvidencePrimitiveInput } from "./types";

export function calculateMrTi2EvidenceStrength(input:MrTi2EvidencePrimitiveInput):MrTi2EvidenceMathResult {
  const quality=calculateMrTi2EvidenceQuality(input);
  const ageDays=calculateMrTi2AgeDays(input.sourcePublishedAt,input.observedAt);
  const freshnessModifier=calculateMrTi2FreshnessModifier(ageDays,input.freshnessHalfLifeDays);
  const independenceModifier=calculateMrTi2IndependenceModifier(input.derivativeDepth);
  const effectiveStrength=Math.min(MR_TI_2_PROBABILITY_CAP,Math.max(0,quality.intrinsicQuality*freshnessModifier*independenceModifier));
  return {...quality,ageDays,freshnessModifier,independenceModifier,effectiveStrength};
}
