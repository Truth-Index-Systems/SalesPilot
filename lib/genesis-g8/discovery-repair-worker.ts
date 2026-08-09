import "server-only";

import { randomUUID } from "node:crypto";
import { databaseRequest } from "@/lib/database/postgrest";
import { isAiGovernanceDeferred, aiParallelCapacityReason } from "@/lib/ai/governance";
import { isOpenAIBackgroundPending } from "@/lib/ai/background-response";
import { insertGenesisG8Evidence } from "./persistence/repository";
import { readGenesisG8KnowledgeBundle } from "./persistence/read-repository";
import { hydrateGenesisG8EntityTruth } from "./hydration";
import { researchGenesisG8ClaimRepairV2 } from "./discovery-repair-openai-v2";
import { persistMrTi2EvidenceAssessment, persistMrTi2RelationshipHints } from "./truth-v2/ai";
import { calculateAndPersistMrTi2Shadow } from "./truth-v2/shadow-hydration";
import type { ClaimCriticality, TruthEntityType } from "./truth";

export const GENESIS_G8_DISCOVERY_REPAIR_WORKER_VERSION = "G8.1-R9-REPAIR-WORKER-1.0" as const;

type RepairJob = {
  id: string;
  dispatch_key: string;
  entity_id: string;
  entity_type: TruthEntityType;
  entity_canonical_key: string;
  entity_display_name: string | null;
  claim_id: string;
  claim_key: string;
  claim_label: string;
  criticality: ClaimCriticality;
  repair_mode: string;
  objective: string;
  minimum_evidence: number;
  additional_evidence_needed: number;
  blocking_mode: "NON_BLOCKING" | "BLOCKING_BEFORE_USE";
  organisation_id: string | null;
  campaign_id: string | null;
  company_id: string | null;
  attempt_count: number;
  lease_token: string;
};

export type GenesisG8RepairWorkerOutcome = "COMPLETED" | "PENDING" | "DEFERRED" | "FAILED_RETRYABLE" | "FAILED_FINAL";

export interface GenesisG8RepairWorkerReceipt {
  repairId: string;
  entityId: string;
  claimKey: string;
  outcome: GenesisG8RepairWorkerOutcome;
  evidenceInserted: number;
  truthIndex?: number;
  reviewRequired?: boolean;
  error?: string | null;
}

export interface GenesisG8RepairWorkerSummary {
  workerVersion: typeof GENESIS_G8_DISCOVERY_REPAIR_WORKER_VERSION;
  claimed: number;
  completed: number;
  pending: number;
  deferred: number;
  failedRetryable: number;
  failedFinal: number;
  receipts: GenesisG8RepairWorkerReceipt[];
}

function sourceFamily(sourceUrl: string): string {
  try {
    return new URL(sourceUrl).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "unknown";
  }
}

async function settleRepair(job: RepairJob, status: "COMPLETED" | "QUEUED" | "FAILED", error?: string | null) {
  await databaseRequest("rpc/settle_genesis_g8_discovery_repair", {
    method: "POST",
    body: JSON.stringify({
      p_repair_id: job.id,
      p_lease_token: job.lease_token,
      p_status: status,
      p_error: error ?? null,
    }),
  });
}

