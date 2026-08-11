/**
 * CIE-R2 Truth Mathematics Evolution (TI-next shadow calculus).
 *
 * Constitutional rules:
 * - Frozen TI-2.1.8 is not modified.
 * - Correlated/derived observations do not freely compound.
 * - Evidence support is not itself a truth probability.
 * - A truth probability is emitted only through an explicit empirical monotonic
 *   calibration profile fitted from labelled outcomes.
 */

export const CIE_TRUTH_NEXT_VERSION = "0.1.0-shadow" as const;
export const CIE_TRUTH_NEXT_AUTHORITY_MODE = "SHADOW" as const;
export const CIE_TRUTH_NEXT_PROBABILITY_CAP = 0.999 as const;

export type CieTruthDirection = "SUPPORT" | "CONTRADICT";

export type CieTruthNextEvidence = Readonly<{
  evidenceKey: string;
  direction: CieTruthDirection;
  /** Upstream TI evidence strength; this is evidence support, not probability. */
  effectiveStrength: number;
  /** Common-origin/copy/syndication family. Equal keys are dependent evidence. */
  dependenceFamilyKey: string;
}>;

export type CieTruthFamilyAggregate = Readonly<{
  dependenceFamilyKey: string;
  direction: CieTruthDirection;
  memberEvidenceKeys: readonly string[];
  representativeStrength: number;
}>;

export type CieTruthEvidenceAggregate = Readonly<{
  families: readonly CieTruthFamilyAggregate[];
  supportStrength: number;
  contradictionStrength: number;
  rawEvidenceBalance: number | null;
  truthProbability: number | null;
  probabilityState: "UNCALIBRATED" | "EMPIRICALLY_CALIBRATED";
}>;

export type CieTruthCalibrationObservation = Readonly<{
  rawEvidenceBalance: number;
  outcome: 0 | 1;
  weight?: number;
}>;

export type CieTruthCalibrationPoint = Readonly<{
  maxRawEvidenceBalance: number;
  calibratedProbability: number;
  observationWeight: number;
}>;

export type CieTruthCalibrationProfile = Readonly<{
  method: "PAV_ISOTONIC";
  points: readonly CieTruthCalibrationPoint[];
  observationWeight: number;
}>;

function unit(value:number,label:string):number {
  if(!Number.isFinite(value)||value<0||value>1) throw new Error(`CIE_R2_INVALID_UNIT:${label}:${value}`);
  return value;
}
function key(value:string,label:string):string {
  const out=value.trim();
  if(!out) throw new Error(`CIE_R2_INVALID_KEY:${label}`);
  return out;
}

export function compoundIndependentFamilyStrengths(strengths:readonly number[]):number {
  if(strengths.length===0) return 0;
  const residual=strengths.reduce((p,s)=>p*(1-unit(s,"family_strength")),1);
  return Math.min(CIE_TRUTH_NEXT_PROBABILITY_CAP,Math.max(0,1-residual));
}

/** Dependent members collapse conservatively to the strongest member. */
export function aggregateDependenceFamilies(evidence:readonly CieTruthNextEvidence[]):readonly CieTruthFamilyAggregate[] {
  const seenEvidence=new Set<string>();
  const groups=new Map<string,{direction:CieTruthDirection;members:string[];strength:number}>();
  for(const row of evidence){
    const evidenceKey=key(row.evidenceKey,"evidenceKey");
    if(seenEvidence.has(evidenceKey)) throw new Error(`CIE_R2_DUPLICATE_EVIDENCE:${evidenceKey}`);
    seenEvidence.add(evidenceKey);
    const family=key(row.dependenceFamilyKey,"dependenceFamilyKey");
    const strength=unit(row.effectiveStrength,"effectiveStrength");
    const groupingKey=`${row.direction}:${family}`;
    const current=groups.get(groupingKey);
    if(current){current.members.push(evidenceKey);current.strength=Math.max(current.strength,strength);}
    else groups.set(groupingKey,{direction:row.direction,members:[evidenceKey],strength});
  }
  return [...groups.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([compound,v])=>({
    dependenceFamilyKey:compound.slice(compound.indexOf(":")+1),
    direction:v.direction,
    memberEvidenceKeys:Object.freeze([...v.members].sort()),
    representativeStrength:v.strength,
  }));
}

