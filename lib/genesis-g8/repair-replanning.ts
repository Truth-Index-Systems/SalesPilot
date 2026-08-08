import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { databaseRequest } from "@/lib/database/postgrest";
import { retrieveGenesisG8KnowledgeById } from "./knowledge-retrieval";
import { planGenesisG8DualChannelWork, type GenesisG8DualChannelPlan } from "./planning";
import { buildGenesisG8ExecutionEnvelope, type GenesisG8ExecutionEnvelope } from "./orchestration-boundary";
import { dispatchGenesisG8ExecutionEnvelope, type GenesisG8PrivateWorkflowContext } from "./production-dispatch";

export const GENESIS_G8_REPLAN_WORKER_VERSION = "G8.1-R10-REPLAN-1.0" as const;

export type GenesisG8ReplanOutcome =
  | "READY"
  | "DISPATCHED"
  | "HUMAN_REVIEW"
  | "FULL_DISCOVERY"
  | "NON_BLOCKING_STALLED"
  | "BLOCKING_STALLED"
  | "ALREADY_PROCESSED"
  | "FAILED_RETRYABLE"
  | "FAILED_FINAL";

type ReplanJob = {
  id: string;
  source_repair_id: string;
  source_dispatch_key: string;
  entity_id: string;
  entity_type: string;
  blocking_mode: "NON_BLOCKING" | "BLOCKING_BEFORE_USE";
  evidence_found: boolean;
  organisation_id: string | null;
  campaign_id: string | null;
  company_id: string | null;
  requested_by_user_id: string | null;
  attempt_count: number;
  lease_token: string;
};

export interface GenesisG8ReplanReceipt {
  replanId: string;
  entityId: string;
  outcome: GenesisG8ReplanOutcome;
  eligibilityStatus?: string;
  planAction?: GenesisG8DualChannelPlan["action"];
  stateFingerprint?: string;
  dispatchOutcomes?: string[];
  error?: string | null;
}

