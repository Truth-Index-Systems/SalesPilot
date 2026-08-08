export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export function roundPercent(value01: number): number {
  return Math.round(clamp01(value01) * 1000) / 10;
}

/**
 * Exponential half-life decay. A fact at one half-life retains 50% of its
 * evidential force; at two half-lives it retains 25%.
 */
export function halfLifeFreshness(ageDays: number, halfLifeDays: number): number {
  if (!Number.isFinite(ageDays) || ageDays <= 0) return 1;
  if (!Number.isFinite(halfLifeDays) || halfLifeDays <= 0) return 0;
  return clamp01(Math.pow(0.5, ageDays / halfLifeDays));
}

/** Independent supporting observations accumulate without ever exceeding 1. */
export function noisyOr(values: number[]): number {
  if (values.length === 0) return 0;
  return clamp01(1 - values.reduce((remaining, value) => remaining * (1 - clamp01(value)), 1));
}

export function weightedMean(items: Array<{ value: number; weight: number }>): number {
  const usable = items.filter((item) => Number.isFinite(item.weight) && item.weight > 0);
  const totalWeight = usable.reduce((sum, item) => sum + item.weight, 0);
  if (totalWeight <= 0) return 0;
  return clamp01(usable.reduce((sum, item) => sum + clamp01(item.value) * item.weight, 0) / totalWeight);
}
