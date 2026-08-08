import "server-only";

import { retrieveGenesisG8CompanyCandidates, type GenesisG8KnowledgeCandidateRetrievalResult } from "./knowledge-candidate-retrieval";
import type { GenesisG8BusinessDnaRetrievalInput } from "./knowledge-matching";

export const GENESIS_G8_BUSINESS_DNA_MATCHING_VERSION = "G8.1-R14-BUSINESS-DNA-MATCHING-1.0" as const;

export interface GenesisG8BusinessDnaSource {
  company: { website: string };
  idealCustomers: Array<{
    segment: string;
    industries: string[];
    companySize: string;
    geographies: string[];
    buyerRoles: string[];
    pains: string[];
  }>;
  campaigns: Array<{ audience: string; objective: string }>;
}

export interface GenesisG8BusinessDnaKnowledgeMatchSnapshot {
  version: typeof GENESIS_G8_BUSINESS_DNA_MATCHING_VERSION;
  retrievalVersion: string;
  matchedAt: string;
  candidatesInspected: number;
  matchedCandidates: number;
  metrics: GenesisG8KnowledgeCandidateRetrievalResult["metrics"];
  candidates: Array<{
    entityId: string;
    canonicalKey: string;
    displayName: string | null;
    businessFit: number;
    retrievalScore: number;
    retrievalConfidence: number;
    truthIndex: number;
    confidence: number;
    coverage: number;
    routeReadiness: number;
    eligibility: string | undefined;
    mayUseKnowledgeImmediately: boolean;
    blocking: boolean;
    nextAction: string;
    gaps: Array<{ claimKey: string; reason: string; criticality: string; priority: number }>;
  }>;
}

export function isGenesisG8BusinessDnaKnowledgeMatchingEnabled(env: NodeJS.ProcessEnv = process.env) {
  return env.GENESIS_G8_BUSINESS_DNA_KNOWLEDGE_MATCHING !== "false";
}

export function genesisG8BusinessDnaMatchTimeoutMs(env: NodeJS.ProcessEnv = process.env) {
  const parsed = Number(env.GENESIS_G8_BUSINESS_DNA_MATCH_TIMEOUT_MS ?? 2500);
  return Number.isFinite(parsed) ? Math.max(500, Math.min(10000, Math.trunc(parsed))) : 2500;
}

export async function withGenesisG8BusinessDnaMatchBudget<T>(work: Promise<T>, timeoutMs = genesisG8BusinessDnaMatchTimeoutMs()): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`GENESIS_G8_BUSINESS_DNA_MATCH_TIMEOUT:${timeoutMs}ms`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function adaptBusinessDnaForGenesisG8(source: GenesisG8BusinessDnaSource): GenesisG8BusinessDnaRetrievalInput {
  return {
    company: { website: source.company.website },
    idealCustomers: source.idealCustomers.map((item) => ({
      segment: item.segment,
      industries: [...item.industries],
      companySize: item.companySize,
      geographies: [...item.geographies],
      buyerRoles: [...item.buyerRoles],
      pains: [...item.pains],
    })),
    campaigns: source.campaigns.map((item) => ({ audience: item.audience, objective: item.objective })),
  };
}

export function snapshotGenesisG8BusinessDnaKnowledgeMatch(
  result: GenesisG8KnowledgeCandidateRetrievalResult,
  matchedAt = new Date().toISOString(),
): GenesisG8BusinessDnaKnowledgeMatchSnapshot {
  return {
    version: GENESIS_G8_BUSINESS_DNA_MATCHING_VERSION,
    retrievalVersion: result.retrievalVersion,
    matchedAt,
    candidatesInspected: result.candidatesInspected,
    matchedCandidates: result.matchedCandidates,
    metrics: result.metrics,
    candidates: result.candidates.map((candidate) => ({
      entityId: candidate.entityId,
      canonicalKey: candidate.canonicalKey,
      displayName: candidate.displayName,
      businessFit: candidate.businessFit,
      retrievalScore: candidate.retrievalScore,
      retrievalConfidence: candidate.retrievalConfidence,
      truthIndex: candidate.truthIndex,
      confidence: candidate.confidence,
      coverage: candidate.coverage,
      routeReadiness: candidate.routeReadiness,
      eligibility: candidate.eligibility,
      mayUseKnowledgeImmediately: candidate.plan.mayUseKnowledgeImmediately,
      blocking: !candidate.plan.mayUseKnowledgeImmediately,
      nextAction: candidate.plan.action,
      gaps: candidate.gaps,
    })),
  };
}

export async function matchBusinessDnaAgainstGenesisG8(
  source: GenesisG8BusinessDnaSource,
  options: { limit?: number; shortlistLimit?: number; minimumBusinessFit?: number } = {},
) {
  const retrieval = await retrieveGenesisG8CompanyCandidates(adaptBusinessDnaForGenesisG8(source), {
    limit: options.limit ?? 25,
    shortlistLimit: options.shortlistLimit ?? 150,
    minimumBusinessFit: options.minimumBusinessFit ?? 30,
    persistMetrics: true,
  });
  return snapshotGenesisG8BusinessDnaKnowledgeMatch(retrieval);
}
