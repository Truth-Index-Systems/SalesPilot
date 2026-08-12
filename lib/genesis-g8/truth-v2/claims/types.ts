import type { TruthProbabilityState } from "../../../truth-foundation/epistemic";

export type MrTi2ClaimReviewState = "AUTO" | "VERIFY" | "HUMAN_REVIEW_REQUIRED";
export type MrTi2ProbabilityState = TruthProbabilityState;

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
  /** Direction of evidence. Not a truth probability. */
  evidenceBalance: number | null;
  /** Quantity of effective evidence represented on either side. */
  evidenceSufficiency:number;
  /** Only populated when an empirical calibration profile is supplied. */
  truthProbability:number|null;
  probabilityState:MrTi2ProbabilityState;
  represented: boolean;
  evidenceCount:number;
  dependenceFamilyCount:number;
  undatedEvidenceCount:number;
  minimumFreshnessModifier:number;
}
