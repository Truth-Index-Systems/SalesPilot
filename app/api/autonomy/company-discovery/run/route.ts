import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { runNextCompanyDiscovery } from "@/features/discovery/company-discovery.service";

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
  try {
    return NextResponse.json({ ok: true, ...(await runNextCompanyDiscovery()) });
  } catch (error) {
    console.error("Company discovery worker failed", error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

export const GET = run;
export const POST = run;
