import { NextResponse } from "next/server";
import { z } from "zod";
import { recordEngagementExecution } from "@/lib/engagement/review-repository";

const Schema = z.object({
  action: z.enum(["COPIED", "OPENED", "STARTED", "COMPLETED", "RESET"]),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const input = Schema.parse(await request.json());
    await recordEngagementExecution(id, input.action, input.metadata);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Engagement execution update failed", error);
    return NextResponse.json({ ok: false, error: { message: "SalesPilot could not update this engagement." } }, { status: 400 });
  }
}
