import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { runNextCompanyDiscovery } from "@/features/discovery/company-discovery.service";
import { runNextContactDiscovery } from "@/features/contacts/contact-discovery.service";

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

async function settle<T>(work: Promise<T>): Promise<{ ok: true; result: T } | { ok: false; error: string }> {
  try {
    return { ok: true, result: await work };
  } catch (error) {
    console.error("Autonomous pipeline worker failed", error);
    return { ok: false, error: error instanceof Error ? error.message : "PIPELINE_WORKER_FAILED" };
  }
}

async function run(request: Request) {
  if (!authorised(request)) return NextResponse.json({ ok: false }, { status: 401 });

  const [companies, contacts] = await Promise.all([
    settle(runNextCompanyDiscovery()),
    settle(runNextContactDiscovery()),
  ]);

  const ok = companies.ok && contacts.ok;
  return NextResponse.json({ ok, companies, contacts }, { status: ok ? 200 : 207 });
}

export const GET = run;
export const POST = run;
