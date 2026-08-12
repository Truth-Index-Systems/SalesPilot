export interface MrTi2IntrinsicEvidenceDimensions {
  authority: number;
  directness: number;
  traceability: number;
}

export type MrTi2FreshnessBasis = "SOURCE_PUBLISHED_AT" | "OBSERVED_AT_FALLBACK";

export interface MrTi2EvidencePrimitiveInput extends MrTi2IntrinsicEvidenceDimensions {
  observedAt: Date | string;
  sourcePublishedAt: Date | string | null;
  /** Reference time for temporal decay. Defaults to evaluation time when omitted. */
  referenceTime?: Date | string;
  freshnessHalfLifeDays: number;
  derivativeDepth: number;
}

export interface MrTi2EvidenceMathResult {
  weightedMean: number;
  weightedStandardDeviation: number;
  intrinsicQuality: number;
  ageDays: number;
  freshnessModifier: number;
  freshnessBasis: MrTi2FreshnessBasis;
  sourcePublicationKnown: boolean;
  referenceTime: string;
  independenceModifier: number;
  effectiveStrength: number;
}
