import {
  calculateEvidenceBalance,
  calculateEvidenceSufficiency,
  calibrateEvidenceBalance,
  fitTruthCalibrationProfile,
  type TruthCalibrationObservation,
  type TruthCalibrationProfile,
} from "../../../truth-foundation/epistemic";
import type { MrTi2RawClaimProbabilityInput } from "./types";

export type MrTi2CalibrationObservation=TruthCalibrationObservation;
export type MrTi2CalibrationProfile=TruthCalibrationProfile;

/** Evidence direction only. This value MUST NOT be consumed as a probability. */
export function calculateMrTi2RawEvidenceBalance(input:MrTi2RawClaimProbabilityInput):number|null {
  return calculateEvidenceBalance(input.supportStrength,input.contradictionStrength);
}

/** Independent evidence quantity, irrespective of whether it supports or contradicts the proposition. */
export function calculateMrTi2EvidenceSufficiency(input:MrTi2RawClaimProbabilityInput):number {
  return calculateEvidenceSufficiency(input.supportStrength,input.contradictionStrength);
}

export function fitMrTi2CalibrationProfile(observations:readonly MrTi2CalibrationObservation[]):MrTi2CalibrationProfile {
  return fitTruthCalibrationProfile(observations);
}

export function calibrateMrTi2EvidenceBalance(rawEvidenceBalance:number,profile:MrTi2CalibrationProfile):number {
  return calibrateEvidenceBalance(rawEvidenceBalance,profile);
}
