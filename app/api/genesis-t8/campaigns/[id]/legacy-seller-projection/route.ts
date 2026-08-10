import { NextResponse } from "next/server";
import { requireOrganisationContext } from "@/lib/auth/organisation-context";
import { loadGenesisSellerContext } from "@/lib/integrations/genesis-t8/genesis-seller-context";
import { projectLegacySellerFields } from "@/lib/integrations/genesis-t8/legacy-seller-projection";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const organisation = await requireOrganisationContext();
    const sellerContext = await loadGenesisSellerContext(id, organisation.organisationId);
    return NextResponse.json({ ok: true, projection: projectLegacySellerFields(sellerContext) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "GENESIS_LEGACY_SELLER_PROJECTION_READ_FAILED";
    const status = message === "AUTHENTICATION_REQUIRED" ? 401
      : message === "ORGANISATION_MEMBERSHIP_REQUIRED" ? 403
      : message === "GENESIS_SELLER_CONTEXT_NOT_FOUND" ? 404
      : 500;
    return NextResponse.json({ ok: false, error: { code: message } }, { status });
  }
}
