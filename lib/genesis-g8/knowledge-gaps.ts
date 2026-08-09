import type { GenesisG8HydratedKnowledge, GenesisG8IntelligenceGap } from "./hydration";

export interface GenesisG8GapSummary {
  total: number;
  critical: number;
  required: number;
  topPriority: GenesisG8IntelligenceGap | null;
  byReason: Record<string, number>;
}

export function summariseGenesisG8Gaps(hydrated: GenesisG8HydratedKnowledge): GenesisG8GapSummary {
  const byReason: Record<string, number> = {};
  for (const gap of hydrated.gaps) byReason[gap.reason] = (byReason[gap.reason] ?? 0) + 1;
  return {
    total: hydrated.gaps.length,
    critical: hydrated.gaps.filter((gap) => gap.criticality === "CRITICAL").length,
    required: hydrated.gaps.filter((gap) => gap.criticality === "REQUIRED").length,
    topPriority: hydrated.gaps[0] ?? null,
    byReason,
  };
}
