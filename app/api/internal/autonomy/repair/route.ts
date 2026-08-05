import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOrganisationContext } from "@/lib/auth/organisation-context";
import { databaseRequest } from "@/lib/database/postgrest";

const Schema = z.object({ dryRun: z.boolean().default(true) });
export async function POST(request: Request) {
  try {
    const context = await requireOrganisationContext();
    if (!['OWNER', 'ADMIN'].includes(context.role)) return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
    const input = Schema.parse(await request.json());
    const summary = await databaseRequest("rpc/repair_pipeline_state", { method: "POST", body: JSON.stringify({ p_organisation_id: context.organisationId, p_requested_by: context.userId, p_dry_run: input.dryRun }) });
    return NextResponse.json({ ok: true, summary });
  } catch (error) {
    console.error("Pipeline repair failed", error);
    return NextResponse.json({ ok: false, error: "PIPELINE_REPAIR_FAILED" }, { status: 400 });
  }
}
