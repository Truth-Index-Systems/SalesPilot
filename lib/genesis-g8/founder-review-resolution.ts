import "server-only";

import { databaseRequest } from "@/lib/database/postgrest";
import { retrieveGenesisG8KnowledgeById } from "./knowledge-retrieval";
import { createGenesisG8GapRepairContracts } from "./gap-repair";
import { dispatchGenesisG8ExecutionEnvelope, type GenesisG8PrivateWorkflowContext } from "./production-dispatch";
import { buildGenesisG8ExecutionEnvelope, type GenesisG8ExecutionEnvelope, type GenesisG8DiscoveryRepairInstruction } from "./orchestration-boundary";
import { planGenesisG8DualChannelWork } from "./planning";
import type { GenesisG8EntityType as TruthEntityType } from "./entity-types";
import type { GenesisG8HumanReviewAction } from "./persistence/types";

export const GENESIS_G8_FOUNDER_REVIEW_VERSION = "G8.1-R11-FOUNDER-REVIEW-1.0" as const;

export type GenesisG8FounderResolutionOutcome =
  | "APPROVED"
  | "REJECTED"
  | "RESEARCH_QUEUED"
  | "CORRECTION_RESEARCH_QUEUED"
  | "ALREADY_RESOLVED";

export interface GenesisG8FounderReviewResolutionInput {
  reviewTaskId: string;
  action: GenesisG8HumanReviewAction;
  reasonCode?: string | null;
  note?: string | null;
  correction?: Record<string, unknown> | null;
}

export interface GenesisG8FounderReviewResolutionResult {
  version: typeof GENESIS_G8_FOUNDER_REVIEW_VERSION;
  reviewTaskId: string;
  entityId: string;
  action: GenesisG8HumanReviewAction;
  outcome: GenesisG8FounderResolutionOutcome;
  receiptId?: string | null;
  repairDispatches: string[];
}

type ResolveRow = {
  review_task_id: string;
  entity_id: string;
  entity_type: string;
  action: GenesisG8HumanReviewAction;
  receipt_id: string | null;
  created: boolean;
  claim_keys_json: unknown;
  reasons_json: unknown;
};

type ReviewTaskRow = {
  id: string;
  dispatch_key: string;
  entity_id: string;
  entity_type: string;
  status: string;
  claim_keys_json: unknown;
  requested_by_user_id: string | null;
};

type DispatchContextRow = {
  organisation_id: string | null;
  campaign_id: string | null;
  company_id: string | null;
};

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

async function taskContext(reviewTaskId: string): Promise<{ task: ReviewTaskRow; workflow: GenesisG8PrivateWorkflowContext }> {
  const tasks = await databaseRequest<ReviewTaskRow[]>(`genesis_g8_founder_review_queue?select=id,dispatch_key,entity_id,entity_type,status,claim_keys_json,requested_by_user_id&id=eq.${encodeURIComponent(reviewTaskId)}&limit=1`);
  const task = tasks[0];
  if (!task) throw new Error("GENESIS_G8_REVIEW_TASK_NOT_FOUND");
  const dispatches = await databaseRequest<DispatchContextRow[]>(`genesis_g8_production_dispatches?select=organisation_id,campaign_id,company_id&dispatch_key=eq.${encodeURIComponent(task.dispatch_key)}&limit=1`);
  const context = dispatches[0];
  return {
    task,
    workflow: {
      organisationId: context?.organisation_id ?? null,
      campaignId: context?.campaign_id ?? null,
      companyId: context?.company_id ?? null,
      requestedByUserId: task.requested_by_user_id ?? null,
    },
  };
}

