import { NextResponse } from "next/server";
import { z } from "zod";
import { reviewG5EngagementStrategy } from "@/lib/engagement/g5-assisted-approval";

const EditSchema = z.object({
  subject: z.string().trim().max(180).nullable().optional(),
  body: z.string().trim().min(1).max(3000),
  callToAction: z.string().trim().min(1).max(500),
});
const Schema = z.object({
  action: z.enum(["APPROVE", "EDIT", "REJECT", "TRY_SECONDARY_ROUTE"]),
  note: z.string().trim().max(500).optional(),
  edit: EditSchema.optional(),
}).superRefine((value, ctx) => {
  if (value.action === "EDIT" && !value.edit) ctx.addIssue({ code: "custom", path: ["edit"], message: "Edited outreach required" });
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const input = Schema.parse(await request.json());
    const result = await reviewG5EngagementStrategy(id, input.action, input.note, input.edit);
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    console.error("G5 assisted approval failed", error);
    return NextResponse.json({ ok: false, error: { message: "MarketRoute could not save this engagement decision." } }, { status: 400 });
  }
}
