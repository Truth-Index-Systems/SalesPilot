import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { runGenesisG8DiscoveryRepairWorker } from "@/lib/genesis-g8/discovery-repair-worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorised(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!secret || !supplied) return false;
  const expected = Buffer.from(secret);
  const actual = Buffer.from(supplied);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

async function run(request: Request) {
  if (!authorised(request)) return NextResponse.json({ ok: false }, { status: 401 });
  const result = await runGenesisG8DiscoveryRepairWorker(2);
  const failed = result.failedFinal > 0;
  return NextResponse.json({ ok: !failed, result }, { status: failed ? 207 : 200 });
}

export const GET = run;
export const POST = run;