function founderResearchEnvelope(input: {
  reviewTaskId: string;
  entityId: string;
  entityType: TruthEntityType;
  truthIndex: number;
  confidence: number;
  coverage: number;
  claimKeys: string[];
  gaps: any[];
  note?: string | null;
}): GenesisG8ExecutionEnvelope {
  const selected = input.claimKeys.length
    ? input.gaps.filter((gap) => input.claimKeys.includes(gap.claimKey))
    : input.gaps;
  const repairs = createGenesisG8GapRepairContracts(selected.length ? selected : input.gaps)
    .slice(0, 6);
  const instructions: GenesisG8DiscoveryRepairInstruction[] = repairs.map((repair) => {
    const scope = `${input.reviewTaskId}:${repair.claimKey}:${repair.mode}`
      .toLowerCase()
      .replace(/[^a-z0-9._:-]+/g, "-")
      .slice(0, 120);
    return {
      kind: "DISCOVERY_REPAIR",
      dispatchKey: `g8:founder:${input.entityId}:${scope}`,
      entityId: input.entityId,
      entityType: input.entityType,
      blockingMode: repair.disposition === "HUMAN_REVIEW" ? "BLOCKING_BEFORE_USE" : "NON_BLOCKING",
      claimId: repair.claimId,
      claimKey: repair.claimKey,
      repairMode: repair.mode,
      objective: input.note ? `${repair.objective} Founder context: ${input.note}` : repair.objective,
      impactClass: repair.impactClass,
      minimumEvidence: repair.minimumEvidence,
      additionalEvidenceNeeded: repair.additionalEvidenceNeeded,
      executionTarget: "EXISTING_DISCOVERY_INTELLIGENCE",
    };
  });
  return {
    boundaryVersion: "G8.1-R7-ORCHESTRATION-1.0",
    planAction: "REFRESH_BEFORE_USE",
    planDisposition: "DISCOVERY_REFRESH",
    strategy: "KNOWLEDGE_FIRST_WITH_DISCOVERY_FALLBACK",
    context: { entityId: input.entityId, entityType: input.entityType, workflowRef: `g8-r11-founder-review:${input.reviewTaskId}` },
    instructions,
    requiresBlockingWork: instructions.some((instruction) => instruction.blockingMode === "BLOCKING_BEFORE_USE"),
    mayUseKnowledgeImmediately: false,
    createdAt: new Date().toISOString(),
  };
}


function scopeFounderEnvelope(envelope: GenesisG8ExecutionEnvelope, reviewTaskId: string): GenesisG8ExecutionEnvelope {
  return {
    ...envelope,
    context: { ...envelope.context, workflowRef: `g8-r11-founder-review:${reviewTaskId}` },
    instructions: envelope.instructions.map((instruction) => ({
      ...instruction,
      dispatchKey: `${instruction.dispatchKey}:r11:${reviewTaskId}`,
    })),
  };
}

/**
 * Resolves founder judgement without ever editing historical Truth snapshots.
 * APPROVE changes eligibility authority only. REJECT suppresses active use only.
 * CORRECT/MORE_RESEARCH turn the founder decision into exact evidence work so the
 * correction must still earn mathematical confidence from independently sourced evidence.
 */
