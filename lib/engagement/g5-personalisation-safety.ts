import "server-only";
import { createHash } from "node:crypto";
import { databaseRequest } from "@/lib/database/postgrest";
import { isPipelineOwnershipLost } from "@/lib/pipeline/ownership";
import { G5PersonalisationSafetySchema, type G5PersonalisationSafety } from "./g5-personalisation-safety-schema";

export type G5PersonalisationSafetyWorkerResult = {
  processed: boolean;
  outcome: "NO_JOB" | "COMPLETED" | "FAILED_RETRYABLE" | "SUPERSEDED";
  strategyId?: string;
  opportunityId?: string;
};

type Claim = { strategy_id: string; lease_token: string; opportunity_id: string };
type Context = {
  commercial_reasoning_json: Record<string, unknown>;
  source_snapshot_json: Record<string, unknown>;
};

type SafeEvidence = { sourceType?: unknown; sourceId?: unknown; claim?: unknown; usage?: unknown };

function stableId(prefix: string, index: number, statement: string): string {
  const digest = createHash("sha256").update(statement, "utf8").digest("hex").slice(0, 16);
  return `${prefix}:${index}:${digest}`;
}

function sourceExists(snapshot: Record<string, unknown>, sourceId: string): boolean {
  return JSON.stringify(snapshot).includes(sourceId);
}

export function buildG5PersonalisationSafetyManifest(
  commercialReasoning: Record<string, unknown>,
  sourceSnapshot: Record<string, unknown>,
): G5PersonalisationSafety {
  const items: G5PersonalisationSafety["items"] = [];
  const verifiedFactIds: string[] = [];
  const commercialInferenceIds: string[] = [];
  const doNotUseIds: string[] = [];

  const safeEvidence = Array.isArray(commercialReasoning.safeEvidence) ? commercialReasoning.safeEvidence : [];
  safeEvidence.forEach((raw, index) => {
    if (!raw || typeof raw !== "object") return;
    const value = raw as SafeEvidence;
    if (typeof value.claim !== "string" || !value.claim.trim()) return;
    if (typeof value.sourceId !== "string" || !value.sourceId.trim()) return;
    if (!sourceExists(sourceSnapshot, value.sourceId)) {
      throw new Error(`G5_PERSONALISATION_SAFETY_UNKNOWN_SOURCE:${value.sourceId}`);
    }
    const itemId = stableId("fact", index, `${value.sourceId}|${value.claim}`);
    verifiedFactIds.push(itemId);
    items.push({
      itemId,
      classification: "VERIFIED_FACT",
      statement: value.claim.trim(),
      sourceType: typeof value.sourceType === "string" && ["BUSINESS_DNA","CAMPAIGN","COMPANY","CONTACT","ROUTE","OPPORTUNITY"].includes(value.sourceType)
        ? value.sourceType as "BUSINESS_DNA" | "CAMPAIGN" | "COMPANY" | "CONTACT" | "ROUTE" | "OPPORTUNITY"
        : "REASONING",
      sourceId: value.sourceId,
      allowedUsage: "DIRECT_REFERENCE",
      usageGuidance: typeof value.usage === "string" && value.usage.trim() ? value.usage.trim() : "Reference only as the supplied evidence directly supports it.",
    });
  });

  const inferences = Array.isArray(commercialReasoning.commercialInferences) ? commercialReasoning.commercialInferences : [];
  inferences.forEach((raw, index) => {
    if (typeof raw !== "string" || !raw.trim()) return;
    const itemId = stableId("inference", index, raw);
    commercialInferenceIds.push(itemId);
    items.push({
      itemId,
      classification: "COMMERCIAL_INFERENCE",
      statement: raw.trim(),
      sourceType: "REASONING",
      sourceId: null,
      allowedUsage: "FRAMED_INFERENCE",
      usageGuidance: "May be used only as a clearly framed commercial inference, never stated as a verified fact about the prospect.",
    });
  });

  const prohibited = Array.isArray(commercialReasoning.prohibitedClaims) ? commercialReasoning.prohibitedClaims : [];
  prohibited.forEach((raw, index) => {
    if (typeof raw !== "string" || !raw.trim()) return;
    const itemId = stableId("blocked", index, raw);
    doNotUseIds.push(itemId);
    items.push({
      itemId,
      classification: "DO_NOT_USE",
      statement: raw.trim(),
      sourceType: "REASONING",
      sourceId: null,
      allowedUsage: "EXCLUDE",
      usageGuidance: "Must not appear as a claim, implication, personalisation hook, proof point or reason for urgency.",
    });
  });

  return G5PersonalisationSafetySchema.parse({
    schemaVersion: "g5-personalisation-safety/v1",
    policyVersion: "g5-personalisation-safety/v1",
    items,
    verifiedFactIds,
    commercialInferenceIds,
    doNotUseIds,
    immutableG4: true,
  });
}

export async function runNextG5PersonalisationSafety(schedulerRunId: string): Promise<G5PersonalisationSafetyWorkerResult> {
  const claims = await databaseRequest<Claim[]>("rpc/claim_g5_personalisation_safety", {
    method: "POST",
    body: JSON.stringify({ p_scheduler_run_id: schedulerRunId, p_lease_seconds: 120 }),
  });
  const claim = claims[0];
  if (!claim) return { processed: false, outcome: "NO_JOB" };

  try {
    const rows = await databaseRequest<Context[]>("rpc/get_g5_personalisation_safety_context_owned", {
      method: "POST",
      body: JSON.stringify({
        p_strategy_id: claim.strategy_id,
        p_scheduler_run_id: schedulerRunId,
        p_lease_token: claim.lease_token,
      }),
    });
    const context = rows[0];
    if (!context) throw new Error("G5_PERSONALISATION_SAFETY_CONTEXT_MISSING");

    const manifest = buildG5PersonalisationSafetyManifest(context.commercial_reasoning_json, context.source_snapshot_json);
    const fingerprint = createHash("sha256").update(JSON.stringify(manifest), "utf8").digest("hex");

    await databaseRequest("rpc/complete_g5_personalisation_safety_owned", {
      method: "POST",
      body: JSON.stringify({
        p_strategy_id: claim.strategy_id,
        p_scheduler_run_id: schedulerRunId,
        p_lease_token: claim.lease_token,
        p_safety_json: manifest,
        p_schema_version: manifest.schemaVersion,
        p_policy_version: manifest.policyVersion,
        p_source_fingerprint: fingerprint,
      }),
    });

    return { processed: true, outcome: "COMPLETED", strategyId: claim.strategy_id, opportunityId: claim.opportunity_id };
  } catch (error) {
    if (isPipelineOwnershipLost(error) || (error instanceof Error && error.message.includes("G5_ENGAGEMENT_OWNERSHIP_LOST"))) {
      return { processed: false, outcome: "SUPERSEDED", strategyId: claim.strategy_id, opportunityId: claim.opportunity_id };
    }
    await databaseRequest("rpc/fail_g5_personalisation_safety_owned", {
      method: "POST",
      body: JSON.stringify({
        p_strategy_id: claim.strategy_id,
        p_scheduler_run_id: schedulerRunId,
        p_lease_token: claim.lease_token,
        p_reason: error instanceof Error ? error.message : "G5_PERSONALISATION_SAFETY_FAILED",
        p_retry_after_seconds: 60,
      }),
    }).catch(() => undefined);
    return { processed: true, outcome: "FAILED_RETRYABLE", strategyId: claim.strategy_id, opportunityId: claim.opportunity_id };
  }
}
