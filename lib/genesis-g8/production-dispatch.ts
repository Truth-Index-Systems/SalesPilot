import "server-only";

import { databaseRequest } from "@/lib/database/postgrest";
import type {
  GenesisG8ExecutionEnvelope,
  GenesisG8ExecutionInstruction,
  GenesisG8DiscoveryRepairInstruction,
  GenesisG8FullDiscoveryInstruction,
  GenesisG8HumanReviewInstruction,
  GenesisG8KnowledgeExecutionInstruction,
} from "./orchestration-boundary";

export const GENESIS_G8_PRODUCTION_DISPATCH_VERSION = "G8.1-R8-DISPATCH-1.0" as const;

export interface GenesisG8PrivateWorkflowContext {
  organisationId?: string | null;
  campaignId?: string | null;
  companyId?: string | null;
  requestedByUserId?: string | null;
}

export type GenesisG8DispatchOutcome =
  | "KNOWLEDGE_ACCEPTED"
  | "FULL_DISCOVERY_QUEUED"
  | "REPAIR_QUEUED"
  | "HUMAN_REVIEW_QUEUED"
  | "ALREADY_DISPATCHED"
  | "BLOCKED_MISSING_WORKFLOW";

export interface GenesisG8DispatchReceipt {
  dispatchVersion: typeof GENESIS_G8_PRODUCTION_DISPATCH_VERSION;
  dispatchKey: string;
  kind: GenesisG8ExecutionInstruction["kind"];
  outcome: GenesisG8DispatchOutcome;
  ledgerId?: string | null;
  detail?: string | null;
}

export interface GenesisG8EnvelopeDispatchResult {
  dispatchVersion: typeof GENESIS_G8_PRODUCTION_DISPATCH_VERSION;
  boundaryVersion: GenesisG8ExecutionEnvelope["boundaryVersion"];
  receipts: GenesisG8DispatchReceipt[];
  blockingWorkQueued: boolean;
  mayUseKnowledgeImmediately: boolean;
}

type DbDispatchRow = {
  id?: string;
  status?: string;
  outcome?: string;
  detail?: string | null;
  created?: boolean;
};

function privateWorkflowPayload(workflow: GenesisG8PrivateWorkflowContext) {
  return {
    organisationId: workflow.organisationId ?? null,
    campaignId: workflow.campaignId ?? null,
    companyId: workflow.companyId ?? null,
    requestedByUserId: workflow.requestedByUserId ?? null,
  };
}

async function registerInstruction(
  envelope: GenesisG8ExecutionEnvelope,
  instruction: GenesisG8ExecutionInstruction,
  workflow: GenesisG8PrivateWorkflowContext,
): Promise<DbDispatchRow> {
  const rows = await databaseRequest<DbDispatchRow[]>("rpc/register_genesis_g8_production_dispatch", {
    method: "POST",
    body: JSON.stringify({
      p_dispatch_key: instruction.dispatchKey,
      p_boundary_version: envelope.boundaryVersion,
      p_dispatch_version: GENESIS_G8_PRODUCTION_DISPATCH_VERSION,
      p_entity_id: instruction.entityId,
      p_instruction_kind: instruction.kind,
      p_blocking_mode: instruction.blockingMode,
      p_execution_target: "executionTarget" in instruction ? instruction.executionTarget : "KNOWLEDGE_RESULT",
      p_workflow_ref: envelope.context.workflowRef ?? null,
      p_organisation_id: workflow.organisationId ?? null,
      p_campaign_id: workflow.campaignId ?? null,
      p_company_id: workflow.companyId ?? null,
      p_payload: instruction,
      p_private_workflow: privateWorkflowPayload(workflow),
    }),
  });
  return rows?.[0] ?? {};
}

async function completeDispatch(dispatchKey: string, outcome: GenesisG8DispatchOutcome, detail?: string | null): Promise<void> {
  await databaseRequest("rpc/complete_genesis_g8_production_dispatch", {
    method: "POST",
    body: JSON.stringify({ p_dispatch_key: dispatchKey, p_outcome: outcome, p_detail: detail ?? null }),
  });
}

