import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { runPipelineScheduler } from "@/lib/pipeline/scheduler";

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

  const scheduler = await runPipelineScheduler();
  if (!scheduler.acquired) {
    return NextResponse.json({ ok: true, skipped: true, reason: "SCHEDULER_ALREADY_RUNNING" });
  }

  const contactFailed = Array.isArray(scheduler.contact)
    ? scheduler.contact.some(result => result.ok === false)
    : scheduler.contact?.ok === false;
  const workerFailed = scheduler.company?.ok === false || contactFailed;
  return NextResponse.json(
    { ok: !workerFailed, skipped: false, scheduler },
    { status: workerFailed ? 207 : 200 },
  );
}

export const GET = run;
export const POST = run;
