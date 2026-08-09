import type { MrTi2MatrixOneClaimAggregate } from "../matrix-one";
import { assessMrTi2Contradiction } from "./contradiction";
import { calculateMrTi2RawClaimProbability } from "./probability";
import type { MrTi2RawClaimState } from "./types";

export function evaluateMrTi2RawClaim(aggregate:MrTi2MatrixOneClaimAggregate):MrTi2RawClaimState {
  const supportStrength=aggregate.supportStrength;
  const contradictionStrength=aggregate.contradictionStrength;
  const probability=calculateMrTi2RawClaimProbability({supportStrength,contradictionStrength});
  const contradiction=assessMrTi2Contradiction(supportStrength,contradictionStrength);
  return {
    supportStrength,
    contradictionStrength,
    probability,
    represented:probability!==null,
    ...contradiction,
  };
}
