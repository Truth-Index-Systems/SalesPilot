import { NextResponse } from "next/server";
import { z } from "zod";
import { createBusinessAnalysisJob, getBusinessAnalysisJob } from "@/lib/intelligence/business-analysis-jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const StartSchema = z.object({ website: z.string().trim().min(3).max(500) });

function publicJob(job: Awaited<ReturnType<typeof getBusinessAnalysisJob>>) {
  if (!job) return null;
  return {
    id: job.id,
    website: job.website_input,
    canonicalUrl: job.canonical_url,
    status: job.status,
    stage: job.stage,
    progress: job.progress,
    attemptCount: job.attempt_count,
    nextRetryAt: job.next_retry_at,
    error: job.last_error_code ? (() => {
      const governanceReason = job.last_error_message?.split(":").at(-1);
      if (job.last_error_code === "AI_GOVERNANCE_BLOCKED") {
        if (governanceReason === "PLATFORM_DISABLED") return {
          code: "AI_PLATFORM_PAUSED",
          title: "AI research is currently paused",
          message: "SalesPilot's deployment-level AI safety gate is disabled, so no OpenAI request was made.",
          hint: "Enable the platform gate in Vercel, then manage workspace access from Settings → AI governance.",
        };
        if (governanceReason === "AUTONOMY_DISABLED") return {
          code: "AI_WORKSPACE_PAUSED",
          title: "AI research is paused for this workspace",
          message: "The workspace AI switch is off, so SalesPilot stopped before using any credit.",
          hint: "An owner or administrator can enable it in Settings → AI governance.",
        };
        return {
          code: "AI_BUDGET_BLOCKED",
          title: "AI research stopped at its safety limit",
          message: "SalesPilot blocked this request before OpenAI because a daily request or cost limit was reached.",
          hint: "Review today's usage and limits in Settings → AI governance.",
        };
      }
      return {
        code: job.last_error_code,
        title: job.status === "FAILED_TERMINAL" ? "SalesPilot could not complete this analysis" : "Analysis paused before completion",
        message: job.last_error_message ?? "The analysis did not complete.",
        hint: job.status === "FAILED_RETRYABLE" ? "SalesPilot has saved the job. Retry it when the scheduled time arrives." : "Check the website and configuration before trying again.",
      };
    })() : null,
    pagesRead: job.pages_read,
    analysis: job.analysis_json,
    updatedAt: job.updated_at,
  };
}

export async function POST(request: Request) {
  try {
    const input = StartSchema.parse(await request.json());
    const created = await createBusinessAnalysisJob(input.website);
    return NextResponse.json({ ok: true, job: publicJob(created.job), accessToken: created.accessToken }, { status: 202 });
  } catch (error) {
    console.error("Business analysis job creation failed", error);
    if (error instanceof z.ZodError) {
      return NextResponse.json({ ok: false, error: { code: "INVALID_REQUEST", title: "Check the website address", message: "Please enter a valid company website.", hint: "Enter an address such as yourcompany.com." } }, { status: 400 });
    }
    return NextResponse.json({ ok: false, error: { code: "SERVICE_UNAVAILABLE", title: "Analysis could not be started", message: "SalesPilot could not save the analysis job.", hint: "Please try again in a moment." } }, { status: 503 });
  }
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const jobId = z.string().uuid().parse(url.searchParams.get("jobId"));
    const accessToken = z.string().min(20).parse(url.searchParams.get("accessToken"));
    const job = await getBusinessAnalysisJob(jobId, accessToken);
    if (!job) return NextResponse.json({ ok: false, error: { code: "JOB_NOT_FOUND", title: "Analysis job not found", message: "This saved analysis could not be found.", hint: "Start a new analysis." } }, { status: 404 });
    return NextResponse.json({ ok: true, job: publicJob(job) });
  } catch (error) {
    console.error("Business analysis status failed", error);
    return NextResponse.json({ ok: false, error: { code: "INVALID_JOB", title: "Analysis could not be loaded", message: "The saved analysis reference is invalid.", hint: "Start a new analysis." } }, { status: 400 });
  }
}
