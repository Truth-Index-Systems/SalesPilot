import type { GenesisG8DualChannelPlan } from "./planning";
import type { GenesisG8GapRepairContract } from "./gap-repair";
import type { TruthEntityType } from "./truth/types";

export const GENESIS_G8_ORCHESTRATION_BOUNDARY_VERSION = "G8.1-R7-ORCHESTRATION-1.0" as const;

export type GenesisG8ExecutionKind =
  | "KNOWLEDGE_RESULT"
  | "DISCOVERY_REPAIR"
  | "DISCOVERY_FULL"
  | "HUMAN_REVIEW";

export type GenesisG8ExecutionBlockingMode =
  | "NON_BLOCKING"
  | "BLOCKING_BEFORE_USE";

export interface GenesisG8OrchestrationContext {
  entityId: string;
  entityType: TruthEntityType;
  canonicalKey?: string | null;
  /**
   * Opaque workflow/campaign correlation only. It must never be persisted into
   * shared Knowledge Intelligence as customer-private intelligence.
   */
  workflowRef?: string | null;
}

export interface GenesisG8KnowledgeExecutionInstruction {
  kind: "KNOWLEDGE_RESULT";
  dispatchKey: string;
  entityId: string;
  entityType: TruthEntityType;
  blockingMode: "NON_BLOCKING";
  truthIndex: number;
  confidence: number;
  coverage: number;
}

export interface GenesisG8DiscoveryRepairInstruction {
  kind: "DISCOVERY_REPAIR";
  dispatchKey: string;
  entityId: string;
  entityType: TruthEntityType;
  blockingMode: GenesisG8ExecutionBlockingMode;
  claimId: string;
  claimKey: string;
  repairMode: GenesisG8GapRepairContract["mode"];
  objective: string;
  criticality: GenesisG8GapRepairContract["criticality"];
  minimumEvidence: number;
  additionalEvidenceNeeded: number;
  /**
   * Execution target is deliberately descriptive. R7 does not import or invoke
   * frozen workers; a later adapter maps this instruction to existing workers.
   */
  executionTarget: "EXISTING_DISCOVERY_INTELLIGENCE";
}

export interface GenesisG8FullDiscoveryInstruction {
  kind: "DISCOVERY_FULL";
  dispatchKey: string;
  entityId: string;
  entityType: TruthEntityType;
  blockingMode: "BLOCKING_BEFORE_USE";
  executionTarget: "EXISTING_DISCOVERY_INTELLIGENCE";
  reason: "DISCOVERY_ONLY_STRATEGY" | "KNOWLEDGE_NOT_USABLE";
}

export interface GenesisG8HumanReviewInstruction {
  kind: "HUMAN_REVIEW";
  dispatchKey: string;
  entityId: string;
  entityType: TruthEntityType;
  blockingMode: "BLOCKING_BEFORE_USE";
  truthIndex: number;
  confidence: number;
  coverage: number;
  reasons: string[];
  claimKeys: string[];
  executionTarget: "FOUNDER_REVIEW_QUEUE";
}

export type GenesisG8ExecutionInstruction =
  | GenesisG8KnowledgeExecutionInstruction
  | GenesisG8DiscoveryRepairInstruction
  | GenesisG8FullDiscoveryInstruction
  | GenesisG8HumanReviewInstruction;

export interface GenesisG8ExecutionEnvelope {
  boundaryVersion: typeof GENESIS_G8_ORCHESTRATION_BOUNDARY_VERSION;
  planAction: GenesisG8DualChannelPlan["action"];
  planDisposition: GenesisG8DualChannelPlan["disposition"];
  strategy: GenesisG8DualChannelPlan["strategy"];
  context: GenesisG8OrchestrationContext;
  instructions: GenesisG8ExecutionInstruction[];
  requiresBlockingWork: boolean;
  mayUseKnowledgeImmediately: boolean;
  createdAt: string;
}

function safeKeyPart(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9._:-]+/g, "-").replace(/^-+|-+$/g, "");
}

