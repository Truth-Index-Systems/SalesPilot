import { MR_TI_2_LINEAGE_DECAY_BASE } from "./constants";

export function calculateMrTi2IndependenceModifier(derivativeDepth:number):number {
  if(!Number.isInteger(derivativeDepth) || derivativeDepth < 0) throw new Error(`MR_TI_2_INVALID_DERIVATIVE_DEPTH:${derivativeDepth}`);
  const modifier=MR_TI_2_LINEAGE_DECAY_BASE**(-derivativeDepth);
  return Math.min(1,Math.max(0,modifier));
}
