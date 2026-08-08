export type TruthEntityType =
  | "industry"
  | "sector"
  | "company"
  | "contact"
  | "route"
  | "opportunity";

export type ClaimCriticality = "CRITICAL" | "REQUIRED" | "SUPPORTING" | "OPTIONAL";

export type EvidenceDirection = "SUPPORTS" | "CONTRADICTS";

export type EvidenceSourceClass =
  | "REGULATORY_OR_GOVERNMENT"
  | "OFFICIAL_PRIMARY"
  | "OFFICIAL_PROFILE"
  | "MAJOR_REPUTABLE_MEDIA"
  | "INDUSTRY_PUBLICATION"
  | "COMMERCIAL_DATABASE"
  | "BUSINESS_DIRECTORY"
  | "SOCIAL_OR_COMMUNITY"
  | "SEARCH_SNIPPET"
  | "UNKNOWN";

export interface TruthEvidence {
  id: string;
  claimId: string;
  direction: EvidenceDirection;
  sourceClass: EvidenceSourceClass;
  /** How directly the stored evidence supports the proposition, 0..1. */
  strength: number;
  /** Whether the cited excerpt / value can be traced to the source, 0..1. */
  traceability: number;
  /** Independence from other evidence already attached to the claim, 0..1. */
  independence: number;
  observedAt: string | Date;
  /** Domain policy supplied by the caller; short-lived facts use shorter half-lives. */
  freshnessHalfLifeDays: number;
}

export interface TruthClaim {
  id: string;
  key: string;
  label: string;
  criticality: ClaimCriticality;
  /** Relative importance inside the entity contract. Defaults from criticality policy. */
  weight?: number;
  evidence: TruthEvidence[];
}

export interface TruthEvaluable {
  id: string;
  entityType: TruthEntityType;
  claims: TruthClaim[];
}

export interface EvidenceAssessment {
  evidenceId: string;
  direction: EvidenceDirection;
  authority: number;
  freshness: number;
  effectiveStrength: number;
}

export interface ClaimTruthResult {
  claimId: string;
  key: string;
  label: string;
  criticality: ClaimCriticality;
  weight: number;
  confidence: number;
  support: number;
  contradiction: number;
  hasEvidence: boolean;
  evidence: EvidenceAssessment[];
}

export type TruthReviewReason =
  | "LOW_TRUTH_INDEX"
  | "LOW_CONFIDENCE"
  | "LOW_COVERAGE"
  | "CRITICAL_CLAIM_WEAK"
  | "MATERIAL_CONTRADICTION";

export interface TruthReviewFlag {
  required: boolean;
  reasons: TruthReviewReason[];
  priorityScore: number;
  weakestClaimIds: string[];
}

export interface TruthIndexResult {
  entityId: string;
  entityType: TruthEntityType;
  equationVersion: string;
  calculatedAt: string;
  /** Reliability of claims currently represented by evidence, 0..100. */
  confidence: number;
  /** Completeness of the intelligence contract represented by evidence, 0..100. */
  coverage: number;
  /** Confidence constrained by coverage and critical-claim reliability, 0..100. */
  truthIndex: number;
  criticalClaimCeiling: number;
  claims: ClaimTruthResult[];
  review: TruthReviewFlag;
}
