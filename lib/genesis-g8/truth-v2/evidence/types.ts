export interface MrTi2IntrinsicEvidenceDimensions {
  authority: number;
  directness: number;
  traceability: number;
}

export interface MrTi2EvidencePrimitiveInput extends MrTi2IntrinsicEvidenceDimensions {
  observedAt: Date | string;
  sourcePublishedAt: Date | string | null;
  freshnessHalfLifeDays: number;
  derivativeDepth: number;
}

export interface MrTi2EvidenceMathResult {
  weightedMean: number;
  weightedStandardDeviation: number;
  intrinsicQuality: number;
  ageDays: number;
  freshnessModifier: number;
  independenceModifier: number;
  effectiveStrength: number;
}