async function dispatchKnowledge(
  instruction: GenesisG8KnowledgeExecutionInstruction,
  ledger: DbDispatchRow,
): Promise<GenesisG8DispatchReceipt> {
  await completeDispatch(instruction.dispatchKey, "KNOWLEDGE_ACCEPTED", "Existing Knowledge Intelligence is eligible for immediate use.");
  return {
    dispatchVersion: GENESIS_G8_PRODUCTION_DISPATCH_VERSION,
    dispatchKey: instruction.dispatchKey,
    kind: instruction.kind,
    outcome: "KNOWLEDGE_ACCEPTED",
    ledgerId: ledger.id ?? null,
  };
}

async function dispatchRepair(
  instruction: GenesisG8DiscoveryRepairInstruction,
  workflow: GenesisG8PrivateWorkflowContext,
  ledger: DbDispatchRow,
): Promise<GenesisG8DispatchReceipt> {
  // R8 never broadens a claim repair into a full stage rerun. The exact contract is
  // durably queued for the existing Discovery Intelligence worker boundary to claim.
  await databaseRequest("rpc/enqueue_genesis_g8_discovery_repair", {
    method: "POST",
    body: JSON.stringify({
      p_dispatch_key: instruction.dispatchKey,
      p_entity_id: instruction.entityId,
      p_entity_type: instruction.entityType,
      p_claim_id: instruction.claimId,
      p_claim_key: instruction.claimKey,
      p_repair_mode: instruction.repairMode,
      p_objective: instruction.objective,
      p_criticality: instruction.criticality,
      p_minimum_evidence: instruction.minimumEvidence,
      p_additional_evidence_needed: instruction.additionalEvidenceNeeded,
      p_blocking_mode: instruction.blockingMode,
      p_organisation_id: workflow.organisationId ?? null,
      p_campaign_id: workflow.campaignId ?? null,
      p_company_id: workflow.companyId ?? null,
    }),
  });
  await completeDispatch(instruction.dispatchKey, "REPAIR_QUEUED", "Exact claim repair queued for Discovery Intelligence worker consumption.");
  return {
    dispatchVersion: GENESIS_G8_PRODUCTION_DISPATCH_VERSION,
    dispatchKey: instruction.dispatchKey,
    kind: instruction.kind,
    outcome: "REPAIR_QUEUED",
    ledgerId: ledger.id ?? null,
  };
}

async function dispatchFullDiscovery(
  instruction: GenesisG8FullDiscoveryInstruction,
  workflow: GenesisG8PrivateWorkflowContext,
  ledger: DbDispatchRow,
): Promise<GenesisG8DispatchReceipt> {
  if (!workflow.organisationId || !workflow.campaignId) {
    await completeDispatch(instruction.dispatchKey, "BLOCKED_MISSING_WORKFLOW", "Full Discovery requires organisationId and campaignId.");
    return {
      dispatchVersion: GENESIS_G8_PRODUCTION_DISPATCH_VERSION,
      dispatchKey: instruction.dispatchKey,
      kind: instruction.kind,
      outcome: "BLOCKED_MISSING_WORKFLOW",
      ledgerId: ledger.id ?? null,
      detail: "organisationId and campaignId are required",
    };
  }

  await databaseRequest("rpc/queue_genesis_g8_full_discovery_via_existing_session", {
    method: "POST",
    body: JSON.stringify({
      p_dispatch_key: instruction.dispatchKey,
      p_organisation_id: workflow.organisationId,
      p_campaign_id: workflow.campaignId,
    }),
  });
  await completeDispatch(instruction.dispatchKey, "FULL_DISCOVERY_QUEUED", "Existing company Discovery Intelligence session queued/resumed.");
  return {
    dispatchVersion: GENESIS_G8_PRODUCTION_DISPATCH_VERSION,
    dispatchKey: instruction.dispatchKey,
    kind: instruction.kind,
    outcome: "FULL_DISCOVERY_QUEUED",
    ledgerId: ledger.id ?? null,
  };
}

