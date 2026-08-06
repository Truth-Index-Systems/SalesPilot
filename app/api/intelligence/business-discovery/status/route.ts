import { NextResponse } from "next/server";
import { z } from "zod";
import { getBusinessAnalysisJob } from "@/lib/intelligence/business-analysis-jobs";
import { normaliseBusinessAnalysis } from "@/lib/intelligence/fit-score";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Schema = z.object({ jobId: z.string().uuid(), accessToken: z.string().min(20).max(256) });

function publicJob(job: NonNullable<Awaited<ReturnType<typeof getBusinessAnalysisJob>>>) {
  return {
    id: job.id, website: job.website_input, canonicalUrl: job.canonical_url, status: job.status,
    stage: job.stage, progress: job.progress, attemptCount: job.attempt_count, nextRetryAt: job.next_retry_at,
    error: job.last_error_code ? safePublicError(job.last_error_code, job.status, job.last_error_message) : null,
    pagesRead: job.pages_read, analysis: job.analysis_json ? normaliseBusinessAnalysis(job.analysis_json as any) : null,
    updatedAt: job.updated_at,
  };
}

function safePublicError(code: string, status: string, storedMessage: string | null) {
  const governanceReason = storedMessage?.split(":").at(-1);
  if (code === "AI_GOVERNANCE_BLOCKED") {
    if (governanceReason === "PLATFORM_DISABLED") return { code:"AI_PLATFORM_PAUSED", title:"AI research is currently paused", message:"SalesPilot's deployment-level AI safety gate is disabled, so no OpenAI request was made.", hint:"Enable the platform gate in Vercel, then manage workspace access from Settings → AI governance." };
    if (governanceReason === "AUTONOMY_DISABLED") return { code:"AI_WORKSPACE_PAUSED", title:"AI research is paused for this workspace", message:"The workspace AI switch is off, so SalesPilot stopped before using any credit.", hint:"An owner or administrator can enable it in Settings → AI governance." };
    return { code:"AI_BUDGET_BLOCKED", title:"AI research stopped at its safety limit", message:"SalesPilot blocked this request before OpenAI because a daily request or cost limit was reached.", hint:"Review today's usage and limits in Settings → AI governance." };
  }
  if (code === "INVALID_AI_OUTPUT") return { code:"ANALYSIS_INTERRUPTED", title:status === "FAILED_TERMINAL" ? "SalesPilot could not complete this analysis" : "Analysis paused safely", message:"The AI response did not complete in the required structured format. No incomplete result was saved.", hint:status === "FAILED_RETRYABLE" ? "SalesPilot saved the job and can retry this stage safely." : "Start the analysis again." };
  if (code.startsWith("WEBSITE_")) return { code, title:"Website analysis could not complete", message:"SalesPilot could not read enough public website information to complete the analysis.", hint:status === "FAILED_RETRYABLE" ? "The saved job can retry without losing completed work." : "Check that the website is publicly reachable, then try again." };
  return { code:"ANALYSIS_INTERRUPTED", title:status === "FAILED_TERMINAL" ? "Analysis could not complete" : "Analysis paused safely", message:"SalesPilot encountered a technical interruption. No partial AI result was exposed.", hint:status === "FAILED_RETRYABLE" ? "The saved job can retry this stage safely." : "Try the analysis again." };
}

export async function POST(request: Request) {
  try {
    const input = Schema.parse(await request.json());
    const job = await getBusinessAnalysisJob(input.jobId, input.accessToken);
    if (!job) return NextResponse.json({ ok:false, error:{ code:"JOB_NOT_FOUND", title:"Analysis job not found", message:"This saved analysis could not be found.", hint:"Start a new analysis." } }, { status:404, headers:{"Cache-Control":"no-store","Referrer-Policy":"no-referrer"} });
    return NextResponse.json({ ok:true, job:publicJob(job) }, { headers:{"Cache-Control":"no-store","Referrer-Policy":"no-referrer"} });
  } catch (error) {
    console.error("Business analysis status failed", error);
    return NextResponse.json({ ok:false, error:{ code:"INVALID_JOB", title:"Analysis could not be loaded", message:"The saved analysis reference is invalid.", hint:"Start a new analysis." } }, { status:400, headers:{"Cache-Control":"no-store","Referrer-Policy":"no-referrer"} });
  }
}
