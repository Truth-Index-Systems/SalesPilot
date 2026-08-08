import { NextResponse } from "next/server";
import { hasFounderDashboardSession } from "@/lib/founder-dashboard/auth";
import { resolveGenesisG8FounderReview } from "@/lib/genesis-g8/founder-review-resolution";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ACTIONS = new Set(["APPROVE", "CORRECT", "REJECT", "MORE_RESEARCH"]);

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await hasFounderDashboardSession())) return NextResponse.redirect(new URL("/dashboard/login", request.url), 303);
  const { id } = await params;
  const form = await request.formData();
  const action = String(form.get("action") ?? "").toUpperCase();
  const note = String(form.get("note") ?? "").trim();
  const reasonCode = String(form.get("reasonCode") ?? "FOUNDER_REVIEW").trim();
  if (!ACTIONS.has(action)) return NextResponse.redirect(new URL("/dashboard?g8review=invalid", request.url), 303);
  if (action === "CORRECT" && !note) return NextResponse.redirect(new URL("/dashboard?g8review=correction-required", request.url), 303);

  try {
    await resolveGenesisG8FounderReview({
      reviewTaskId: id,
      action: action as "APPROVE" | "CORRECT" | "REJECT" | "MORE_RESEARCH",
      reasonCode,
      note: note || null,
      correction: action === "CORRECT" ? { founderCorrection: note } : null,
    });
    return NextResponse.redirect(new URL(`/dashboard?g8review=${action.toLowerCase()}`, request.url), 303);
  } catch (error) {
    console.error("Genesis G8 founder review resolution failed", error);
    return NextResponse.redirect(new URL("/dashboard?g8review=failed", request.url), 303);
  }
}
