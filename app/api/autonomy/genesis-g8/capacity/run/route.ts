import { NextRequest, NextResponse } from "next/server";
import { databaseRequest } from "@/lib/database/postgrest";
import { GENESIS_G8_CAPACITY_BUDGET_VERSION, runGenesisG8CapacityBudgetCycle } from "@/lib/genesis-g8/capacity-budget";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorised(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret) && request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  if (!authorised(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const result = await runGenesisG8CapacityBudgetCycle();
    await databaseRequest("rpc/record_genesis_g8_capacity_budget_event", {
      method: "POST",
      body: JSON.stringify({
        p_budget_version: GENESIS_G8_CAPACITY_BUDGET_VERSION,
        p_mode: result.mode,
        p_capacity_used_ratio: result.capacityUsedRatio,
        p_background_budget_usd: result.backgroundBudgetUsd,
        p_background_spent_usd: result.backgroundSpentUsd,
        p_maximum_background_repairs: result.maximumBackgroundRepairs,
        p_truth_gain_today: result.snapshot.truthGainToday,
        p_truth_gain_per_repair_call: result.snapshot.truthGainPerRepairCall,
        p_detail: { allocation: result.allocation, reasons: result.reasons, refreshQueued: result.refresh?.queued ?? 0 },
      }),
    }).catch(() => undefined);
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: "GENESIS_G8_CAPACITY_BUDGET_FAILED", detail: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
