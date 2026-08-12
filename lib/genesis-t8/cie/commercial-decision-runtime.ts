import "server-only";
import { databaseRequest } from "@/lib/database/postgrest";
import type { CieR4CommercialDecision } from "./commercial-decision-authority";
import type { ForensicBuild2CommercialRealityProduction } from "./commercial-reality-producer";

export type CieR4PersistenceOutcome = Readonly<{ material_changed: boolean; r6_invalidated: boolean; r7_retired: number }>;

export type CieR4ApplySummary = Readonly<{
  applied: number;
  rejected: number;
  held: number;
  researchRequired: number;
  candidates: number;
}>;

const EMPTY: CieR4ApplySummary = Object.freeze({ applied: 0, rejected: 0, held: 0, researchRequired: 0, candidates: 0 });

/**
 * Historical direct R4 persistence is deliberately no longer exported.
 * Build 2 persists the entire evidence-qualified production trace atomically,
 * and migration 0152 revokes direct service-role execution of the old RPC.
 */
export async function persistForensicBuild2CommercialRealityProduction(
  production: ForensicBuild2CommercialRealityProduction,
  schedulerRunId: string,
): Promise<CieR4PersistenceOutcome> {
  const decision: CieR4CommercialDecision = production.decision;
  if (decision.authorityMode !== "AUTHORITATIVE") throw new Error("CIE_R4_AUTHORITY_VIOLATION:NON_AUTHORITATIVE_DECISION");
  const result = await databaseRequest<CieR4PersistenceOutcome[]>("rpc/persist_cie_r4_commercial_reality_production", {
    method: "POST",
    body: JSON.stringify({
      p_scheduler_run_id: schedulerRunId,
      p_opportunity_id: decision.opportunityId,
      p_producer_version: production.producerVersion,
      p_input_fingerprint: production.inputFingerprint,
      p_authority_fingerprint: production.authorityFingerprint,
      p_seller_context_fingerprint: production.sellerContextFingerprint,
      p_constraint_fingerprint: production.constraintFingerprint,
      p_target_truth_entity_id: production.targetTruthEntityId,
      p_target_truth_snapshot_id: production.targetTruthSnapshotId,
      p_target_truth_semantics_version: production.targetTruthSemanticsVersion,
      p_reference_time: production.referenceTime,
      p_reality_id: decision.realityId,
      p_target_entity_id: decision.targetEntityId,
      p_reality_state: decision.realityState,
      p_disposition: decision.disposition,
      p_propagation_json: production.propagation,
      p_constraint_contexts_json: production.constraintContexts,
      p_composition_json: production.composition,
      p_decision_json: decision,
      p_deferred_seller_constraint_ids: production.deferredSellerConstraintIds,
    }),
  });
  return result[0] ?? Object.freeze({ material_changed: true, r6_invalidated: false, r7_retired: 0 });
}

/** Apply only already-persisted current Build 2 CIE decisions. No legacy fallback is permitted. */
export async function runCieR4CommercialDecisionAuthority(schedulerRunId: string): Promise<CieR4ApplySummary> {
  const result = await databaseRequest<CieR4ApplySummary | CieR4ApplySummary[]>("rpc/apply_cie_r4_commercial_decision_authority", {
    method: "POST",
    body: JSON.stringify({ p_scheduler_run_id: schedulerRunId }),
  });
  return (Array.isArray(result) ? result[0] : result) ?? EMPTY;
}
