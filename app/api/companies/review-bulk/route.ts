import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOrganisationContext } from "@/lib/auth/organisation-context";
import { databaseRequest } from "@/lib/database/postgrest";

const Schema = z.object({
  companyIds: z.array(z.string().uuid()).min(1).max(100),
  status: z.enum(["APPROVED", "REJECTED", "ARCHIVED", "PENDING_REVIEW"]),
  note: z.string().trim().max(500).optional(),
});

export async function POST(request: Request) {
  try {
    const input = Schema.parse(await request.json());
    const context = await requireOrganisationContext();
    const count = await databaseRequest<number>("rpc/bulk_review_salespilot_companies", {
      method: "POST",
      body: JSON.stringify({
        p_organisation_id: context.organisationId,
        p_company_ids: input.companyIds,
        p_user_id: context.userId,
        p_status: input.status,
        p_note: input.note ?? null,
      }),
    });
    return NextResponse.json({ ok: true, reviewed: Number(count) });
  } catch (error) {
    console.error("Bulk company review failed", error);
    return NextResponse.json({ ok: false, error: { message: "SalesPilot could not save these reviews." } }, { status: 400 });
  }
}
