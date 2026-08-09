import { NextResponse } from "next/server";
import { hasFounderDashboardSession } from "@/lib/founder-dashboard/auth";
import { resolveGenesisG8FounderReview } from "@/lib/genesis-g8/founder-review-resolution";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ACTIONS = new Set(["APPROVE", "CORRECT", "REJECT", "MORE_RESEARCH"]);
const wantsJson=(request:Request)=>request.headers.get("accept")?.includes("application/json")??false;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await hasFounderDashboardSession())) {
    if(wantsJson(request)) return NextResponse.json({ok:false,error:"FOUNDER_SESSION_REQUIRED"},{status:401});
    return NextResponse.redirect(new URL("/dashboard/login", request.url), 303);
  }
  const { id } = await params;
  const form = await request.formData();
  const action = String(form.get("action") ?? "").toUpperCase();
  const note = String(form.get("note") ?? "").trim();
  const reasonCode = String(form.get("reasonCode") ?? "FOUNDER_REVIEW").trim();
  if (!ACTIONS.has(action)) {
    if(wantsJson(request)) return NextResponse.json({ok:false,error:"INVALID_REVIEW_ACTION"},{status:400});
    return NextResponse.redirect(new URL("/dashboard?g8review=invalid", request.url), 303);
  }
  if (action === "CORRECT" && !note) {
    if(wantsJson(request)) return NextResponse.json({ok:false,error:"Correction detail is required."},{status:400});
    return NextResponse.redirect(new URL("/dashboard?g8review=correction-required", request.url), 303);
  }

  try {
    const result=await resolveGenesisG8FounderReview({
      reviewTaskId: id,
      action: action as "APPROVE" | "CORRECT" | "REJECT" | "MORE_RESEARCH",
      reasonCode,
      note: note || null,
      correction: action === "CORRECT" ? { founderCorrection: note } : null,
    });
    if(wantsJson(request)) return NextResponse.json({ok:true,result});
    return NextResponse.redirect(new URL(`/dashboard?g8review=${action.toLowerCase()}`, request.url), 303);
  } catch (error) {
    console.error("Genesis G8 founder review resolution failed", error);
    const message=error instanceof Error?error.message:"REVIEW_RESOLUTION_FAILED";
    if(wantsJson(request)) return NextResponse.json({ok:false,error:message},{status:500});
    return NextResponse.redirect(new URL("/dashboard?g8review=failed", request.url), 303);
  }
}
