import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { runOpenAIBackgroundCollector } from "@/lib/ai/background-collector";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 90;

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
  const collector = await runOpenAIBackgroundCollector();
  return NextResponse.json({ ok: true, collector });
}

export const GET = run;
export const POST = run;
