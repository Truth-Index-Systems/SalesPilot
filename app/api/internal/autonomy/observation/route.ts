import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOrganisationContext } from "@/lib/auth/organisation-context";
import { databaseRequest } from "@/lib/database/postgrest";

const Schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("START"), hours: z.number().int().min(1).max(168).default(24) }),
  z.object({ action: z.literal("COMPLETE"), passed: z.boolean(), freeze: z.boolean().default(false), notes: z.string().max(2000).optional() }),
]);
export async function POST(request: Request) {
  try {
    const context = await requireOrganisationContext();
    if (!['OWNER', 'ADMIN'].includes(context.role)) return NextResponse.json({ ok: false, error: 'FORBIDDEN' }, { status: 403 });
    const input = Schema.parse(await request.json());
    const result = input.action === "START"
      ? await databaseRequest("rpc/start_pipeline_observation", { method: "POST", body: JSON.stringify({ p_organisation_id: context.organisationId, p_started_by: context.userId, p_hours: input.hours }) })
      : await databaseRequest("rpc/complete_pipeline_observation", { method: "POST", body: JSON.stringify({ p_organisation_id: context.organisationId, p_completed_by: context.userId, p_passed: input.passed, p_freeze: input.freeze, p_notes: input.notes ?? null }) });
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    console.error("Pipeline observation action failed", error);
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "PIPELINE_OBSERVATION_FAILED" }, { status: 400 });
  }
}
