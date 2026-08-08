import { NextRequest, NextResponse } from "next/server";
import { runGenesisG8CapacityBudgetCycle } from "@/lib/genesis-g8/capacity-budget";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorised(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  if (!authorised(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const result = await runGenesisG8CapacityBudgetCycle();
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: "GENESIS_G8_BACKGROUND_REFRESH_FAILED", detail: message }, { status: 500 });
  }
}
