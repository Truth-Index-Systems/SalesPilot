/**
 * Canonical autonomous job state contract for Genesis stabilisation.
 *
 * This module is deliberately runtime-independent. S0/S1 define the contract
 * before the scheduler and existing workers are changed in later stages.
 */
export const PIPELINE_JOB_STATES = [
  "QUEUED",
  "RUNNING",
  "COMPLETED",
  "NO_RESULTS",
  "EXHAUSTED",
  "PAUSED",
  "CANCELLED",
  "FAILED_RETRYABLE",
  "FAILED_TERMINAL",
] as const;

export type PipelineJobState = (typeof PIPELINE_JOB_STATES)[number];

export const ACTIVE_PIPELINE_JOB_STATES = ["QUEUED", "RUNNING"] as const satisfies readonly PipelineJobState[];
export const WAITING_PIPELINE_JOB_STATES = ["PAUSED", "FAILED_RETRYABLE"] as const satisfies readonly PipelineJobState[];
export const TERMINAL_PIPELINE_JOB_STATES = [
  "COMPLETED",
  "NO_RESULTS",
  "EXHAUSTED",
  "CANCELLED",
  "FAILED_TERMINAL",
] as const satisfies readonly PipelineJobState[];

const TRANSITIONS: Readonly<Record<PipelineJobState, readonly PipelineJobState[]>> = {
  QUEUED: ["RUNNING", "PAUSED", "CANCELLED"],
  RUNNING: ["COMPLETED", "NO_RESULTS", "EXHAUSTED", "PAUSED", "CANCELLED", "FAILED_RETRYABLE", "FAILED_TERMINAL"],
  COMPLETED: [],
  NO_RESULTS: [],
  EXHAUSTED: [],
  PAUSED: ["QUEUED", "CANCELLED"],
  CANCELLED: [],
  FAILED_RETRYABLE: ["QUEUED", "FAILED_TERMINAL", "CANCELLED"],
  FAILED_TERMINAL: [],
};

export type PipelineJobType = "BUSINESS_ANALYSIS" | "COMPANY_DISCOVERY" | "CONTACT_DISCOVERY";

export type PipelineJobErrorCode =
  | "TIMEOUT"
  | "RATE_LIMIT"
  | "NETWORK"
  | "INVALID_AI_OUTPUT"
  | "NO_VERIFIED_RESULTS"
  | "NO_SUPPORTED_CONTACTS"
  | "DATABASE_CONFLICT"
  | "CONFIGURATION"
  | "AUTHENTICATION"
  | "WORKER_LEASE_EXPIRED"
  | "UNKNOWN";

export type PipelineJobRecord = {
  id: string;
  organisationId: string;
  campaignId: string;
  jobType: PipelineJobType;
  state: PipelineJobState;
  attemptCount: number;
  claimedAt: string | null;
  leaseExpiresAt: string | null;
  lastHeartbeatAt: string | null;
  lastErrorCode: PipelineJobErrorCode | null;
  lastErrorMessage: string | null;
  nextRetryAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  resultSummary: Record<string, unknown> | null;
};

export function isPipelineJobState(value: string): value is PipelineJobState {
  return (PIPELINE_JOB_STATES as readonly string[]).includes(value);
}

export function isActivePipelineJobState(state: PipelineJobState): boolean {
  return (ACTIVE_PIPELINE_JOB_STATES as readonly PipelineJobState[]).includes(state);
}

export function isTerminalPipelineJobState(state: PipelineJobState): boolean {
  return (TERMINAL_PIPELINE_JOB_STATES as readonly PipelineJobState[]).includes(state);
}

export function canTransitionPipelineJob(from: PipelineJobState, to: PipelineJobState): boolean {
  return TRANSITIONS[from].includes(to);
}

export function assertPipelineJobTransition(from: PipelineJobState, to: PipelineJobState): void {
  if (!canTransitionPipelineJob(from, to)) {
    throw new Error(`INVALID_PIPELINE_JOB_TRANSITION:${from}->${to}`);
  }
}
