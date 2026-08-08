import "server-only";

import { createHash } from "node:crypto";
import { databaseRequest } from "@/lib/database/postgrest";
import { retrieveGenesisG8KnowledgeById } from "./knowledge-retrieval";
import { planGenesisG8DualChannelWork, type GenesisG8DualChannelPlan } from "./planning";
import {
  buildGenesisG8RetrievalProfile,
  buildGenesisG8SearchTsQuery,
  rankGenesisG8CompanyCandidates,
  type GenesisG8BusinessDnaRetrievalInput,
  type GenesisG8CompanySearchProjection,
  type GenesisG8RankedCompanyCandidate,
} from "./knowledge-matching";

export const GENESIS_G8_KNOWLEDGE_RETRIEVAL_VERSION = "G8.1-R13-RETRIEVAL-1.0" as const;

type DbRow = Record<string, unknown>;
const s = (value: unknown) => typeof value === "string" ? value : String(value ?? "");
const n = (value: unknown) => Number(value ?? 0);
const b = (value: unknown) => value === true || value === "true";

function mapProjection(row: DbRow): GenesisG8CompanySearchProjection {
  const rawClaimText = row.claim_text_json && typeof row.claim_text_json === "object" ? row.claim_text_json as Record<string, unknown> : {};
  const claimText = Object.fromEntries(Object.entries(rawClaimText).map(([key, value]) => [key, s(value)]));
  return {
    entityId: s(row.entity_id),
    canonicalKey: s(row.canonical_key),
    displayName: row.display_name == null ? null : s(row.display_name),
    status: s(row.status) as GenesisG8CompanySearchProjection["status"],
    reviewState: s(row.review_state) as GenesisG8CompanySearchProjection["reviewState"],
    searchText: s(row.search_text),
    claimText,
    truthIndex: n(row.truth_index),
    confidence: n(row.confidence),
    coverage: n(row.coverage),
    criticalClaimCeiling: n(row.critical_claim_ceiling),
    identityConfidence: n(row.identity_confidence),
    contactCount: n(row.contact_count),
    routeCount: n(row.route_count),
    contactTruthScore: n(row.contact_truth_score),
    routeTruthScore: n(row.route_truth_score),
    sourceChannels: Array.isArray(row.source_channels) ? row.source_channels.map(s) : [],
    humanReviewed: b(row.human_reviewed),
    lexicalRank: n(row.lexical_rank),
    updatedAt: s(row.updated_at),
  };
}

export interface GenesisG8KnowledgeCandidateResult extends GenesisG8RankedCompanyCandidate {
  plan: GenesisG8DualChannelPlan;
  gaps: { claimKey: string; reason: string; criticality: string; priority: number }[];
}

export interface GenesisG8KnowledgeCandidateRetrievalResult {
  retrievalVersion: typeof GENESIS_G8_KNOWLEDGE_RETRIEVAL_VERSION;
  candidatesInspected: number;
  matchedCandidates: number;
  candidates: GenesisG8KnowledgeCandidateResult[];
  metrics: {
    latencyMs: number;
    ready: number;
    readyWithGaps: number;
    refreshRequired: number;
    humanReviewRequired: number;
    discoveryRequired: number;
    averageTruthIndex: number;
    averageCoverage: number;
    discoveryAvoided: number;
  };
}

async function hydrateRankedCandidate(candidate: GenesisG8RankedCompanyCandidate): Promise<GenesisG8KnowledgeCandidateResult | null> {
  const knowledge = await retrieveGenesisG8KnowledgeById(candidate.entityId, { persistTruthIfChanged: false });
  if (!knowledge) return null;
  const plan = planGenesisG8DualChannelWork(knowledge.eligibility);
  return {
    ...candidate,
    truthIndex: knowledge.hydrated.truth.truthIndex,
    confidence: knowledge.hydrated.truth.confidence,
    coverage: knowledge.hydrated.truth.coverage,
    eligibility: knowledge.eligibility.status,
    plan,
    gaps: knowledge.hydrated.gaps.map((gap) => ({ claimKey: gap.claimKey, reason: gap.reason, criticality: gap.criticality, priority: gap.priority })),
  };
}

