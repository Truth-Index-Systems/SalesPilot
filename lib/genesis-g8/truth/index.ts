export { calculateTruthIndex } from "./equation";
export { evaluateClaim } from "./claim";
export { assessEvidence } from "./evidence";
export { DEFAULT_TRUTH_KERNEL_POLICY, GENESIS_G8_TRUTH_EQUATION_VERSION } from "./policy";
export type {
  CalculateTruthIndexOptions,
} from "./equation";
export type {
  ClaimCriticality,
  ClaimTruthResult,
  EvidenceAssessment,
  EvidenceDirection,
  EvidenceSourceClass,
  TruthClaim,
  TruthEntityType,
  TruthEvaluable,
  TruthEvidence,
  TruthIndexResult,
  TruthReviewFlag,
  TruthReviewReason,
} from "./types";
export type { TruthKernelPolicy } from "./policy";
