import { formatDateTime } from "@/lib/date-time";
import type { PipelineJobState } from "@/lib/pipeline/job-state";

export type PersistedJobLike = {
  job_state?: string | null;
  status?: string | null;
  stage?: string | null;
  progress?: number | null;
  next_retry_at?: string | null;
  next_attempt_at?: string | null;
  attempt_count?: number | null;
  last_error_code?: string | null;
  result_summary_json?: Record<string, unknown> | null;
};

const CANONICAL = new Set<PipelineJobState>([
  "QUEUED", "RUNNING", "COMPLETED", "NO_RESULTS", "EXHAUSTED", "PAUSED",
  "CANCELLED", "FAILED_RETRYABLE", "FAILED_TERMINAL",
]);

export function resolvePersistedJobState(job: PersistedJobLike | null | undefined): PipelineJobState | null {
  if (!job) return null;
  const canonical = String(job.job_state ?? "").toUpperCase();
  if (CANONICAL.has(canonical as PipelineJobState)) return canonical as PipelineJobState;

  const legacy = String(job.status ?? "").toUpperCase();
  if (legacy === "QUEUED") return "QUEUED";
  if (legacy === "RUNNING") return "RUNNING";
  if (legacy === "COMPLETED") return Number(job.result_summary_json?.recordsSaved ?? 1) === 0 ? "NO_RESULTS" : "COMPLETED";
  if (legacy === "FAILED") return job.next_retry_at ? "FAILED_RETRYABLE" : "FAILED_TERMINAL";
  if (legacy === "CANCELLED") return "CANCELLED";
  return null;
}

export function isJobRunning(job: PersistedJobLike | null | undefined): boolean {
  return resolvePersistedJobState(job) === "RUNNING";
}

export function isJobQueued(job: PersistedJobLike | null | undefined): boolean {
  return resolvePersistedJobState(job) === "QUEUED";
}

export function isJobActive(job: PersistedJobLike | null | undefined): boolean {
  const state = resolvePersistedJobState(job);
  return state === "QUEUED" || state === "RUNNING";
}

export function isJobComplete(job: PersistedJobLike | null | undefined): boolean {
  const state = resolvePersistedJobState(job);
  return state === "COMPLETED" || state === "NO_RESULTS" || state === "EXHAUSTED";
}

export function isJobRetryScheduled(job: PersistedJobLike | null | undefined): boolean {
  return resolvePersistedJobState(job) === "FAILED_RETRYABLE";
}

export function isJobPreparingFirstPass(job: PersistedJobLike | null | undefined): boolean {
  return resolvePersistedJobState(job) === "QUEUED"
    && String(job?.stage ?? "").toUpperCase() === "PREPARING"
    && Number(job?.attempt_count ?? 0) === 0
    && job?.result_summary_json?.expansionPending !== true;
}

export function canShowProgress(job: PersistedJobLike | null | undefined): boolean {
  return isJobRunning(job);
}

export function truthfulProgress(job: PersistedJobLike | null | undefined): number | null {
  if (!canShowProgress(job)) return null;
  return Math.max(0, Math.min(99, Number(job?.progress ?? 0)));
}

export function jobStateLabel(job: PersistedJobLike | null | undefined, options?: { queued?: string; running?: string; complete?: string; noResults?: string }): string {
  const state = resolvePersistedJobState(job);
  switch (state) {
    case "QUEUED": return isJobPreparingFirstPass(job) ? "Preparing" : (options?.queued ?? "Queued");
    case "RUNNING": return options?.running ?? "Researching";
    case "COMPLETED": return options?.complete ?? "Complete";
    case "NO_RESULTS": return options?.noResults ?? "No supported results found";
    case "EXHAUSTED": return "Research scope exhausted";
    case "PAUSED": return "Research paused";
    case "FAILED_RETRYABLE": return job?.next_retry_at ? `Retry scheduled ${formatDateTime(job.next_retry_at)}` : "Retry scheduled";
    case "FAILED_TERMINAL": return "Needs attention";
    case "CANCELLED": return "Cancelled";
    default: return "Waiting";
  }
}

export function jobTone(job: PersistedJobLike | null | undefined): "active" | "complete" | "waiting" | "attention" | "neutral" {
  const state = resolvePersistedJobState(job);
  if (state === "RUNNING") return "active";
  if (state === "COMPLETED") return "complete";
  if (["QUEUED", "PAUSED", "FAILED_RETRYABLE", "NO_RESULTS", "EXHAUSTED"].includes(state ?? "")) return "waiting";
  if (state === "FAILED_TERMINAL") return "attention";
  return "neutral";
}
