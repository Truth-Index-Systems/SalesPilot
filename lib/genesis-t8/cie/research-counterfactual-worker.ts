import "server-only";
import { databaseRequest } from "@/lib/database/postgrest";
import { buildCieR7ResearchLoop, type CieR7RepairCandidate } from "./research-counterfactual-loop";
import type { GenesisT8MultidimensionalStability } from "../ce2-evolution/multidimensional-stability";

export type CieR7ApplySummary = Readonly<{ realities: number; directives: number; blockingDirectives: number; staleRetired: number }>;

type Row = Readonly<{
  opportunity_id: string;
  reality_id: string;
  repair_id: string;
  claim_id: string;
  claim_key: string;
  objective: string;
  repair_mode: CieR7RepairCandidate["repairMode"];
  blocking_mode: CieR7RepairCandidate["blockingMode"];
  stability_json: GenesisT8MultidimensionalStability;
  r4_input_fingerprint: string;
}>;

export async function runCieR7ResearchCounterfactualLoop(schedulerRunId: string): Promise<CieR7ApplySummary> {
  const rows = await databaseRequest<Row[]>("rpc/get_cie_r7_research_context", { method: "POST", body: JSON.stringify({ p_scheduler_run_id: schedulerRunId, p_limit: 100 }) });
  const groups = new Map<string, Row[]>();
  for (const row of rows) {
    const key = `${row.opportunity_id}:${row.reality_id}`;
    const current = groups.get(key) ?? [];
    current.push(row); groups.set(key, current);
  }
  let directives = 0; let blockingDirectives = 0;
  for (const group of groups.values()) {
    const first = group[0];
    const loop = buildCieR7ResearchLoop({
      realityId: first.reality_id,
      stability: first.stability_json,
      repairs: group.map((row) => ({
        repairId: row.repair_id,
        claimId: row.claim_id,
        claimKey: row.claim_key,
        semanticQuestionKey: row.objective,
        repairMode: row.repair_mode,
        blockingMode: row.blocking_mode,
        knownMonetaryCostUsd: null,
        knownDurationMs: null,
      })),
    });
    await databaseRequest("rpc/replace_cie_r7_research_directives", {
      method: "POST",
      body: JSON.stringify({ p_opportunity_id: first.opportunity_id, p_reality_id: first.reality_id, p_r4_input_fingerprint: first.r4_input_fingerprint, p_directives_json: loop.directives }),
    });
    directives += loop.directives.length;
    blockingDirectives += loop.directives.filter((x) => x.impactClass === "DECISION_BLOCKING").length;
  }
  const retired = await databaseRequest<Array<{ retired: number }>>("rpc/retire_stale_cie_r7_research_directives", { method: "POST", body: "{}" });
  return Object.freeze({ realities: groups.size, directives, blockingDirectives, staleRetired: Number(retired[0]?.retired ?? 0) || 0 });
}
