/**
 * CIE Truth adapter over the shared MarketRoute Truth Foundation.
 *
 * Forensic Build 1 removes the previous duplicate shadow calculus: production MR-TI
 * and CIE now share the same evidence-balance and empirical-calibration primitives.
 * CIE remains a composition consumer; it does not invent a second definition of truth.
 */
import {
  TRUTH_FOUNDATION_PROBABILITY_CAP,
  calculateEvidenceBalance,
  calibrateEvidenceBalance,
  compoundIndependentEvidenceStrengths,
  fitTruthCalibrationProfile,
  type TruthCalibrationObservation,
  type TruthCalibrationPoint,
  type TruthCalibrationProfile,
} from "../../truth-foundation/epistemic";

export const CIE_TRUTH_NEXT_VERSION = "0.2.0-shared-truth-foundation" as const;
export const CIE_TRUTH_NEXT_AUTHORITY_MODE = "SHARED_FOUNDATION" as const;
export const CIE_TRUTH_NEXT_PROBABILITY_CAP = TRUTH_FOUNDATION_PROBABILITY_CAP;

export type CieTruthDirection = "SUPPORT" | "CONTRADICT";

export type CieTruthNextEvidence = Readonly<{
  evidenceKey: string;
  direction: CieTruthDirection;
  /** Upstream effective evidence strength; this is evidence support, not probability. */
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

export type CieTruthCalibrationObservation=TruthCalibrationObservation;
export type CieTruthCalibrationPoint=TruthCalibrationPoint;
export type CieTruthCalibrationProfile=TruthCalibrationProfile;

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
  strengths.forEach((strength)=>unit(strength,"family_strength"));
  return compoundIndependentEvidenceStrengths(strengths);
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
  return [...groups.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([compound,value])=>({
    dependenceFamilyKey:compound.slice(compound.indexOf(":")+1),
    direction:value.direction,
    memberEvidenceKeys:Object.freeze([...value.members].sort()),
    representativeStrength:value.strength,
  }));
}

/** Balance of opposing evidence channels. Explicitly NOT a probability. */
export function calculateRawEvidenceBalance(supportStrength:number,contradictionStrength:number):number|null {
  return calculateEvidenceBalance(unit(supportStrength,"supportStrength"),unit(contradictionStrength,"contradictionStrength"));
}

export function fitCieTruthCalibrationProfile(observations:readonly CieTruthCalibrationObservation[]):CieTruthCalibrationProfile {
  try{return fitTruthCalibrationProfile(observations);}
  catch(error){
    const message=error instanceof Error?error.message:String(error);
    if(message.includes("CALIBRATION_REQUIRES_OBSERVATIONS")) throw new Error("CIE_R2_CALIBRATION_REQUIRES_OBSERVATIONS");
    throw error;
  }
}

export function calibrateRawEvidenceBalance(raw:number,profile:CieTruthCalibrationProfile):number {
  return calibrateEvidenceBalance(unit(raw,"rawEvidenceBalance"),profile);
}

export function evaluateCieTruthNext(evidence:readonly CieTruthNextEvidence[],profile?:CieTruthCalibrationProfile|null):CieTruthEvidenceAggregate {
  const families=aggregateDependenceFamilies(evidence);
  const supportStrength=compoundIndependentFamilyStrengths(families.filter((family)=>family.direction==="SUPPORT").map((family)=>family.representativeStrength));
  const contradictionStrength=compoundIndependentFamilyStrengths(families.filter((family)=>family.direction==="CONTRADICT").map((family)=>family.representativeStrength));
  const rawEvidenceBalance=calculateRawEvidenceBalance(supportStrength,contradictionStrength);
  const truthProbability=rawEvidenceBalance===null||!profile?null:calibrateRawEvidenceBalance(rawEvidenceBalance,profile);
  return Object.freeze({families,supportStrength,contradictionStrength,rawEvidenceBalance,truthProbability,probabilityState:truthProbability===null?"UNCALIBRATED":"EMPIRICALLY_CALIBRATED"});
}
