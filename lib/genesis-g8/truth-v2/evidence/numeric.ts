import { MR_TI_2_PROBABILITY_CAP } from "./constants";

export function assertUnitInterval(value:number,label:string):number {
  if(!Number.isFinite(value) || value < 0 || value > 1) throw new Error(`MR_TI_2_INVALID_${label.toUpperCase()}:${value}`);
  return value;
}

export function clampProbability(value:number):number {
  if(!Number.isFinite(value)) throw new Error(`MR_TI_2_NON_FINITE_PROBABILITY:${value}`);
  return Math.min(MR_TI_2_PROBABILITY_CAP,Math.max(0,value));
}

export function roundMrTi2(value:number,places=12):number {
  if(!Number.isFinite(value)) throw new Error(`MR_TI_2_NON_FINITE_NUMBER:${value}`);
  const factor=10**places;
  return Math.round(value*factor)/factor;
}
