import "server-only";

import { createHash } from "node:crypto";
import { databaseRequest } from "@/lib/database/postgrest";
import type { GenesisG8EntityType as TruthEntityType } from "./entity-types";
import type { MrTi2ImpactClass } from "./truth-v2/types";

export const GENESIS_G8_BACKGROUND_REFRESH_VERSION = "G8.1-R16-BACKGROUND-REFRESH-1.0" as const;

export interface GenesisG8RefreshCandidate {
  entityId: string;
  entityType: TruthEntityType;
  claimId: string;
  claimKey: string;
  claimLabel: string;
  impactClass: MrTi2ImpactClass;
  freshnessHalfLifeDays: number;
  latestEvidenceAt: string | null;
  freshness: number;
  truthIndex: number;
  recentCampaignUses: number;
  priorityScore: number;
}

export interface GenesisG8BackgroundRefreshReceipt {
  candidate: GenesisG8RefreshCandidate;
  dispatchKey: string;
  queued: boolean;
  detail: string;
}

export interface GenesisG8BackgroundRefreshSummary {
  version: typeof GENESIS_G8_BACKGROUND_REFRESH_VERSION;
  deferredForLiveDemand: boolean;
  inspected: number;
  queued: number;
  receipts: GenesisG8BackgroundRefreshReceipt[];
}

type DbCandidate = {
  entity_id: string;
  entity_type: TruthEntityType;
  claim_id: string;
  claim_key: string;
  claim_label: string;
  impact_class: MrTi2ImpactClass;
  freshness_half_life_days: number;
  latest_evidence_at: string | null;
  freshness: number;
  truth_index: number;
  recent_campaign_uses: number;
  priority_score: number;
};

type DbDemand = { live_customer_work_pending?: boolean };
type DbEnqueue = { queued?: boolean; detail?: string | null };

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

function mapCandidate(row: DbCandidate): GenesisG8RefreshCandidate {
  return {
    entityId: row.entity_id,
    entityType: row.entity_type,
    claimId: row.claim_id,
    claimKey: row.claim_key,
    claimLabel: row.claim_label,
    impactClass: row.impact_class,
    freshnessHalfLifeDays: Number(row.freshness_half_life_days),
    latestEvidenceAt: row.latest_evidence_at,
    freshness: Number(row.freshness),
    truthIndex: Number(row.truth_index),
    recentCampaignUses: Number(row.recent_campaign_uses),
    priorityScore: Number(row.priority_score),
  };
}

export function genesisG8RefreshDispatchKey(candidate: Pick<GenesisG8RefreshCandidate, "entityId" | "claimId" | "latestEvidenceAt">, now = new Date()): string {
  // Daily time bucket prevents repeated scheduling inside one refresh window while
  // still allowing a legitimate later refresh if no new evidence was found.
  const day = now.toISOString().slice(0, 10);
  const basis = `${GENESIS_G8_BACKGROUND_REFRESH_VERSION}|${candidate.entityId}|${candidate.claimId}|${candidate.latestEvidenceAt ?? "none"}|${day}`;
  return `g8-refresh:${createHash("sha256").update(basis).digest("hex").slice(0, 40)}`;
}

/**
 * R16 only schedules exact refresh contracts. Research remains owned by the R9
 * Discovery Repair worker. Background work yields whenever customer-scoped repair
 * work is pending, preserving the live-customer-first constitutional rule.
 */
export async function runGenesisG8IntelligentBackgroundRefresh(options: {
  limit?: number;
  minimumPriority?: number;
  maximumFreshness?: number;
  now?: Date;
} = {}): Promise<GenesisG8BackgroundRefreshSummary> {
  const limit = Math.trunc(clamp(options.limit ?? 4, 1, 20));
  const minimumPriority = clamp(options.minimumPriority ?? 0.45, 0, 100);
  const maximumFreshness = clamp(options.maximumFreshness ?? 0.72, 0.05, 0.99);
  const now = options.now ?? new Date();

  const demand = await databaseRequest<DbDemand[]>("rpc/genesis_g8_background_refresh_live_demand", {
    method: "POST",
    body: JSON.stringify({}),
  });
  if (demand?.[0]?.live_customer_work_pending) {
    return {
      version: GENESIS_G8_BACKGROUND_REFRESH_VERSION,
      deferredForLiveDemand: true,
      inspected: 0,
      queued: 0,
      receipts: [],
    };
  }

  const rows = await databaseRequest<DbCandidate[]>("rpc/list_genesis_g8_background_refresh_candidates", {
    method: "POST",
    body: JSON.stringify({
      p_limit: Math.max(limit * 4, 12),
      p_maximum_freshness: maximumFreshness,
      p_minimum_priority: minimumPriority,
      p_now: now.toISOString(),
    }),
  });

  const candidates = rows.map(mapCandidate).slice(0, limit);
  const receipts: GenesisG8BackgroundRefreshReceipt[] = [];
  for (const candidate of candidates) {
    const dispatchKey = genesisG8RefreshDispatchKey(candidate, now);
    const result = await databaseRequest<DbEnqueue[]>("rpc/enqueue_genesis_g8_background_refresh", {
      method: "POST",
      body: JSON.stringify({
        p_dispatch_key: dispatchKey,
        p_refresh_version: GENESIS_G8_BACKGROUND_REFRESH_VERSION,
        p_entity_id: candidate.entityId,
        p_entity_type: candidate.entityType,
        p_claim_id: candidate.claimId,
        p_claim_key: candidate.claimKey,
        p_claim_label: candidate.claimLabel,
        p_impact_class: candidate.impactClass,
        p_priority_score: candidate.priorityScore,
        p_freshness: candidate.freshness,
      }),
    });
    receipts.push({
      candidate,
      dispatchKey,
      queued: result?.[0]?.queued === true,
      detail: result?.[0]?.detail ?? (result?.[0]?.queued ? "Exact background refresh queued." : "Already queued or no longer eligible."),
    });
  }

  return {
    version: GENESIS_G8_BACKGROUND_REFRESH_VERSION,
    deferredForLiveDemand: false,
    inspected: rows.length,
    queued: receipts.filter((receipt) => receipt.queued).length,
    receipts,
  };
}
