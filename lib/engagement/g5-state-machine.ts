import "server-only";
import { databaseRequest } from "@/lib/database/postgrest";

export const G5_ENGAGEMENT_STATES = [
  "WAITING","REASONING","STRATEGY_READY","GENERATING","SELF_REVIEW",
  "READY_FOR_APPROVAL","APPROVED","QUEUED","SENT","FAILED_RETRYABLE","FAILED_TERMINAL",
] as const;
export type G5EngagementState = (typeof G5_ENGAGEMENT_STATES)[number];

export type G5EngagementClaim = {
  strategy_id: string;
  lease_token: string;
  opportunity_id: string;
  source_engagement_id: string | null;
};

export async function seedG5EngagementStrategies(schedulerRunId: string): Promise<number> {
  return Number(await databaseRequest<number>("rpc/seed_g5_engagement_strategies", {
    method: "POST", body: JSON.stringify({ p_scheduler_run_id: schedulerRunId }),
  }));
}

export async function claimG5EngagementStrategy(input: {
  schedulerRunId: string; expectedState: G5EngagementState; nextState: G5EngagementState; leaseSeconds?: number;
}): Promise<G5EngagementClaim | null> {
  const rows = await databaseRequest<G5EngagementClaim[]>("rpc/claim_g5_engagement_strategy", {
    method: "POST", body: JSON.stringify({
      p_scheduler_run_id: input.schedulerRunId,
      p_expected_state: input.expectedState,
      p_next_state: input.nextState,
      p_lease_seconds: input.leaseSeconds ?? 300,
    }),
  });
  return rows[0] ?? null;
}

export async function transitionG5EngagementStrategy(input: {
  strategyId: string; schedulerRunId: string; leaseToken: string;
  expectedState: G5EngagementState; nextState: G5EngagementState; metadata?: Record<string, unknown>;
}) {
  return databaseRequest("rpc/transition_g5_engagement_strategy", {
    method: "POST", body: JSON.stringify({
      p_strategy_id: input.strategyId,p_scheduler_run_id: input.schedulerRunId,p_lease_token: input.leaseToken,
      p_expected_state: input.expectedState,p_next_state: input.nextState,p_metadata: input.metadata ?? {},
    }),
  });
}

export async function failG5EngagementStrategy(input: {
  strategyId: string; schedulerRunId: string; leaseToken: string; failureStage: string;
  reason: string; retryable: boolean; retryAfterSeconds?: number;
}) {
  return databaseRequest("rpc/fail_g5_engagement_strategy", {
    method: "POST", body: JSON.stringify({
      p_strategy_id: input.strategyId,p_scheduler_run_id: input.schedulerRunId,p_lease_token: input.leaseToken,
      p_failure_stage: input.failureStage,p_reason: input.reason,p_retryable: input.retryable,
      p_retry_after_seconds: input.retryAfterSeconds ?? 60,
    }),
  });
}
