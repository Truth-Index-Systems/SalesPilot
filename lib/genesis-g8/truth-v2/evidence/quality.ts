import { MR_TI_2_EVIDENCE_SD_PENALTY, MR_TI_2_INTRINSIC_QUALITY_WEIGHTS, MR_TI_2_PROBABILITY_CAP } from "./constants";
import { assertUnitInterval } from "./numeric";
import type { MrTi2IntrinsicEvidenceDimensions } from "./types";

export interface MrTi2EvidenceQualityResult {
  weightedMean:number;
  weightedStandardDeviation:number;
  intrinsicQuality:number;
}

export function calculateMrTi2EvidenceQuality(input:MrTi2IntrinsicEvidenceDimensions):MrTi2EvidenceQualityResult {
  const values=[
    [assertUnitInterval(input.authority,"authority"),MR_TI_2_INTRINSIC_QUALITY_WEIGHTS.authority],
    [assertUnitInterval(input.directness,"directness"),MR_TI_2_INTRINSIC_QUALITY_WEIGHTS.directness],
    [assertUnitInterval(input.traceability,"traceability"),MR_TI_2_INTRINSIC_QUALITY_WEIGHTS.traceability],
  ] as const;
  const weightTotal=values.reduce((sum,[,weight])=>sum+weight,0);
  const weightedMean=values.reduce((sum,[value,weight])=>sum+(value*weight),0)/weightTotal;
  const variance=values.reduce((sum,[value,weight])=>sum+(weight*((value-weightedMean)**2)),0)/weightTotal;
  const weightedStandardDeviation=Math.sqrt(variance);
  const intrinsicQuality=Math.min(MR_TI_2_PROBABILITY_CAP,Math.max(0,weightedMean-(MR_TI_2_EVIDENCE_SD_PENALTY*weightedStandardDeviation)));
  return {weightedMean,weightedStandardDeviation,intrinsicQuality};
}
