import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOrganisationContext } from "@/lib/auth/organisation-context";
import { databaseRequest } from "@/lib/database/postgrest";

const Schema = z.object({
  opportunities: z.array(z.object({ id: z.string().uuid(), campaignId: z.string().uuid() })).min(1).max(100),
  status: z.enum(["APPROVED", "REJECTED"]),
  note: z.string().trim().max(500).optional(),
});

export async function POST(request: Request) {
  try {
    const input = Schema.parse(await request.json());
    const context = await requireOrganisationContext();
    if (context.role === "VIEWER") throw new Error("OPPORTUNITY_REVIEW_FORBIDDEN");
    const grouped = new Map<string, string[]>();
    for (const opportunity of input.opportunities) {
      grouped.set(opportunity.campaignId, [...(grouped.get(opportunity.campaignId) ?? []), opportunity.id]);
    }
    let reviewed = 0;
    for (const [campaignId, ids] of grouped) {
      reviewed += Number(await databaseRequest<number>("rpc/bulk_review_salespilot_opportunities_scoped", {
        method: "POST",
        body: JSON.stringify({
          p_organisation_id: context.organisationId,
          p_campaign_id: campaignId,
          p_opportunity_ids: ids,
          p_user_id: context.userId,
          p_status: input.status,
          p_note: input.note ?? null,
        }),
      }));
    }
    return NextResponse.json({ ok: true, reviewed });
  } catch (error) {
    console.error("Bulk opportunity review failed", error);
    return NextResponse.json({ ok: false, error: { message: "MarketRoute could not save these opportunity reviews." } }, { status: 400 });
  }
}