function dispatchKey(
  context: GenesisG8OrchestrationContext,
  kind: GenesisG8ExecutionKind,
  suffix: string,
): string {
  return [
    "g8r7",
    safeKeyPart(context.entityType),
    safeKeyPart(context.entityId),
    safeKeyPart(kind),
    safeKeyPart(suffix),
  ].join(":");
}

function knowledgeInstruction(
  plan: GenesisG8DualChannelPlan,
  context: GenesisG8OrchestrationContext,
): GenesisG8KnowledgeExecutionInstruction {
  return {
    kind: "KNOWLEDGE_RESULT",
    dispatchKey: dispatchKey(context, "KNOWLEDGE_RESULT", "current"),
    entityId: context.entityId,
    entityType: context.entityType,
    blockingMode: "NON_BLOCKING",
    truthIndex: plan.truthIndex,
    confidence: plan.confidence,
    coverage: plan.coverage,
  };
}

function repairInstruction(
  repair: GenesisG8GapRepairContract,
  context: GenesisG8OrchestrationContext,
  blockingMode: GenesisG8ExecutionBlockingMode,
): GenesisG8DiscoveryRepairInstruction {
  return {
    kind: "DISCOVERY_REPAIR",
    dispatchKey: dispatchKey(context, "DISCOVERY_REPAIR", `${repair.claimKey}:${repair.mode}`),
    entityId: context.entityId,
    entityType: context.entityType,
    blockingMode,
    claimId: repair.claimId,
    claimKey: repair.claimKey,
    repairMode: repair.mode,
    objective: repair.objective,
    criticality: repair.criticality,
    minimumEvidence: repair.minimumEvidence,
    additionalEvidenceNeeded: repair.additionalEvidenceNeeded,
    executionTarget: "EXISTING_DISCOVERY_INTELLIGENCE",
  };
}

