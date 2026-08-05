import type { PipelineErrorCode } from "./errors";

const RETRY_MINUTES = [1, 5, 30, 120] as const;
const NO_RESULT_MINUTES = [30, 120, 720, 1440] as const;

export const MAX_PIPELINE_ATTEMPTS = 5;

export function retryDelayMinutes(attemptCount: number, code: PipelineErrorCode): number | null {
  if (attemptCount >= MAX_PIPELINE_ATTEMPTS) return null;
  const base = RETRY_MINUTES[Math.min(Math.max(attemptCount - 1, 0), RETRY_MINUTES.length - 1)];
  return code === "RATE_LIMIT" ? Math.max(base, 5) : base;
}

export function noResultCooldownMinutes(emptyCycleCount: number): number {
  return NO_RESULT_MINUTES[Math.min(Math.max(emptyCycleCount, 0), NO_RESULT_MINUTES.length - 1)];
}
