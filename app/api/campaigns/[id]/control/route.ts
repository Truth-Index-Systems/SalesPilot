import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOrganisationContext } from "@/lib/auth/organisation-context";
import { databaseRequest, DatabaseRequestError } from "@/lib/database/postgrest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  action: z.enum(["pause", "resume", "delete"]),
  confirmation: z.string().min(1).max(200),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const input = BodySchema.parse(await request.json());
    const context = await requireOrganisationContext({ canLaunch: true });
    await databaseRequest("rpc/control_salespilot_campaign", {
      method: "POST",
      body: JSON.stringify({
        p_campaign_id: id,
        p_organisation_id: context.organisationId,
        p_user_id: context.userId,
        p_action: input.action.toUpperCase(),
        p_confirmation: input.confirmation,
      }),
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof DatabaseRequestError) console.error("Campaign control failed", error.details);
    else console.error("Campaign control failed", error);
    return NextResponse.json({ ok: false, error: { title: "Campaign could not be updated", message: "SalesPilot could not complete this campaign action." } }, { status: 400 });
  }
}
