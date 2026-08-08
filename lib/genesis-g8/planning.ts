import type { GenesisG8EligibilityResult } from "./eligibility";
import { createGenesisG8GapRepairContracts, type GenesisG8GapRepairContract } from "./gap-repair";
import type { GenesisG8ChannelStrategy, GenesisG8IntelligenceChannel } from "./channels";
import { GENESIS_G8_DEFAULT_CHANNEL_STRATEGY } from "./channels";

export type GenesisG8PlanAction =
  | "USE_KNOWLEDGE"
  | "USE_KNOWLEDGE_AND_REPAIR"
  | "REFRESH_BEFORE_USE"
  | "ROUTE_TO_HUMAN_REVIEW"
  | "RUN_FULL_DISCOVERY";

export type GenesisG8PlanDisposition =
  | "KNOWLEDGE_IMMEDIATE"
  | "KNOWLEDGE_PLUS_DISCOVERY_REPAIR"
  | "DISCOVERY_REFRESH"
  | "HUMAN_REVIEW"
  | "DISCOVERY_FALLBACK";

export interface GenesisG8DualChannelPlan {
  action: GenesisG8PlanAction;
  disposition: GenesisG8PlanDisposition;
  strategy: GenesisG8ChannelStrategy;
  primaryChannel: GenesisG8IntelligenceChannel | "HUMAN_REVIEW";
  secondaryChannel: GenesisG8IntelligenceChannel | null;
  mayUseKnowledgeImmediately: boolean;
  requiresDiscovery: boolean;
  requiresHumanReview: boolean;
  repairContracts: GenesisG8GapRepairContract[];
  eligibilityStatus: GenesisG8EligibilityResult["status"];
  eligibilityReasons: GenesisG8EligibilityResult["reasons"];
  truthIndex: number;
  confidence: number;
  coverage: number;
  plannedAt: string;
}

function base(
  eligibility: GenesisG8EligibilityResult,
  input: Omit<GenesisG8DualChannelPlan, "eligibilityStatus" | "eligibilityReasons" | "truthIndex" | "confidence" | "coverage" | "plannedAt">,
  now: Date,
): GenesisG8DualChannelPlan {
  return {
    ...input,
    eligibilityStatus: eligibility.status,
    eligibilityReasons: eligibility.reasons,
    truthIndex: eligibility.truthIndex,
    confidence: eligibility.confidence,
    coverage: eligibility.coverage,
    plannedAt: now.toISOString(),
  };
}

/**
 * Turns current knowledge eligibility into a deterministic dual-channel plan.
 * This planner is intentionally execution-neutral: it neither invokes live
 * Discovery Intelligence nor mutates Knowledge Intelligence.
 */
export function planGenesisG8DualChannelWork(
  eligibility: GenesisG8EligibilityResult,
  options: { strategy?: GenesisG8ChannelStrategy; now?: Date } = {},
): GenesisG8DualChannelPlan {
  const strategy = options.strategy ?? GENESIS_G8_DEFAULT_CHANNEL_STRATEGY;
  const now = options.now ?? new Date();

  if (strategy === "DISCOVERY_ONLY") {
    return base(eligibility, {
      action: "RUN_FULL_DISCOVERY",
      disposition: "DISCOVERY_FALLBACK",
      strategy,
      primaryChannel: "DISCOVERY_INTELLIGENCE",
      secondaryChannel: null,
      mayUseKnowledgeImmediately: false,
      requiresDiscovery: true,
      requiresHumanReview: false,
      repairContracts: [],
    }, now);
  }

  if (strategy === "KNOWLEDGE_ONLY" && eligibility.status === "NOT_USABLE") {
    return base(eligibility, {
      action: "ROUTE_TO_HUMAN_REVIEW",
      disposition: "HUMAN_REVIEW",
      strategy,
      primaryChannel: "HUMAN_REVIEW",
      secondaryChannel: null,
      mayUseKnowledgeImmediately: false,
      requiresDiscovery: false,
      requiresHumanReview: true,
      repairContracts: [],
    }, now);
  }

  switch (eligibility.status) {
    case "READY":
      return base(eligibility, {
        action: "USE_KNOWLEDGE",
        disposition: "KNOWLEDGE_IMMEDIATE",
        strategy,
        primaryChannel: "KNOWLEDGE_INTELLIGENCE",
        secondaryChannel: null,
        mayUseKnowledgeImmediately: true,
        requiresDiscovery: false,
        requiresHumanReview: false,
        repairContracts: [],
      }, now);

    case "READY_WITH_GAPS": {
      const repairs = createGenesisG8GapRepairContracts(eligibility.repairableGaps);
      return base(eligibility, {
        action: "USE_KNOWLEDGE_AND_REPAIR",
        disposition: "KNOWLEDGE_PLUS_DISCOVERY_REPAIR",
        strategy,
        primaryChannel: "KNOWLEDGE_INTELLIGENCE",
        secondaryChannel: repairs.length ? "DISCOVERY_INTELLIGENCE" : null,
        mayUseKnowledgeImmediately: true,
        requiresDiscovery: repairs.length > 0,
        requiresHumanReview: false,
        repairContracts: repairs,
      }, now);
    }

    case "REFRESH_REQUIRED": {
      const repairs = createGenesisG8GapRepairContracts(eligibility.blockingGaps);
      return base(eligibility, {
        action: "REFRESH_BEFORE_USE",
        disposition: "DISCOVERY_REFRESH",
        strategy,
        primaryChannel: "DISCOVERY_INTELLIGENCE",
        secondaryChannel: "KNOWLEDGE_INTELLIGENCE",
        mayUseKnowledgeImmediately: false,
        requiresDiscovery: true,
        requiresHumanReview: false,
        repairContracts: repairs,
      }, now);
    }

    case "HUMAN_REVIEW_REQUIRED":
      return base(eligibility, {
        action: "ROUTE_TO_HUMAN_REVIEW",
        disposition: "HUMAN_REVIEW",
        strategy,
        primaryChannel: "HUMAN_REVIEW",
        secondaryChannel: eligibility.repairableGaps.length ? "DISCOVERY_INTELLIGENCE" : null,
        mayUseKnowledgeImmediately: false,
        requiresDiscovery: false,
        requiresHumanReview: true,
        repairContracts: createGenesisG8GapRepairContracts(eligibility.blockingGaps),
      }, now);

    case "NOT_USABLE":
      return base(eligibility, {
        action: "RUN_FULL_DISCOVERY",
        disposition: "DISCOVERY_FALLBACK",
        strategy,
        primaryChannel: "DISCOVERY_INTELLIGENCE",
        secondaryChannel: "KNOWLEDGE_INTELLIGENCE",
        mayUseKnowledgeImmediately: false,
        requiresDiscovery: true,
        requiresHumanReview: false,
        repairContracts: [],
      }, now);
  }
}
