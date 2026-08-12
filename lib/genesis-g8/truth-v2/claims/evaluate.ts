import type { MrTi2MatrixOneClaimAggregate } from "../matrix-one";
import { assessMrTi2Contradiction } from "./contradiction";
import { calibrateMrTi2EvidenceBalance, calculateMrTi2RawEvidenceBalance, type MrTi2CalibrationProfile } from "./probability";
import type { MrTi2RawClaimState } from "./types";

export function evaluateMrTi2RawClaim(aggregate:MrTi2MatrixOneClaimAggregate,calibrationProfile?:MrTi2CalibrationProfile|null):MrTi2RawClaimState {
  const supportStrength=aggregate.supportStrength;
  const contradictionStrength=aggregate.contradictionStrength;
  const evidenceBalance=calculateMrTi2RawEvidenceBalance({supportStrength,contradictionStrength});
  const truthProbability=evidenceBalance===null||!calibrationProfile?null:calibrateMrTi2EvidenceBalance(evidenceBalance,calibrationProfile);
  const contradiction=assessMrTi2Contradiction(supportStrength,contradictionStrength);
  return {
    supportStrength,
    contradictionStrength,
    evidenceBalance,
    evidenceSufficiency:aggregate.evidenceSufficiency,
    truthProbability,
    probabilityState:truthProbability===null?"UNCALIBRATED":"EMPIRICALLY_CALIBRATED",
    represented:evidenceBalance!==null,
    evidenceCount:aggregate.cells.length,
    dependenceFamilyCount:aggregate.families.length,
    undatedEvidenceCount:aggregate.undatedEvidenceCount,
    minimumFreshnessModifier:aggregate.minimumFreshnessModifier,
    ...contradiction,
  };
}
