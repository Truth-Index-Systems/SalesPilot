import { NextResponse } from "next/server";
import { z } from "zod";
import { reviewOpportunity } from "@/lib/opportunities/repository";

const Schema = z.object({
  campaignId: z.string().uuid(),
  status: z.enum(["APPROVED", "REJECTED"]),
  note: z.string().trim().max(500).optional(),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const input = Schema.parse(await request.json());
    await reviewOpportunity(input.campaignId, id, input.status, input.note);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Opportunity review failed", error);
    return NextResponse.json({ ok: false, error: { message: "SalesPilot could not save this opportunity review." } }, { status: 400 });
  }
}