async function runRepair(job: RepairJob): Promise<GenesisG8RepairWorkerReceipt> {
  try {
    const result = await researchGenesisG8ClaimRepairV2({
      repairId: job.id,
      entityId: job.entity_id,
      entityType: job.entity_type,
      entityCanonicalKey: job.entity_canonical_key,
      entityDisplayName: job.entity_display_name,
      claimId: job.claim_id,
      claimKey: job.claim_key,
      claimLabel: job.claim_label,
      objective: job.objective,
      repairMode: job.repair_mode,
      organisationId: job.organisation_id,
      campaignId: job.campaign_id,
    });

    const existingBundle = await readGenesisG8KnowledgeBundle(job.entity_id);
    const familyCounts = new Map<string, number>();
    for (const existing of existingBundle?.evidence ?? []) {
      if (existing.claimId !== job.claim_id || !existing.sourceFamily) continue;
      familyCounts.set(existing.sourceFamily, (familyCounts.get(existing.sourceFamily) ?? 0) + 1);
    }
    let evidenceInserted = 0;
    for (const evidence of result.observations) {
      const family = sourceFamily(evidence.sourceUrl);
      const seen = familyCounts.get(family) ?? 0;
      familyCounts.set(family, seen + 1);
      const insertedEvidence = await insertGenesisG8Evidence({
        claimId: job.claim_id,
        direction: evidence.direction === "SUPPORT" ? "SUPPORTS" : "CONTRADICTS",
        sourceClass: evidence.sourceClass,
        sourceUri: evidence.sourceUrl,
        sourceRef: evidence.sourceTitle,
        sourceFamily: family,
        excerpt: evidence.evidenceText,
        strength: evidence.directness,
        traceability: evidence.traceability,
        independence: seen === 0 ? 1 : 0.25,
        observedAt: evidence.observedAt,
        channel: "DISCOVERY_INTELLIGENCE",
        provenance: {
          channel: "DISCOVERY_INTELLIGENCE",
          discoveredAt: new Date().toISOString(),
          sourceRef: `g8-repair:${job.id}`,
        },
      });
      await persistMrTi2EvidenceAssessment({ evidenceId: insertedEvidence.id, observation: evidence });
      await persistMrTi2RelationshipHints({
        entityId: job.entity_id,
        fromClaimId: job.claim_id,
        claims: (existingBundle?.claims ?? []).map((claim) => ({ id: claim.id, claimKey: claim.claimKey })),
        observation: evidence,
      });
      evidenceInserted += 1;
    }

    const mrTi2Shadow = await calculateAndPersistMrTi2Shadow(job.entity_id).catch((error) => {
      console.warn("MR-TI-2 shadow calculation unavailable", error instanceof Error ? error.message : "unknown");
      return null;
    });
    const hydrated = await hydrateGenesisG8EntityTruth(job.entity_id, { persistIfChanged: true });
    await databaseRequest("rpc/complete_genesis_g8_repair_and_enqueue_replan", {
      method: "POST",
      body: JSON.stringify({
        p_repair_id: job.id,
        p_lease_token: job.lease_token,
        p_evidence_found: result.observations.length > 0,
        p_requested_by_user_id: null,
      }),
    });
    return {
      repairId: job.id,
      entityId: job.entity_id,
      claimKey: job.claim_key,
      outcome: "COMPLETED",
      evidenceInserted,
      truthIndex: hydrated?.truth.truthIndex,
      reviewRequired: hydrated?.truth.review.required ?? (mrTi2Shadow?.state.reviewState === "HUMAN_REVIEW_REQUIRED"),
    };
  } catch (error) {
    if (isOpenAIBackgroundPending(error)) {
      await settleRepair(job, "QUEUED", error.message);
      return { repairId: job.id, entityId: job.entity_id, claimKey: job.claim_key, outcome: "PENDING", evidenceInserted: 0, error: error.message };
    }
    if (isAiGovernanceDeferred(error) || aiParallelCapacityReason(error)) {
      const message = error instanceof Error ? error.message : String(error);
      await settleRepair(job, "QUEUED", message);
      return { repairId: job.id, entityId: job.entity_id, claimKey: job.claim_key, outcome: "DEFERRED", evidenceInserted: 0, error: message };
    }

    const message = error instanceof Error ? error.message : String(error ?? "GENESIS_G8_REPAIR_FAILED");
    const retryable = job.attempt_count < 4 && !/NOT_CONFIGURED|INVALID_SCHEMA|CLAIM_ENTITY_MISMATCH|ENTITY_NOT_FOUND/.test(message);
    await settleRepair(job, retryable ? "QUEUED" : "FAILED", message);
    return { repairId: job.id, entityId: job.entity_id, claimKey: job.claim_key, outcome: retryable ? "FAILED_RETRYABLE" : "FAILED_FINAL", evidenceInserted: 0, error: message };
  }
}

/**
 * Consumes exact R8 claim-repair contracts. This worker never widens a repair into
 * company/contact/route discovery and never writes commercial conclusions. It
 * persists only sourced evidence, then lets the deterministic Truth Kernel rehydrate.
 */
export async function runGenesisG8DiscoveryRepairWorker(limit = 2): Promise<GenesisG8RepairWorkerSummary> {
  const workerId = `g8-repair:${process.env.VERCEL_REGION ?? "local"}:${randomUUID()}`;
  const jobs = await databaseRequest<RepairJob[]>("rpc/claim_genesis_g8_discovery_repairs", {
    method: "POST",
    body: JSON.stringify({ p_limit: Math.max(1, Math.min(4, Math.trunc(limit))), p_worker_id: workerId, p_lease_seconds: 75 }),
  });

  const receipts = await Promise.all(jobs.map(runRepair));
  return {
    workerVersion: GENESIS_G8_DISCOVERY_REPAIR_WORKER_VERSION,
    claimed: jobs.length,
    completed: receipts.filter(r => r.outcome === "COMPLETED").length,
    pending: receipts.filter(r => r.outcome === "PENDING").length,
    deferred: receipts.filter(r => r.outcome === "DEFERRED").length,
    failedRetryable: receipts.filter(r => r.outcome === "FAILED_RETRYABLE").length,
    failedFinal: receipts.filter(r => r.outcome === "FAILED_FINAL").length,
    receipts,
  };
}