async function boundedHydrate(candidates: GenesisG8RankedCompanyCandidate[], concurrency = 5) {
  const output: (GenesisG8KnowledgeCandidateResult | null)[] = new Array(candidates.length).fill(null);
  let cursor = 0;
  async function worker() {
    while (true) {
      const index = cursor++;
      if (index >= candidates.length) return;
      output[index] = await hydrateRankedCandidate(candidates[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, candidates.length || 1)) }, () => worker()));
  return output.filter((item): item is GenesisG8KnowledgeCandidateResult => Boolean(item));
}

function average(values: number[]) {
  return values.length ? Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 100) / 100 : 0;
}

async function recordMetrics(input: {
  fingerprint: string;
  latencyMs: number;
  inspected: number;
  candidates: GenesisG8KnowledgeCandidateResult[];
}) {
  const counts = (status: string) => input.candidates.filter((candidate) => candidate.eligibility === status).length;
  await databaseRequest("rpc/record_genesis_g8_knowledge_retrieval", {
    method: "POST",
    body: JSON.stringify({
      p_request_fingerprint: input.fingerprint,
      p_latency_ms: input.latencyMs,
      p_candidates_inspected: input.inspected,
      p_candidates_matched: input.candidates.length,
      p_ready_count: counts("READY"),
      p_ready_with_gaps_count: counts("READY_WITH_GAPS"),
      p_refresh_required_count: counts("REFRESH_REQUIRED"),
      p_human_review_required_count: counts("HUMAN_REVIEW_REQUIRED"),
      p_discovery_required_count: counts("NOT_USABLE"),
      p_average_truth_index: average(input.candidates.map((candidate) => candidate.truthIndex)),
      p_average_coverage: average(input.candidates.map((candidate) => candidate.coverage)),
    }),
  });
}

export async function retrieveGenesisG8CompanyCandidates(
  businessDna: GenesisG8BusinessDnaRetrievalInput,
  options: { limit?: number; shortlistLimit?: number; minimumBusinessFit?: number; persistMetrics?: boolean } = {},
): Promise<GenesisG8KnowledgeCandidateRetrievalResult> {
  const started = Date.now();
  const profile = buildGenesisG8RetrievalProfile(businessDna);
  const tsQuery = buildGenesisG8SearchTsQuery(profile);
  const shortlistLimit = Math.max(25, Math.min(500, Math.trunc(options.shortlistLimit ?? 200)));
  const finalLimit = Math.max(1, Math.min(50, Math.trunc(options.limit ?? 25)));
  const rows = await databaseRequest<DbRow[]>("rpc/search_genesis_g8_company_candidates", {
    method: "POST",
    body: JSON.stringify({ p_tsquery: tsQuery || null, p_limit: shortlistLimit }),
  });
  const projections = rows.map(mapProjection);
  const ranked = rankGenesisG8CompanyCandidates(projections, profile, {
    minimumBusinessFit: options.minimumBusinessFit,
    limit: Math.min(shortlistLimit, Math.max(finalLimit * 2, finalLimit)),
  });
  const hydrated = await boundedHydrate(ranked, 5);
  const candidates = hydrated
    .sort((a, b) => b.retrievalScore - a.retrievalScore || b.businessFit - a.businessFit || b.truthIndex - a.truthIndex || a.canonicalKey.localeCompare(b.canonicalKey))
    .slice(0, finalLimit);
  const latencyMs = Date.now() - started;
  const counts = (status: string) => candidates.filter((candidate) => candidate.eligibility === status).length;
  const metrics = {
    latencyMs,
    ready: counts("READY"),
    readyWithGaps: counts("READY_WITH_GAPS"),
    refreshRequired: counts("REFRESH_REQUIRED"),
    humanReviewRequired: counts("HUMAN_REVIEW_REQUIRED"),
    discoveryRequired: counts("NOT_USABLE"),
    averageTruthIndex: average(candidates.map((candidate) => candidate.truthIndex)),
    averageCoverage: average(candidates.map((candidate) => candidate.coverage)),
    discoveryAvoided: candidates.filter((candidate) => candidate.plan.mayUseKnowledgeImmediately).length,
  };
  if (options.persistMetrics !== false) {
    const fingerprint = createHash("sha256").update(JSON.stringify({ profile, finalLimit, shortlistLimit })).digest("hex");
    await recordMetrics({ fingerprint, latencyMs, inspected: projections.length, candidates });
  }
  return {
    retrievalVersion: GENESIS_G8_KNOWLEDGE_RETRIEVAL_VERSION,
    candidatesInspected: projections.length,
    matchedCandidates: candidates.length,
    candidates,
    metrics,
  };
}
