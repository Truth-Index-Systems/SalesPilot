import { NextRequest, NextResponse } from "next/server";
import { runGenesisG8IntelligentBackgroundRefresh } from "@/lib/genesis-g8/background-refresh";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorised(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = request.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  if (!authorised(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const summary = await runGenesisG8IntelligentBackgroundRefresh({ limit: 4 });
    return NextResponse.json(summary, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: "GENESIS_G8_BACKGROUND_REFRESH_FAILED", detail: message }, { status: 500 });
  }
}
