const MS_PER_DAY=86_400_000;

function parseDate(value:Date|string,label:string):Date {
  const parsed=value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if(Number.isNaN(parsed.getTime())) throw new Error(`MR_TI_2_INVALID_${label.toUpperCase()}:${String(value)}`);
  return parsed;
}

export function calculateMrTi2AgeDays(sourcePublishedAt:Date|string|null,observedAt:Date|string):number {
  if(sourcePublishedAt===null) return 0;
  const source=parseDate(sourcePublishedAt,"source_published_at");
  const observed=parseDate(observedAt,"observed_at");
  return Math.max(0,(observed.getTime()-source.getTime())/MS_PER_DAY);
}

export function calculateMrTi2FreshnessModifier(ageDays:number,halfLifeDays:number):number {
  if(!Number.isFinite(ageDays) || ageDays < 0) throw new Error(`MR_TI_2_INVALID_AGE_DAYS:${ageDays}`);
  if(!Number.isFinite(halfLifeDays) || halfLifeDays <= 0) throw new Error(`MR_TI_2_INVALID_HALF_LIFE_DAYS:${halfLifeDays}`);
  const modifier=2**(-ageDays/halfLifeDays);
  return Math.min(1,Math.max(0,modifier));
}