export async function resolveGenesisG8FounderReview(input: GenesisG8FounderReviewResolutionInput): Promise<GenesisG8FounderReviewResolutionResult> {
  const before = await taskContext(input.reviewTaskId);
  const rows = await databaseRequest<ResolveRow[]>("rpc/resolve_genesis_g8_founder_review", {
    method: "POST",
    body: JSON.stringify({
      p_review_task_id: input.reviewTaskId,
      p_action: input.action,
      p_reason_code: input.reasonCode ?? null,
      p_note: input.note ?? null,
      p_correction: input.correction ?? null,
      p_resolution_actor: "FOUNDER_DASHBOARD",
    }),
  });
  const resolved = rows[0];
  if (!resolved) throw new Error("GENESIS_G8_REVIEW_RESOLUTION_EMPTY");
  if (!resolved.created) {
    return { version: GENESIS_G8_FOUNDER_REVIEW_VERSION, reviewTaskId: resolved.review_task_id, entityId: resolved.entity_id, action: resolved.action, outcome: "ALREADY_RESOLVED", receiptId: resolved.receipt_id, repairDispatches: [] };
  }

  if (input.action === "REJECT") {
    return { version: GENESIS_G8_FOUNDER_REVIEW_VERSION, reviewTaskId: resolved.review_task_id, entityId: resolved.entity_id, action: input.action, outcome: "REJECTED", receiptId: resolved.receipt_id, repairDispatches: [] };
  }

  if (input.action === "APPROVE") {
    // The founder decision is already durably resolved above. Follow-up background
    // repair is best-effort: a dispatch fault must never make a successful human
    // approval appear to have failed or tempt the founder to click twice.
    try {
      const retrieval = await retrieveGenesisG8KnowledgeById(resolved.entity_id, { persistTruthIfChanged: true });
      if (!retrieval) throw new Error("GENESIS_G8_ENTITY_NOT_FOUND");
      const plan = planGenesisG8DualChannelWork(retrieval.eligibility);
      const envelope = scopeFounderEnvelope(buildGenesisG8ExecutionEnvelope(plan, {
        entityId: retrieval.hydrated.entity.id, entityType: retrieval.hydrated.entity.entityType, canonicalKey: retrieval.hydrated.entity.canonicalKey,
        workflowRef: `g8-r11-founder-review:${resolved.review_task_id}`,
      }), resolved.review_task_id);
      const dispatched = await dispatchGenesisG8ExecutionEnvelope(envelope, before.workflow);
      return { version: GENESIS_G8_FOUNDER_REVIEW_VERSION, reviewTaskId: resolved.review_task_id, entityId: resolved.entity_id, action: input.action, outcome: "APPROVED", receiptId: resolved.receipt_id, repairDispatches: dispatched.receipts.filter((receipt) => receipt.kind === "DISCOVERY_REPAIR").map((receipt) => receipt.dispatchKey) };
    } catch (error) {
      console.warn("Genesis founder approval follow-up repair unavailable", error instanceof Error ? error.message : "unknown");
      return { version: GENESIS_G8_FOUNDER_REVIEW_VERSION, reviewTaskId: resolved.review_task_id, entityId: resolved.entity_id, action: input.action, outcome: "APPROVED", receiptId: resolved.receipt_id, repairDispatches: [] };
    }
  }

  try {
    const retrieval = await retrieveGenesisG8KnowledgeById(resolved.entity_id, { persistTruthIfChanged: true });
    if (!retrieval) throw new Error("GENESIS_G8_ENTITY_NOT_FOUND");
    const claimKeys = stringArray(resolved.claim_keys_json);
    const envelope = founderResearchEnvelope({ reviewTaskId: resolved.review_task_id, entityId: retrieval.hydrated.entity.id, entityType: retrieval.hydrated.entity.entityType, truthIndex: retrieval.eligibility.truthIndex, confidence: retrieval.eligibility.confidence, coverage: retrieval.eligibility.coverage, claimKeys, gaps: retrieval.hydrated.gaps, note: input.note ?? null });
    const dispatched = envelope.instructions.length ? await dispatchGenesisG8ExecutionEnvelope(envelope, before.workflow) : { receipts: [] as Array<{ dispatchKey: string }> };
    return { version: GENESIS_G8_FOUNDER_REVIEW_VERSION, reviewTaskId: resolved.review_task_id, entityId: resolved.entity_id, action: input.action, outcome: input.action === "CORRECT" ? "CORRECTION_RESEARCH_QUEUED" : "RESEARCH_QUEUED", receiptId: resolved.receipt_id, repairDispatches: dispatched.receipts.map((receipt) => receipt.dispatchKey) };
  } catch (error) {
    console.warn("Genesis founder research follow-up unavailable after durable review resolution", error instanceof Error ? error.message : "unknown");
    return { version: GENESIS_G8_FOUNDER_REVIEW_VERSION, reviewTaskId: resolved.review_task_id, entityId: resolved.entity_id, action: input.action, outcome: input.action === "CORRECT" ? "CORRECTION_RESEARCH_QUEUED" : "RESEARCH_QUEUED", receiptId: resolved.receipt_id, repairDispatches: [] };
  }
}