/** Balance of opposing evidence channels. Explicitly NOT a probability. */
export function calculateRawEvidenceBalance(supportStrength:number,contradictionStrength:number):number|null {
  const support=unit(supportStrength,"supportStrength");
  const contradiction=unit(contradictionStrength,"contradictionStrength");
  if(support===0&&contradiction===0) return null;
  if(contradiction===0) return support;
  if(support===0) return 1-contradiction;
  const numerator=support*(1-contradiction);
  const denominator=numerator+(contradiction*(1-support));
  return denominator===0?0.5:unit(numerator/denominator,"rawEvidenceBalance");
}

/**
 * Pool-adjacent-violators isotonic calibration.
 * This is deliberately trained only from observed binary truth outcomes.
 */
export function fitCieTruthCalibrationProfile(observations:readonly CieTruthCalibrationObservation[]):CieTruthCalibrationProfile {
  if(observations.length===0) throw new Error("CIE_R2_CALIBRATION_REQUIRES_OBSERVATIONS");
  const sorted=observations.map((o,i)=>({x:unit(o.rawEvidenceBalance,`calibration.raw.${i}`),y:o.outcome,w:o.weight??1}))
    .map((o,i)=>{if(!Number.isFinite(o.w)||o.w<=0) throw new Error(`CIE_R2_INVALID_WEIGHT:${i}:${o.w}`);return o;})
    .sort((a,b)=>a.x-b.x||a.y-b.y);
  type Block={maxX:number,sumY:number,sumW:number};
  const blocks:Block[]=[];
  for(const o of sorted){
    blocks.push({maxX:o.x,sumY:o.y*o.w,sumW:o.w});
    while(blocks.length>=2){
      const b=blocks[blocks.length-1],a=blocks[blocks.length-2];
      if(a.sumY/a.sumW<=b.sumY/b.sumW) break;
      blocks.splice(blocks.length-2,2,{maxX:b.maxX,sumY:a.sumY+b.sumY,sumW:a.sumW+b.sumW});
    }
  }
  const points=blocks.map(b=>({maxRawEvidenceBalance:b.maxX,calibratedProbability:b.sumY/b.sumW,observationWeight:b.sumW}));
  return Object.freeze({method:"PAV_ISOTONIC",points:Object.freeze(points),observationWeight:points.reduce((s,p)=>s+p.observationWeight,0)});
}

export function calibrateRawEvidenceBalance(raw:number,profile:CieTruthCalibrationProfile):number {
  const x=unit(raw,"rawEvidenceBalance");
  if(profile.method!=="PAV_ISOTONIC"||profile.points.length===0) throw new Error("CIE_R2_INVALID_CALIBRATION_PROFILE");
  let previous=-Infinity;
  let previousP=0;
  for(const p of profile.points){
    unit(p.maxRawEvidenceBalance,"profile.maxRawEvidenceBalance"); unit(p.calibratedProbability,"profile.calibratedProbability");
    if(p.maxRawEvidenceBalance<previous||p.calibratedProbability<previousP) throw new Error("CIE_R2_NON_MONOTONIC_CALIBRATION_PROFILE");
    previous=p.maxRawEvidenceBalance; previousP=p.calibratedProbability;
    if(x<=p.maxRawEvidenceBalance) return p.calibratedProbability;
  }
  return profile.points[profile.points.length-1].calibratedProbability;
}

export function evaluateCieTruthNext(evidence:readonly CieTruthNextEvidence[],profile?:CieTruthCalibrationProfile|null):CieTruthEvidenceAggregate {
  const families=aggregateDependenceFamilies(evidence);
  const supportStrength=compoundIndependentFamilyStrengths(families.filter(f=>f.direction==="SUPPORT").map(f=>f.representativeStrength));
  const contradictionStrength=compoundIndependentFamilyStrengths(families.filter(f=>f.direction==="CONTRADICT").map(f=>f.representativeStrength));
  const rawEvidenceBalance=calculateRawEvidenceBalance(supportStrength,contradictionStrength);
  const truthProbability=rawEvidenceBalance===null||!profile?null:calibrateRawEvidenceBalance(rawEvidenceBalance,profile);
  return Object.freeze({families,supportStrength,contradictionStrength,rawEvidenceBalance,truthProbability,probabilityState:truthProbability===null?"UNCALIBRATED":"EMPIRICALLY_CALIBRATED"});
}
