/**
 * MarketRoute / Genesis shared epistemic primitives.
 *
 * Constitutional rule: evidence strength is not truth probability.
 * - evidenceBalance describes the direction of the currently represented evidence.
 * - evidenceSufficiency describes how much effective evidence exists, independent of direction.
 * - truthProbability is only legal after an empirical monotonic calibration profile is supplied.
 */

export const TRUTH_FOUNDATION_VERSION = "TFR-1.0" as const;
export const TRUTH_FOUNDATION_PROBABILITY_CAP = 0.999 as const;

export interface TruthCalibrationObservation {
  rawEvidenceBalance: number;
  outcome: 0 | 1;
  weight?: number;
}

export interface TruthCalibrationPoint {
  maxRawEvidenceBalance: number;
  calibratedProbability: number;
  observationWeight: number;
}

export interface TruthCalibrationProfile {
  method: "PAV_ISOTONIC";
  points: readonly TruthCalibrationPoint[];
  observationWeight: number;
}

export type TruthProbabilityState = "UNCALIBRATED" | "EMPIRICALLY_CALIBRATED";

export function assertTruthUnit(value:number,label:string):number {
  if(!Number.isFinite(value) || value < 0 || value > 1) throw new Error(`TRUTH_FOUNDATION_INVALID_UNIT:${label}:${value}`);
  return value;
}

/** Independent evidence families compound. Dependent observations must be collapsed before this function is called. */
export function compoundIndependentEvidenceStrengths(strengths:readonly number[]):number {
  if(strengths.length===0) return 0;
  const residual=strengths.reduce((product,strength)=>product*(1-assertTruthUnit(strength,"family_strength")),1);
  return Math.min(TRUTH_FOUNDATION_PROBABILITY_CAP,Math.max(0,1-residual));
}

/**
 * Direction of the represented evidence. This is deliberately NOT a probability.
 * 0.5 means balanced opposing evidence, not "50% likely true".
 */
export function calculateEvidenceBalance(supportStrength:number,contradictionStrength:number):number|null {
  const support=assertTruthUnit(supportStrength,"support_strength");
  const contradiction=assertTruthUnit(contradictionStrength,"contradiction_strength");
  if(support===0 && contradiction===0) return null;
  if(contradiction===0) return support;
  if(support===0) return 1-contradiction;
  const numerator=support*(1-contradiction);
  const denominator=numerator+(contradiction*(1-support));
  return denominator===0?0.5:assertTruthUnit(numerator/denominator,"evidence_balance");
}

/**
 * Quantity of effective evidence represented on either side of the claim.
 * This is independent of whether that evidence supports or contradicts the proposition.
 */
export function calculateEvidenceSufficiency(supportStrength:number,contradictionStrength:number):number {
  const support=assertTruthUnit(supportStrength,"support_strength");
  const contradiction=assertTruthUnit(contradictionStrength,"contradiction_strength");
  return assertTruthUnit(1-((1-support)*(1-contradiction)),"evidence_sufficiency");
}

/** Pool-adjacent-violators isotonic calibration fitted only from labelled truth outcomes. */
export function fitTruthCalibrationProfile(observations:readonly TruthCalibrationObservation[]):TruthCalibrationProfile {
  if(observations.length===0) throw new Error("TRUTH_FOUNDATION_CALIBRATION_REQUIRES_OBSERVATIONS");
  const sorted=observations.map((observation,index)=>({
    x:assertTruthUnit(observation.rawEvidenceBalance,`calibration.raw.${index}`),
    y:observation.outcome,
    w:observation.weight??1,
  })).map((row,index)=>{
    if(!Number.isFinite(row.w)||row.w<=0) throw new Error(`TRUTH_FOUNDATION_INVALID_WEIGHT:${index}:${row.w}`);
    return row;
  }).sort((a,b)=>a.x-b.x||a.y-b.y);

  type Block={maxX:number;sumY:number;sumW:number};
  const blocks:Block[]=[];
  for(const row of sorted){
    blocks.push({maxX:row.x,sumY:row.y*row.w,sumW:row.w});
    while(blocks.length>=2){
      const right=blocks[blocks.length-1];
      const left=blocks[blocks.length-2];
      if(left.sumY/left.sumW<=right.sumY/right.sumW) break;
      blocks.splice(blocks.length-2,2,{maxX:right.maxX,sumY:left.sumY+right.sumY,sumW:left.sumW+right.sumW});
    }
  }
  const points=blocks.map((block)=>({
    maxRawEvidenceBalance:block.maxX,
    calibratedProbability:block.sumY/block.sumW,
    observationWeight:block.sumW,
  }));
  return Object.freeze({
    method:"PAV_ISOTONIC",
    points:Object.freeze(points),
    observationWeight:points.reduce((sum,point)=>sum+point.observationWeight,0),
  });
}

export function calibrateEvidenceBalance(rawEvidenceBalance:number,profile:TruthCalibrationProfile):number {
  const raw=assertTruthUnit(rawEvidenceBalance,"raw_evidence_balance");
  if(profile.method!=="PAV_ISOTONIC"||profile.points.length===0) throw new Error("TRUTH_FOUNDATION_INVALID_CALIBRATION_PROFILE");
  let previousX=-Infinity;
  let previousProbability=0;
  for(const point of profile.points){
    const x=assertTruthUnit(point.maxRawEvidenceBalance,"profile.max_raw_evidence_balance");
    const probability=assertTruthUnit(point.calibratedProbability,"profile.calibrated_probability");
    if(!Number.isFinite(point.observationWeight)||point.observationWeight<=0) throw new Error("TRUTH_FOUNDATION_INVALID_CALIBRATION_WEIGHT");
    if(x<previousX||probability<previousProbability) throw new Error("TRUTH_FOUNDATION_NON_MONOTONIC_CALIBRATION_PROFILE");
    previousX=x;
    previousProbability=probability;
    if(raw<=x) return probability;
  }
  return profile.points[profile.points.length-1].calibratedProbability;
}
