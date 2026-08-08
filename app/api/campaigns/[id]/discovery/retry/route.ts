import { NextResponse } from "next/server";
import { requireOrganisationContext } from "@/lib/auth/organisation-context";
import { databaseRequest } from "@/lib/database/postgrest";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const context = await requireOrganisationContext({ canLaunch: true });
    const retried = await databaseRequest<boolean>("rpc/retry_company_discovery", {
      method: "POST",
      body: JSON.stringify({ p_campaign_id: id, p_organisation_id: context.organisationId }),
    });
    if (!retried) return NextResponse.json({ ok: false }, { status: 409 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Company discovery retry failed", error);
    return NextResponse.json({ ok: false, error: { message: "MarketRoute could not restart company discovery." } }, { status: 400 });
  }
}
