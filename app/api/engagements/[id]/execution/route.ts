import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    { ok: false, error: { message: "Legacy engagement controls are frozen. Use the G5 Opportunity workspace." } },
    { status: 410 },
  );
}
