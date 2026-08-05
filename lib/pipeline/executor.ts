export type WorkerKind = "COMPANY_DISCOVERY" | "CONTACT_DISCOVERY";

export type WorkerExecutionOutcome =
  | "NO_JOB"
  | "COMPLETED_WITH_RESULTS"
  | "COMPLETED_NO_RESULTS";

export type WorkerExecutionResult = {
  worker: WorkerKind;
  processed: boolean;
  outcome: WorkerExecutionOutcome;
  sessionId?: string;
  saved?: number;
};

/**
 * Pure worker executors may only:
 * claim existing eligible work, execute it, persist its result and finish.
 * They may not create downstream work or advance campaign state.
 */
export type WorkerExecutor = () => Promise<WorkerExecutionResult>;
