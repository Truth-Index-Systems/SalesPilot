import { MR_TI_2_PROBABILITY_CAP } from "../evidence/constants";
import { assertUnitInterval } from "../evidence/numeric";
import type { MrTi2RawClaimProbabilityInput } from "./types";

const MR_TI_2_PROBABILITY_FLOOR = 0.001;

export function calculateMrTi2RawClaimProbability(input:MrTi2RawClaimProbabilityInput):number|null {
  const support=assertUnitInterval(input.supportStrength,"support_strength");
  const contradiction=assertUnitInterval(input.contradictionStrength,"contradiction_strength");
  if(support===0 && contradiction===0) return null;

  let probability:number;
  if(contradiction===0) probability=support;
  else if(support===0) probability=1-contradiction;
  else {
    const numerator=support*(1-contradiction);
    const denominator=numerator+(contradiction*(1-support));
    probability=denominator===0?0.5:numerator/denominator;
  }

  return Math.min(MR_TI_2_PROBABILITY_CAP,Math.max(MR_TI_2_PROBABILITY_FLOOR,probability));
}
