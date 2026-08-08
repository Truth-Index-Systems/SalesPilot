import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOrganisationContext } from "@/lib/auth/organisation-context";
import { databaseRequest } from "@/lib/database/postgrest";

const Schema = z.object({
  companies: z.array(z.object({ id: z.string().uuid(), campaignId: z.string().uuid() })).min(1).max(100),
  status: z.enum(["APPROVED", "REJECTED", "ARCHIVED", "PENDING_REVIEW"]),
  note: z.string().trim().max(500).optional(),
});

export async function POST(request: Request) {
  try {
    const input = Schema.parse(await request.json());
    const context = await requireOrganisationContext();
    const grouped = new Map<string, string[]>();
    for (const company of input.companies) grouped.set(company.campaignId, [...(grouped.get(company.campaignId) ?? []), company.id]);

    let reviewed = 0;
    for (const [campaignId, companyIds] of grouped) {
      const count = await databaseRequest<number>("rpc/bulk_review_salespilot_companies_scoped", {
        method: "POST",
        body: JSON.stringify({
          p_organisation_id: context.organisationId,
          p_campaign_id: campaignId,
          p_company_ids: companyIds,
          p_user_id: context.userId,
          p_status: input.status,
          p_note: input.note ?? null,
        }),
      });
      reviewed += Number(count);
    }
    return NextResponse.json({ ok: true, reviewed });
  } catch (error) {
    console.error("Bulk company review failed", error);
    return NextResponse.json({ ok: false, error: { message: "MarketRoute could not save these reviews." } }, { status: 400 });
  }
}
