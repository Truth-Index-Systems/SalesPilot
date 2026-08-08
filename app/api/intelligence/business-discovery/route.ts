import { NextResponse } from "next/server";
import { z } from "zod";
import { createBusinessAnalysisJob, deleteQueuedAnonymousBusinessAnalysisJob, getBusinessAnalysisJob } from "@/lib/intelligence/business-analysis-jobs";
import { normaliseBusinessAnalysis } from "@/lib/intelligence/fit-score";
import { consumeAnonymousAnalysisAllowance, readAnonymousAnalysisAllowance, resolveAnonymousVisitor } from "@/lib/security/request-guard";
import { getCurrentUser } from "@/lib/auth/current-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const StartSchema = z.object({ website: z.string().trim().min(3).max(500) });

function attachAnonymousVisitorCookie(response: NextResponse, visitor: ReturnType<typeof resolveAnonymousVisitor>) {
  if (visitor.cookieValue) {
    response.cookies.set(visitor.cookieName, visitor.cookieValue, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: visitor.cookieMaxAge,
    });
  }
  return response;
}

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
          message: "MarketRoute's deployment-level AI safety gate is disabled, so no OpenAI request was made.",
          hint: "Enable the platform gate in Vercel, then manage workspace access from Settings → AI governance.",
        };
        if (governanceReason === "AUTONOMY_DISABLED") return {
          code: "AI_WORKSPACE_PAUSED",
          title: "AI research is paused for this workspace",
          message: "The workspace AI switch is off, so MarketRoute stopped before using any credit.",
          hint: "An owner or administrator can enable it in Settings → AI governance.",
        };
        return {
          code: "AI_BUDGET_BLOCKED",
          title: "AI research stopped at its safety limit",
          message: "MarketRoute blocked this request before OpenAI because a daily request or cost limit was reached.",
          hint: "Review today's usage and limits in Settings → AI governance.",
        };
      }
      if (job.last_error_code === "INVALID_AI_OUTPUT") return {
        code: "INVALID_AI_OUTPUT",
        title: job.status === "FAILED_TERMINAL" ? "MarketRoute could not complete this analysis" : "Analysis paused safely",
        message: "MarketRoute received an incomplete AI response while building the strategy.",
        hint: job.status === "FAILED_RETRYABLE" ? "The saved job can retry this stage without repeating the website research." : "Start the analysis again. No incomplete AI output has been saved.",
      };
      return {
        code: job.last_error_code,
        title: job.status === "FAILED_TERMINAL" ? "MarketRoute could not complete this analysis" : "Analysis paused before completion",
        message: "MarketRoute encountered a technical interruption. No partial result was exposed.",
        hint: job.status === "FAILED_RETRYABLE" ? "MarketRoute has saved the job. Retry it when the scheduled time arrives." : "Check the website and configuration before trying again.",
      };
    })() : null,
    pagesRead: job.pages_read,
    analysis: job.analysis_json ? normaliseBusinessAnalysis(job.analysis_json as any) : null,
    updatedAt: job.updated_at,
  };
}

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    if (user) return NextResponse.json({ ok: true, authenticated: true, allowance: null }, { headers: { "Cache-Control": "no-store" } });

    const visitor = resolveAnonymousVisitor(request);
    const allowance = await readAnonymousAnalysisAllowance(visitor);
    return attachAnonymousVisitorCookie(
      NextResponse.json({ ok: true, authenticated: false, allowance }, { headers: { "Cache-Control": "no-store" } }),
      visitor,
    );
  } catch (error) {
    console.error("Anonymous analysis allowance lookup failed", error);
    return NextResponse.json({ ok: false, error: { code: "ALLOWANCE_UNAVAILABLE", title: "Allowance could not be loaded", message: "MarketRoute could not load the complimentary analysis allowance.", hint: "You can still sign in to continue." } }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}

export async function POST(request: Request) {
  let visitor: ReturnType<typeof resolveAnonymousVisitor> | null = null;
  let anonymousCreated: Awaited<ReturnType<typeof createBusinessAnalysisJob>> | null = null;
  try {
    const input = StartSchema.parse(await request.json());
    const user = await getCurrentUser();
    let allowance = null;

    if (!user) visitor = resolveAnonymousVisitor(request);

    // Persist the durable job before committing the complimentary entitlement.
    // If quota enforcement rejects the request, remove the still-QUEUED ownerless
    // job immediately. A database/create failure therefore never burns one of the
    // visitor's three analyses.
    const created = await createBusinessAnalysisJob(input.website, { forceAnonymous: !user });
    if (!user) anonymousCreated = created;
    if (!user && visitor) {
      const consumed = await consumeAnonymousAnalysisAllowance(request, visitor);
      allowance = consumed.allowance;
      if (!consumed.allowed) {
        await deleteQueuedAnonymousBusinessAnalysisJob(created.job.id, created.accessToken).catch(error =>
          console.error("Rejected anonymous analysis cleanup failed", { jobId: created.job.id, error }),
        );
        anonymousCreated = null;
        return attachAnonymousVisitorCookie(
          NextResponse.json({ ok: false, allowance, error: { code: "ANALYSIS_LIMIT_REACHED", title: "Your complimentary analyses are complete", message: `You have used your ${allowance.limit} complimentary website analyses.`, hint: "Create an account or sign in to continue with MarketRoute." } }, { status: 429 }),
          visitor,
        );
      }
    }

    const response = NextResponse.json({ ok: true, job: publicJob(created.job), accessToken: created.accessToken, allowance }, { status: 202, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
    anonymousCreated = null;
    return visitor ? attachAnonymousVisitorCookie(response, visitor) : response;
  } catch (error) {
    if (anonymousCreated) {
      await deleteQueuedAnonymousBusinessAnalysisJob(anonymousCreated.job.id, anonymousCreated.accessToken).catch(cleanupError =>
        console.error("Failed anonymous analysis startup cleanup", { jobId: anonymousCreated?.job.id, cleanupError }),
      );
    }
    console.error("Business analysis job creation failed", error);
    const response = error instanceof z.ZodError
      ? NextResponse.json({ ok: false, error: { code: "INVALID_REQUEST", title: "Check the website address", message: "Please enter a valid company website.", hint: "Enter an address such as yourcompany.com." } }, { status: 400 })
      : NextResponse.json({ ok: false, error: { code: "SERVICE_UNAVAILABLE", title: "Analysis could not be started", message: "MarketRoute could not save the analysis job.", hint: "Please try again in a moment." } }, { status: 503 });
    return visitor ? attachAnonymousVisitorCookie(response, visitor) : response;
  }
}