function uniqueDiscoveryRepairs(
  repairs: GenesisG8GapRepairContract[],
  context: GenesisG8OrchestrationContext,
  blockingMode: GenesisG8ExecutionBlockingMode,
): GenesisG8DiscoveryRepairInstruction[] {
  const seen = new Set<string>();
  const result: GenesisG8DiscoveryRepairInstruction[] = [];
  for (const repair of repairs) {
    if (repair.disposition !== "DISCOVERY_INTELLIGENCE") continue;
    const key = `${repair.claimKey}:${repair.mode}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(repairInstruction(repair, context, blockingMode));
  }
  return result;
}

function humanReviewInstruction(
  plan: GenesisG8DualChannelPlan,
  context: GenesisG8OrchestrationContext,
): GenesisG8HumanReviewInstruction {
  const claimKeys = Array.from(new Set(
    plan.repairContracts
      .filter((repair) => repair.disposition === "HUMAN_REVIEW")
      .map((repair) => repair.claimKey),
  )).sort();

  return {
    kind: "HUMAN_REVIEW",
    dispatchKey: dispatchKey(context, "HUMAN_REVIEW", claimKeys.join(",") || "entity"),
    entityId: context.entityId,
    entityType: context.entityType,
    blockingMode: "BLOCKING_BEFORE_USE",
    truthIndex: plan.truthIndex,
    confidence: plan.confidence,
    coverage: plan.coverage,
    reasons: [...plan.eligibilityReasons],
    claimKeys,
    executionTarget: "FOUNDER_REVIEW_QUEUE",
  };
}

/**
 * Converts an R6 deterministic dual-channel plan into an execution boundary.
 *
 * R7 deliberately does not invoke AI, network calls, persistence services, queues, or the
 * frozen Discovery pipeline. It creates idempotent instructions that a later
 * production adapter can dispatch to those existing executors.
 */
export function buildGenesisG8ExecutionEnvelope(
  plan: GenesisG8DualChannelPlan,
  context: GenesisG8OrchestrationContext,
  options: { now?: Date } = {},
): GenesisG8ExecutionEnvelope {
  const now = options.now ?? new Date();
  const instructions: GenesisG8ExecutionInstruction[] = [];

  switch (plan.action) {
    case "USE_KNOWLEDGE":
      instructions.push(knowledgeInstruction(plan, context));
      break;

    case "USE_KNOWLEDGE_AND_REPAIR":
      instructions.push(knowledgeInstruction(plan, context));
      instructions.push(...uniqueDiscoveryRepairs(plan.repairContracts, context, "NON_BLOCKING"));
      break;

    case "REFRESH_BEFORE_USE":
      instructions.push(...uniqueDiscoveryRepairs(plan.repairContracts, context, "BLOCKING_BEFORE_USE"));
      break;

    case "ROUTE_TO_HUMAN_REVIEW":
      instructions.push(humanReviewInstruction(plan, context));
      break;

    case "RUN_FULL_DISCOVERY":
      instructions.push({
        kind: "DISCOVERY_FULL",
        dispatchKey: dispatchKey(context, "DISCOVERY_FULL", "full"),
        entityId: context.entityId,
        entityType: context.entityType,
        blockingMode: "BLOCKING_BEFORE_USE",
        executionTarget: "EXISTING_DISCOVERY_INTELLIGENCE",
        reason: plan.strategy === "DISCOVERY_ONLY"
          ? "DISCOVERY_ONLY_STRATEGY"
          : "KNOWLEDGE_NOT_USABLE",
      });
      break;
  }

  return {
    boundaryVersion: GENESIS_G8_ORCHESTRATION_BOUNDARY_VERSION,
    planAction: plan.action,
    planDisposition: plan.disposition,
    strategy: plan.strategy,
    context,
    instructions,
    requiresBlockingWork: instructions.some((instruction) => instruction.blockingMode === "BLOCKING_BEFORE_USE"),
    mayUseKnowledgeImmediately: plan.mayUseKnowledgeImmediately,
    createdAt: now.toISOString(),
  };
}

export function validateGenesisG8ExecutionEnvelope(envelope: GenesisG8ExecutionEnvelope): string[] {
  const errors: string[] = [];
  const keys = new Set<string>();

  for (const instruction of envelope.instructions) {
    if (!instruction.dispatchKey) errors.push("instruction missing dispatchKey");
    if (keys.has(instruction.dispatchKey)) errors.push(`duplicate dispatchKey:${instruction.dispatchKey}`);
    keys.add(instruction.dispatchKey);
  }

  if (envelope.planAction === "USE_KNOWLEDGE" &&
      envelope.instructions.some((instruction) => instruction.kind !== "KNOWLEDGE_RESULT")) {
    errors.push("USE_KNOWLEDGE must not dispatch Discovery or review work");
  }

  if (envelope.planAction === "USE_KNOWLEDGE_AND_REPAIR" &&
      !envelope.instructions.some((instruction) => instruction.kind === "KNOWLEDGE_RESULT")) {
    errors.push("USE_KNOWLEDGE_AND_REPAIR must retain the immediate Knowledge result");
  }

  if (envelope.planAction === "REFRESH_BEFORE_USE" &&
      envelope.instructions.some((instruction) => instruction.kind === "KNOWLEDGE_RESULT")) {
    errors.push("REFRESH_BEFORE_USE must not expose Knowledge before blocking refresh");
  }

  if (envelope.planAction === "ROUTE_TO_HUMAN_REVIEW" &&
      envelope.instructions.some((instruction) => instruction.kind !== "HUMAN_REVIEW")) {
    errors.push("ROUTE_TO_HUMAN_REVIEW must stop at the human-review boundary");
  }

  if (envelope.planAction === "RUN_FULL_DISCOVERY" &&
      (envelope.instructions.length !== 1 || envelope.instructions[0]?.kind !== "DISCOVERY_FULL")) {
    errors.push("RUN_FULL_DISCOVERY must create exactly one full-Discovery instruction");
  }

  return errors;
}
