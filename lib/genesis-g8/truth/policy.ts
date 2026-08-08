import type { ClaimCriticality, EvidenceSourceClass } from "./types";

export const GENESIS_G8_TRUTH_EQUATION_VERSION = "MR-TI-1.0" as const;

export interface TruthKernelPolicy {
  equationVersion: string;
  sourceAuthority: Record<EvidenceSourceClass, number>;
  criticalityWeights: Record<ClaimCriticality, number>;
  reviewThresholds: {
    truthIndex: number;
    confidence: number;
    coverage: number;
    criticalClaim: number;
    materialContradiction: number;
  };
}

export const DEFAULT_TRUTH_KERNEL_POLICY: TruthKernelPolicy = {
  equationVersion: GENESIS_G8_TRUTH_EQUATION_VERSION,
  sourceAuthority: {
    REGULATORY_OR_GOVERNMENT: 1,
    OFFICIAL_PRIMARY: 0.98,
    OFFICIAL_PROFILE: 0.94,
    MAJOR_REPUTABLE_MEDIA: 0.9,
    INDUSTRY_PUBLICATION: 0.84,
    COMMERCIAL_DATABASE: 0.76,
    BUSINESS_DIRECTORY: 0.62,
    SOCIAL_OR_COMMUNITY: 0.52,
    SEARCH_SNIPPET: 0.4,
    UNKNOWN: 0.3,
  },
  criticalityWeights: {
    CRITICAL: 4,
    REQUIRED: 2,
    SUPPORTING: 1,
    OPTIONAL: 0.5,
  },
  reviewThresholds: {
    truthIndex: 0.72,
    confidence: 0.72,
    coverage: 0.68,
    criticalClaim: 0.72,
    materialContradiction: 0.35,
  },
};
