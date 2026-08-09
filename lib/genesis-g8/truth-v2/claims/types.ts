export type MrTi2ClaimReviewState = "AUTO" | "VERIFY" | "HUMAN_REVIEW_REQUIRED";

export interface MrTi2RawClaimProbabilityInput {
  supportStrength: number;
  contradictionStrength: number;
}

export interface MrTi2ContradictionAssessment {
  severity: number;
  bilateralStrength: number;
  reviewState: MrTi2ClaimReviewState;
}

export interface MrTi2RawClaimState extends MrTi2RawClaimProbabilityInput, MrTi2ContradictionAssessment {
  probability: number | null;
  represented: boolean;
}
