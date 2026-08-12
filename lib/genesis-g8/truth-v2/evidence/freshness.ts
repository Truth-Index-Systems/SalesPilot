import type { MrTi2FreshnessBasis } from "./types";

const MS_PER_DAY=86_400_000;

function parseDate(value:Date|string,label:string):Date {
  const parsed=value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if(Number.isNaN(parsed.getTime())) throw new Error(`MR_TI_2_INVALID_${label.toUpperCase()}:${String(value)}`);
  return parsed;
}

export interface MrTi2FreshnessAgeAssessment {
  ageDays:number;
  basis:MrTi2FreshnessBasis;
  sourcePublicationKnown:boolean;
  referenceTime:string;
}

/**
 * Evidence age is measured against the evaluation reference time, never frozen at ingestion.
 * If publication time is unknown, observedAt is a conservative lower-bound origin so the
 * evidence still decays after it was first seen instead of remaining permanently fresh.
 */
export function assessMrTi2FreshnessAge(
  sourcePublishedAt:Date|string|null,
  observedAt:Date|string,
  referenceTime:Date|string=new Date(),
):MrTi2FreshnessAgeAssessment {
  const observed=parseDate(observedAt,"observed_at");
  const reference=parseDate(referenceTime,"reference_time");
  if(reference.getTime()<observed.getTime()) throw new Error(`MR_TI_2_REFERENCE_BEFORE_OBSERVATION:${reference.toISOString()}:${observed.toISOString()}`);

  let origin=observed;
  let basis:MrTi2FreshnessBasis="OBSERVED_AT_FALLBACK";
  let sourcePublicationKnown=false;
  if(sourcePublishedAt!==null){
    const source=parseDate(sourcePublishedAt,"source_published_at");
    // If an upstream source timestamp is anomalously later than observation, use the
    // earlier observed timestamp rather than allowing the anomaly to make evidence younger.
    origin=source.getTime()<=observed.getTime()?source:observed;
    basis=source.getTime()<=observed.getTime()?"SOURCE_PUBLISHED_AT":"OBSERVED_AT_FALLBACK";
    sourcePublicationKnown=source.getTime()<=observed.getTime();
  }

  return {
    ageDays:Math.max(0,(reference.getTime()-origin.getTime())/MS_PER_DAY),
    basis,
    sourcePublicationKnown,
    referenceTime:reference.toISOString(),
  };
}

export function calculateMrTi2AgeDays(
  sourcePublishedAt:Date|string|null,
  observedAt:Date|string,
  referenceTime:Date|string=new Date(),
):number {
  return assessMrTi2FreshnessAge(sourcePublishedAt,observedAt,referenceTime).ageDays;
}

export function calculateMrTi2FreshnessModifier(ageDays:number,halfLifeDays:number):number {
  if(!Number.isFinite(ageDays) || ageDays < 0) throw new Error(`MR_TI_2_INVALID_AGE_DAYS:${ageDays}`);
  if(!Number.isFinite(halfLifeDays) || halfLifeDays <= 0) throw new Error(`MR_TI_2_INVALID_HALF_LIFE_DAYS:${halfLifeDays}`);
  const modifier=2**(-ageDays/halfLifeDays);
  return Math.min(1,Math.max(0,modifier));
}
