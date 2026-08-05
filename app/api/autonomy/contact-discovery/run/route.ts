import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Contact discovery is no longer independently dispatchable.
 *
 * S3 makes the worker a pure executor controlled by the single pipeline
 * scheduler. Keeping this route as an explicit tombstone avoids accidental
 * cron/manual invocations silently competing with scheduler ownership.
 */
async function run() {
  return NextResponse.json(
    {
      ok: false,
      code: "PIPELINE_SCHEDULER_REQUIRED",
      message: "Contact discovery is dispatched only by the autonomous pipeline scheduler.",
    },
    { status: 409 },
  );
}

export const GET = run;
export const POST = run;