async function dispatchHumanReview(
  instruction: GenesisG8HumanReviewInstruction,
  workflow: GenesisG8PrivateWorkflowContext,
  ledger: DbDispatchRow,
): Promise<GenesisG8DispatchReceipt> {
  await databaseRequest("rpc/enqueue_genesis_g8_founder_review", {
    method: "POST",
    body: JSON.stringify({
      p_dispatch_key: instruction.dispatchKey,
      p_entity_id: instruction.entityId,
      p_entity_type: instruction.entityType,
      p_truth_index: instruction.truthIndex,
      p_confidence: instruction.confidence,
      p_coverage: instruction.coverage,
      p_reasons: instruction.reasons,
      p_claim_keys: instruction.claimKeys,
      p_requested_by_user_id: workflow.requestedByUserId ?? null,
    }),
  });
  await completeDispatch(instruction.dispatchKey, "HUMAN_REVIEW_QUEUED", "Founder review task queued without altering Truth Index.");
  return {
    dispatchVersion: GENESIS_G8_PRODUCTION_DISPATCH_VERSION,
    dispatchKey: instruction.dispatchKey,
    kind: instruction.kind,
    outcome: "HUMAN_REVIEW_QUEUED",
    ledgerId: ledger.id ?? null,
  };
}

async function dispatchInstruction(
  envelope: GenesisG8ExecutionEnvelope,
  instruction: GenesisG8ExecutionInstruction,
  workflow: GenesisG8PrivateWorkflowContext,
): Promise<GenesisG8DispatchReceipt> {
  const ledger = await registerInstruction(envelope, instruction, workflow);
  if (ledger.created === false && ledger.status === "COMPLETED") {
    return {
      dispatchVersion: GENESIS_G8_PRODUCTION_DISPATCH_VERSION,
      dispatchKey: instruction.dispatchKey,
      kind: instruction.kind,
      outcome: "ALREADY_DISPATCHED",
      ledgerId: ledger.id ?? null,
      detail: ledger.detail ?? null,
    };
  }

  switch (instruction.kind) {
    case "KNOWLEDGE_RESULT": return dispatchKnowledge(instruction, ledger);
    case "DISCOVERY_REPAIR": return dispatchRepair(instruction, workflow, ledger);
    case "DISCOVERY_FULL": return dispatchFullDiscovery(instruction, workflow, ledger);
    case "HUMAN_REVIEW": return dispatchHumanReview(instruction, workflow, ledger);
  }
}

/**
 * First production wiring point for Genesis G8.
 *
 * This adapter owns durable/idempotent dispatch only. It does not invoke model providers and
 * does not take ownership away from the existing Discovery Intelligence workers.
 * Full-discovery fallback reuses the authoritative campaign discovery session.
 * Claim-level repair remains exact and is queued for explicit worker consumption.
 */
export async function dispatchGenesisG8ExecutionEnvelope(
  envelope: GenesisG8ExecutionEnvelope,
  workflow: GenesisG8PrivateWorkflowContext = {},
): Promise<GenesisG8EnvelopeDispatchResult> {
  const receipts: GenesisG8DispatchReceipt[] = [];
  for (const instruction of envelope.instructions) {
    receipts.push(await dispatchInstruction(envelope, instruction, workflow));
  }

  return {
    dispatchVersion: GENESIS_G8_PRODUCTION_DISPATCH_VERSION,
    boundaryVersion: envelope.boundaryVersion,
    receipts,
    blockingWorkQueued: receipts.some((receipt) =>
      receipt.outcome === "FULL_DISCOVERY_QUEUED" ||
      receipt.outcome === "REPAIR_QUEUED" ||
      receipt.outcome === "HUMAN_REVIEW_QUEUED" ||
      receipt.outcome === "BLOCKED_MISSING_WORKFLOW"
    ),
    mayUseKnowledgeImmediately: envelope.mayUseKnowledgeImmediately,
  };
}
