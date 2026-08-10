import { NextResponse } from "next/server";
import { requireOrganisationContext } from "@/lib/auth/organisation-context";
import { loadGenesisSellerContext } from "@/lib/integrations/genesis-t8/genesis-seller-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const organisation = await requireOrganisationContext();
    const sellerContext = await loadGenesisSellerContext(id, organisation.organisationId);
    return NextResponse.json({ ok: true, constraints: sellerContext.constraintSet });
  } catch (error) {
    const message = error instanceof Error ? error.message : "GENESIS_CONSTRAINT_SET_UNAVAILABLE";
    const status = message === "AUTHENTICATION_REQUIRED" ? 401 : message.includes("MEMBERSHIP") ? 403 : message.includes("NOT_FOUND") ? 404 : 500;
    return NextResponse.json({ ok: false, error: { code: message } }, { status });
  }
}
