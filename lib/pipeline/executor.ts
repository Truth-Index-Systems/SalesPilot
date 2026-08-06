export type WorkerKind = "COMPANY_DISCOVERY" | "CONTACT_DISCOVERY";

export type WorkerExecutionOutcome =
  | "NO_JOB"
  | "COMPLETED_WITH_RESULTS"
  | "COMPLETED_NO_RESULTS"
  | "CONTINUING";

export type WorkerExecutionResult = {
  worker: WorkerKind;
  processed: boolean;
  outcome: WorkerExecutionOutcome;
  sessionId?: string;
  saved?: number;
};

export type WorkerExecutionContext = {
  schedulerRunId: string;
};

/** Pure workers execute scheduler-assigned work and never create follow-on work. */
export type WorkerExecutor = (context: WorkerExecutionContext) => Promise<WorkerExecutionResult>;
