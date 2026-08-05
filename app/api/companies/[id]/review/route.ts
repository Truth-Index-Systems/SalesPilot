import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOrganisationContext } from "@/lib/auth/organisation-context";
import { databaseRequest } from "@/lib/database/postgrest";

const Schema = z.object({
  campaignId: z.string().uuid(),
  status: z.enum(["APPROVED", "REJECTED", "ARCHIVED", "PENDING_REVIEW"]),
  note: z.string().trim().max(500).optional(),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const input = Schema.parse(await request.json());
    const context = await requireOrganisationContext();
    const rows = await databaseRequest<any[]>("rpc/review_salespilot_company_scoped", {
      method: "POST",
      body: JSON.stringify({
        p_organisation_id: context.organisationId,
        p_campaign_id: input.campaignId,
        p_company_id: id,
        p_user_id: context.userId,
        p_status: input.status,
        p_note: input.note ?? null,
      }),
    });
    const company = Array.isArray(rows) ? rows[0] : rows;
    if (!company) return NextResponse.json({ ok: false }, { status: 404 });
    return NextResponse.json({ ok: true, company: { id: company.id, campaignId: company.campaign_id, status: company.review_status } });
  } catch (error) {
    console.error("Company review failed", error);
    return NextResponse.json({ ok: false, error: { message: "SalesPilot could not save this review." } }, { status: 400 });
  }
}
