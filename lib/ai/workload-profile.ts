import type { AiRequestTask } from "@/lib/ai/request-policy";

export type ReasoningEffort = "low" | "medium" | "high";

export type AiWorkloadProfile = {
  reasoningEffort: ReasoningEffort;
  maxOutputTokens: number;
  evidenceLimit: number;
  depth: number;
  promptVersion: string;
  cacheKey: string;
};

const PROFILES: Record<AiRequestTask, AiWorkloadProfile> = {
  BUSINESS_ANALYSIS: {
    reasoningEffort: "medium",
    maxOutputTokens: 10_000,
    evidenceLimit: 8,
    depth: 5,
    promptVersion: "business-discovery/v3-responsibility-boundary",
    cacheKey: "salespilot:business-understanding:v3",
  },
  COMPANY_DISCOVERY: {
    reasoningEffort: "medium",
    maxOutputTokens: 10_000,
    evidenceLimit: 6,
    depth: 5,
    promptVersion: "company-discovery/v5-bounded-archetype",
    cacheKey: "salespilot:company-discovery:v5",
  },
  ROUTE_INTELLIGENCE_FIRST_PASS: {
    reasoningEffort: "medium",
    maxOutputTokens: 10_000,
    evidenceLimit: 10,
    depth: 6,
    promptVersion: "contact-discovery/v5-responsibility-boundary",
    cacheKey: "salespilot:route-intelligence:first:v5",
  },
  ROUTE_INTELLIGENCE_EXPANSION: {
    reasoningEffort: "medium",
    maxOutputTokens: 10_000,
    evidenceLimit: 7,
    depth: 5,
    promptVersion: "contact-discovery/v5-responsibility-boundary",
    cacheKey: "salespilot:route-intelligence:expansion:v5",
  },
  G5_COMMERCIAL_REASONING: {
    reasoningEffort: "high",
    maxOutputTokens: 10_000,
    evidenceLimit: 7,
    depth: 6,
    promptVersion: "g5-commercial-reasoning/v3-responsibility-boundary",
    cacheKey: "salespilot:g5:commercial-reasoning:v3",
  },
  G5_CHANNEL_STRATEGY: {
    reasoningEffort: "medium",
    maxOutputTokens: 10_000,
    evidenceLimit: 6,
    depth: 6,
    promptVersion: "g5-channel-strategy/v3-responsibility-boundary",
    cacheKey: "salespilot:g5:channel-strategy:v3",
  },
  G5_OUTREACH_GENERATION: {
    reasoningEffort: "low",
    maxOutputTokens: 10_000,
    evidenceLimit: 5,
    depth: 6,
    promptVersion: "g5-outreach-generation/v5-responsibility-boundary",
    cacheKey: "salespilot:g5:outreach:v5",
  },
  G5_SELF_REVIEW: {
    reasoningEffort: "medium",
    maxOutputTokens: 10_000,
    evidenceLimit: 6,
    depth: 6,
    promptVersion: "g5-self-review/v3-responsibility-boundary",
    cacheKey: "salespilot:g5:self-review:v3",
  },
  STRUCTURED_OUTPUT_REPAIR: {
    reasoningEffort: "low",
    maxOutputTokens: 0,
    evidenceLimit: 0,
    depth: 0,
    promptVersion: "deterministic-only",
    cacheKey: "salespilot:structured-output:deterministic",
  },
  GENESIS_G8_REPAIR: {
    reasoningEffort: "low",
    maxOutputTokens: 4_000,
    evidenceLimit: 5,
    depth: 4,
    promptVersion: "genesis-g8-repair/v2-ai-canonical-first",
    cacheKey: "marketroute:genesis-g8:repair:v2",
  },
  GENESIS_G82_EXPANSION: {
    reasoningEffort: "low",
    maxOutputTokens: 4_500,
    evidenceLimit: 4,
    depth: 4,
    promptVersion: "genesis-g82-expansion/v4-ai-canonical-first",
    cacheKey: "marketroute:genesis-g82:expansion:v4",
  },
  GENESIS_G82_DEPTH: {
    reasoningEffort: "low",
    maxOutputTokens: 4_200,
    evidenceLimit: 6,
    depth: 5,
    promptVersion: "genesis-g82-depth/v1.1-dedicated-ai-identity",
    cacheKey: "marketroute:genesis-g82:depth:v1.1",
  },
};

function envKey(task: AiRequestTask, suffix: string) {
  return `SALESPILOT_R4_${task}_${suffix}`;
}

function boundedNumber(raw: string | undefined, fallback: number, min: number, max: number) {
  const value = Number(raw);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(value)));
}

export function aiWorkloadProfile(task: AiRequestTask): AiWorkloadProfile {
  const base = PROFILES[task];
  const effortRaw = process.env[envKey(task, "REASONING")]?.trim().toLowerCase();
  const reasoningEffort: ReasoningEffort = effortRaw === "low" || effortRaw === "medium" || effortRaw === "high"
    ? effortRaw
    : base.reasoningEffort;
  return {
    ...base,
    reasoningEffort,
    maxOutputTokens: base.maxOutputTokens === 0 ? 0 : boundedNumber(process.env[envKey(task, "MAX_OUTPUT_TOKENS")], base.maxOutputTokens, 800, 20_000),
    evidenceLimit: boundedNumber(process.env[envKey(task, "EVIDENCE_LIMIT")], base.evidenceLimit, 1, 20),
    depth: boundedNumber(process.env[envKey(task, "CONTEXT_DEPTH")], base.depth, 2, 10),
  };
}

/**
 * Keep this stable across organisations/campaigns. OpenAI's automatic prompt
 * caching works on matching prefixes; this value is also persisted in request
 * fingerprints/observability so prompt-version drift is explicit.
 */
export function aiPromptCacheKey(task: AiRequestTask): string {
  return aiWorkloadProfile(task).cacheKey;
}