export interface GenesisG8ReplanWorkerSummary {
  workerVersion: typeof GENESIS_G8_REPLAN_WORKER_VERSION;
  claimed: number;
  completed: number;
  failedRetryable: number;
  failedFinal: number;
  receipts: GenesisG8ReplanReceipt[];
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Fingerprints the material intelligence state, not wall-clock hydration time.
 * A repeated fingerprint means the last repair cycle did not materially move
 * the entity and must not create an unbounded research loop.
 */
export function fingerprintGenesisG8ReplanState(input: {
  truthIndex: number;
  confidence: number;
  coverage: number;
  eligibilityStatus: string;
  gaps: Array<{ claimKey: string; reason: string; confidence: number; evidenceCount: number; freshestEvidenceAt: string | null }>;
}): string {
  const payload = JSON.stringify({
    truthIndex: round2(input.truthIndex),
    confidence: round2(input.confidence),
    coverage: round2(input.coverage),
    eligibilityStatus: input.eligibilityStatus,
    gaps: [...input.gaps]
      .map((gap) => ({
        claimKey: gap.claimKey,
        reason: gap.reason,
        confidence: round2(gap.confidence),
        evidenceCount: gap.evidenceCount,
        freshestEvidenceAt: gap.freshestEvidenceAt,
      }))
      .sort((a, b) => a.claimKey.localeCompare(b.claimKey) || a.reason.localeCompare(b.reason)),
  });
  return createHash("sha256").update(payload).digest("hex").slice(0, 24);
}

function scopeReplanEnvelope(envelope: GenesisG8ExecutionEnvelope, fingerprint: string): GenesisG8ExecutionEnvelope {
  return {
    ...envelope,
    instructions: envelope.instructions.map((instruction) => {
      if (instruction.kind !== "DISCOVERY_REPAIR" && instruction.kind !== "HUMAN_REVIEW") return instruction;
      return { ...instruction, dispatchKey: `${instruction.dispatchKey}:r10:${fingerprint}` };
    }),
  };
}

async function settleReplan(job: ReplanJob, status: "COMPLETED" | "QUEUED" | "FAILED", outcome?: string | null, error?: string | null) {
  await databaseRequest("rpc/settle_genesis_g8_replan", {
    method: "POST",
    body: JSON.stringify({
      p_replan_id: job.id,
      p_lease_token: job.lease_token,
      p_status: status,
      p_outcome: outcome ?? null,
      p_error: error ?? null,
    }),
  });
}

async function registerCycle(job: ReplanJob, fingerprint: string, plan: GenesisG8DualChannelPlan): Promise<boolean> {
  const rows = await databaseRequest<Array<{ created?: boolean }>>("rpc/register_genesis_g8_replan_cycle", {
    method: "POST",
    body: JSON.stringify({
      p_replan_id: job.id,
      p_entity_id: job.entity_id,
      p_state_fingerprint: fingerprint,
      p_eligibility_status: plan.eligibilityStatus,
      p_plan_action: plan.action,
      p_truth_index: plan.truthIndex,
      p_confidence: plan.confidence,
      p_coverage: plan.coverage,
    }),
  });
  return rows?.[0]?.created !== false;
}

function requiresAnotherExactRepair(plan: GenesisG8DualChannelPlan): boolean {
  return plan.action === "REFRESH_BEFORE_USE" || plan.action === "USE_KNOWLEDGE_AND_REPAIR";
}

function workflowFor(job: ReplanJob): GenesisG8PrivateWorkflowContext {
  return {
    organisationId: job.organisation_id,
    campaignId: job.campaign_id,
    companyId: job.company_id,
    requestedByUserId: job.requested_by_user_id,
  };
}

function humanEscalationPlan(plan: GenesisG8DualChannelPlan): GenesisG8DualChannelPlan {
  return {
    ...plan,
    action: "ROUTE_TO_HUMAN_REVIEW",
    disposition: "HUMAN_REVIEW",
    primaryChannel: "HUMAN_REVIEW",
    secondaryChannel: null,
    mayUseKnowledgeImmediately: false,
    requiresDiscovery: false,
    requiresHumanReview: true,
  };
}

async function processReplan(job: ReplanJob): Promise<GenesisG8ReplanReceipt> {
  try {
    const retrieval = await retrieveGenesisG8KnowledgeById(job.entity_id, { persistTruthIfChanged: true });
    if (!retrieval) throw new Error("GENESIS_G8_ENTITY_NOT_FOUND");

    let plan = planGenesisG8DualChannelWork(retrieval.eligibility);
    const fingerprint = fingerprintGenesisG8ReplanState({
      truthIndex: retrieval.eligibility.truthIndex,
      confidence: retrieval.eligibility.confidence,
      coverage: retrieval.eligibility.coverage,
      eligibilityStatus: retrieval.eligibility.status,
      gaps: retrieval.hydrated.gaps,
    });
    const cycleCreated = await registerCycle(job, fingerprint, plan);

    // If research returned nothing useful, never spend another exact-repair call
    // on blocking intelligence. Escalate it to the founder. Non-blocking gaps can
    // remain visible while otherwise-usable Knowledge continues to serve.
    if (!job.evidence_found && requiresAnotherExactRepair(plan)) {
      if (job.blocking_mode === "BLOCKING_BEFORE_USE") {
        plan = humanEscalationPlan(plan);
      } else {
        await settleReplan(job, "COMPLETED", "NON_BLOCKING_STALLED", "NO_VERIFIABLE_EVIDENCE_FOUND");
        return {
          replanId: job.id,
          entityId: job.entity_id,
          outcome: "NON_BLOCKING_STALLED",
          eligibilityStatus: retrieval.eligibility.status,
          planAction: plan.action,
          stateFingerprint: fingerprint,
        };
      }
    } else if (!cycleCreated && requiresAnotherExactRepair(plan)) {
      if (job.blocking_mode === "BLOCKING_BEFORE_USE") {
        plan = humanEscalationPlan(plan);
      } else {
        await settleReplan(job, "COMPLETED", "NON_BLOCKING_STALLED", "UNCHANGED_INTELLIGENCE_STATE");
        return {
          replanId: job.id,
          entityId: job.entity_id,
          outcome: "NON_BLOCKING_STALLED",
          eligibilityStatus: retrieval.eligibility.status,
          planAction: plan.action,
          stateFingerprint: fingerprint,
        };
      }
    } else if (!cycleCreated) {
      await settleReplan(job, "COMPLETED", "ALREADY_PROCESSED", "UNCHANGED_INTELLIGENCE_STATE");
      return {
        replanId: job.id,
        entityId: job.entity_id,
        outcome: "ALREADY_PROCESSED",
        eligibilityStatus: retrieval.eligibility.status,
        planAction: plan.action,
        stateFingerprint: fingerprint,
      };
    }

    const envelope = scopeReplanEnvelope(buildGenesisG8ExecutionEnvelope(plan, {
      entityId: retrieval.hydrated.entity.id,
      entityType: retrieval.hydrated.entity.entityType,
      canonicalKey: retrieval.hydrated.entity.canonicalKey,
      workflowRef: `g8-r10-replan:${job.id}`,
    }), fingerprint);
    const dispatched = await dispatchGenesisG8ExecutionEnvelope(envelope, workflowFor(job));
    const dispatchOutcomes = dispatched.receipts.map((receipt) => receipt.outcome);

    let outcome: GenesisG8ReplanOutcome = "DISPATCHED";
    if (plan.action === "USE_KNOWLEDGE") outcome = "READY";
    else if (plan.action === "ROUTE_TO_HUMAN_REVIEW") outcome = cycleCreated ? "HUMAN_REVIEW" : "BLOCKING_STALLED";
    else if (plan.action === "RUN_FULL_DISCOVERY") outcome = "FULL_DISCOVERY";

    await settleReplan(job, "COMPLETED", outcome, null);
    return {
      replanId: job.id,
      entityId: job.entity_id,
      outcome,
      eligibilityStatus: retrieval.eligibility.status,
      planAction: plan.action,
      stateFingerprint: fingerprint,
      dispatchOutcomes,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error ?? "GENESIS_G8_REPLAN_FAILED");
    const retryable = job.attempt_count < 4 && !/ENTITY_NOT_FOUND|INVALID_/.test(message);
    await settleReplan(job, retryable ? "QUEUED" : "FAILED", retryable ? "FAILED_RETRYABLE" : "FAILED_FINAL", message);
    return {
      replanId: job.id,
      entityId: job.entity_id,
      outcome: retryable ? "FAILED_RETRYABLE" : "FAILED_FINAL",
      error: message,
    };
  }
}

/**
 * Durable completion/replanning consumer. Repair completion enqueues these jobs;
 * this worker owns only re-evaluation and dispatch, never research itself.
 */
export async function runGenesisG8RepairReplanWorker(limit = 4): Promise<GenesisG8ReplanWorkerSummary> {
  const workerId = `g8-replan:${process.env.VERCEL_REGION ?? "local"}:${randomUUID()}`;
  const jobs = await databaseRequest<ReplanJob[]>("rpc/claim_genesis_g8_replans", {
    method: "POST",
    body: JSON.stringify({ p_limit: Math.max(1, Math.min(8, Math.trunc(limit))), p_worker_id: workerId, p_lease_seconds: 45 }),
  });
  const receipts = await Promise.all(jobs.map(processReplan));
  return {
    workerVersion: GENESIS_G8_REPLAN_WORKER_VERSION,
    claimed: jobs.length,
    completed: receipts.filter((receipt) => !receipt.outcome.startsWith("FAILED")).length,
    failedRetryable: receipts.filter((receipt) => receipt.outcome === "FAILED_RETRYABLE").length,
    failedFinal: receipts.filter((receipt) => receipt.outcome === "FAILED_FINAL").length,
    receipts,
  };
}
