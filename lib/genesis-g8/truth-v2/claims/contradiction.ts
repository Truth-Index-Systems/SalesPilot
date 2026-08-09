import { assertUnitInterval } from "../evidence/numeric";
import type { MrTi2ContradictionAssessment } from "./types";

export const MR_TI_2_VERIFY_SEVERITY_THRESHOLD = 0.36;
export const MR_TI_2_VERIFY_BILATERAL_THRESHOLD = 0.50;
export const MR_TI_2_HUMAN_REVIEW_SEVERITY_THRESHOLD = 0.64;
export const MR_TI_2_HUMAN_REVIEW_BILATERAL_THRESHOLD = 0.70;

export function assessMrTi2Contradiction(supportStrength:number,contradictionStrength:number):MrTi2ContradictionAssessment {
  const support=assertUnitInterval(supportStrength,"support_strength");
  const contradiction=assertUnitInterval(contradictionStrength,"contradiction_strength");
  const severity=support*contradiction;
  const bilateralStrength=Math.min(support,contradiction);

  if(severity>=MR_TI_2_HUMAN_REVIEW_SEVERITY_THRESHOLD && bilateralStrength>=MR_TI_2_HUMAN_REVIEW_BILATERAL_THRESHOLD){
    return {severity,bilateralStrength,reviewState:"HUMAN_REVIEW_REQUIRED"};
  }
  if(severity>=MR_TI_2_VERIFY_SEVERITY_THRESHOLD && bilateralStrength>=MR_TI_2_VERIFY_BILATERAL_THRESHOLD){
    return {severity,bilateralStrength,reviewState:"VERIFY"};
  }
  return {severity,bilateralStrength,reviewState:"AUTO"};
}
