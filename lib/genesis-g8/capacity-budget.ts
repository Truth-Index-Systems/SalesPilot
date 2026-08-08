import "server-only";

import { databaseRequest } from "@/lib/database/postgrest";
import { runGenesisG8IntelligentBackgroundRefresh, type GenesisG8BackgroundRefreshSummary } from "./background-refresh";

export const GENESIS_G8_CAPACITY_BUDGET_VERSION = "G8.1-R17-CAPACITY-BUDGET-1.0" as const;

export type GenesisG8CapacityMode = "NORMAL" | "CONSERVATIVE" | "CUSTOMER_ONLY" | "PAUSED";

export interface GenesisG8CapacityAllocation {
  customerLivePercent: number;
  customerRepairPercent: number;
  backgroundGrowthPercent: number;
  experimentPercent: number;
}

export interface GenesisG8CapacitySnapshot {
  governanceEnabled: boolean;
  dailyRequestLimit: number;
  dailyCostLimitUsd: number;
  requestsToday: number;
  costTodayUsd: number;
  g8RepairCallsToday: number;
  g8RepairCostTodayUsd: number;
  backgroundRepairCallsToday: number;
  backgroundRepairCostTodayUsd: number;
  liveCustomerWorkPending: boolean;
  queuedCustomerRepairs: number;
  activeCustomerRepairs: number;
  truthGainToday: number;
  truthGainPerRepairCall: number;
}

export interface GenesisG8CapacityDecision {
  version: typeof GENESIS_G8_CAPACITY_BUDGET_VERSION;
  mode: GenesisG8CapacityMode;
  allocation: GenesisG8CapacityAllocation;
  capacityUsedRatio: number;
  requestUsedRatio: number;
  backgroundBudgetUsd: number;
  backgroundSpentUsd: number;
  backgroundRemainingUsd: number;
  estimatedRepairCostUsd: number;
  maximumBackgroundRepairs: number;
  reasons: string[];
  snapshot: GenesisG8CapacitySnapshot;
}

export interface GenesisG8CapacityCycleResult extends GenesisG8CapacityDecision {
  refresh: GenesisG8BackgroundRefreshSummary | null;
}

type DbCapacitySnapshot = {
  governance_enabled?: boolean;
  daily_request_limit?: number | string;
  daily_cost_limit_usd?: number | string;
  requests_today?: number | string;
  cost_today_usd?: number | string;
  g8_repair_calls_today?: number | string;
  g8_repair_cost_today_usd?: number | string;
  background_repair_calls_today?: number | string;
  background_repair_cost_today_usd?: number | string;
  live_customer_work_pending?: boolean;
  queued_customer_repairs?: number | string;
  active_customer_repairs?: number | string;
  truth_gain_today?: number | string;
  truth_gain_per_repair_call?: number | string;
};

const n = (value: number | string | undefined, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const NORMAL_ALLOCATION: GenesisG8CapacityAllocation = {
  customerLivePercent: 60,
  customerRepairPercent: 20,
  backgroundGrowthPercent: 15,
  experimentPercent: 5,
};
const CONSERVATIVE_ALLOCATION: GenesisG8CapacityAllocation = {
  customerLivePercent: 80,
  customerRepairPercent: 15,
  backgroundGrowthPercent: 5,
  experimentPercent: 0,
};
const CUSTOMER_ONLY_ALLOCATION: GenesisG8CapacityAllocation = {
  customerLivePercent: 90,
  customerRepairPercent: 10,
  backgroundGrowthPercent: 0,
  experimentPercent: 0,
};
const PAUSED_ALLOCATION: GenesisG8CapacityAllocation = {
  customerLivePercent: 0,
  customerRepairPercent: 0,
  backgroundGrowthPercent: 0,
  experimentPercent: 0,
};

export async function readGenesisG8CapacitySnapshot(): Promise<GenesisG8CapacitySnapshot> {
  const organisationId = process.env.MARKETROUTE_G8_SYSTEM_ORGANISATION_ID?.trim() ?? "";
  if (!organisationId) {
    return {
      governanceEnabled: false,
      dailyRequestLimit: 0,
      dailyCostLimitUsd: 0,
      requestsToday: 0,
      costTodayUsd: 0,
      g8RepairCallsToday: 0,
      g8RepairCostTodayUsd: 0,
      backgroundRepairCallsToday: 0,
      backgroundRepairCostTodayUsd: 0,
      liveCustomerWorkPending: false,
      queuedCustomerRepairs: 0,
      activeCustomerRepairs: 0,
      truthGainToday: 0,
      truthGainPerRepairCall: 0,
    };
  }
  const rows = await databaseRequest<DbCapacitySnapshot[]>("rpc/genesis_g8_capacity_budget_snapshot", {
    method: "POST",
    body: JSON.stringify({ p_system_organisation_id: organisationId }),
  });
  const row = rows?.[0] ?? {};
  return {
    governanceEnabled: row.governance_enabled === true,
    dailyRequestLimit: n(row.daily_request_limit),
    dailyCostLimitUsd: n(row.daily_cost_limit_usd),
    requestsToday: n(row.requests_today),
    costTodayUsd: n(row.cost_today_usd),
    g8RepairCallsToday: n(row.g8_repair_calls_today),
    g8RepairCostTodayUsd: n(row.g8_repair_cost_today_usd),
    backgroundRepairCallsToday: n(row.background_repair_calls_today),
    backgroundRepairCostTodayUsd: n(row.background_repair_cost_today_usd),
    liveCustomerWorkPending: row.live_customer_work_pending === true,
    queuedCustomerRepairs: n(row.queued_customer_repairs),
    activeCustomerRepairs: n(row.active_customer_repairs),
    truthGainToday: n(row.truth_gain_today),
    truthGainPerRepairCall: n(row.truth_gain_per_repair_call),
  };
}

export function decideGenesisG8Capacity(snapshot: GenesisG8CapacitySnapshot): GenesisG8CapacityDecision {
  const reasons: string[] = [];
  const costRatio = snapshot.dailyCostLimitUsd > 0 ? snapshot.costTodayUsd / snapshot.dailyCostLimitUsd : 1;
  const requestRatio = snapshot.dailyRequestLimit > 0 ? snapshot.requestsToday / snapshot.dailyRequestLimit : 1;
  const capacityUsedRatio = clamp(Math.max(costRatio, requestRatio), 0, 10);
  let mode: GenesisG8CapacityMode;
  let allocation: GenesisG8CapacityAllocation;

  if (!snapshot.governanceEnabled || snapshot.dailyCostLimitUsd <= 0 || snapshot.dailyRequestLimit <= 0) {
    mode = "PAUSED";
    allocation = PAUSED_ALLOCATION;
    reasons.push("System governance is unavailable, disabled, or has no usable daily capacity.");
  } else if (snapshot.liveCustomerWorkPending || capacityUsedRatio >= 0.9) {
    mode = "CUSTOMER_ONLY";
    allocation = CUSTOMER_ONLY_ALLOCATION;
    reasons.push(snapshot.liveCustomerWorkPending ? "Live customer work is pending." : "At least 90% of governed daily capacity is already used.");
  } else if (capacityUsedRatio >= 0.75) {
    mode = "CONSERVATIVE";
    allocation = CONSERVATIVE_ALLOCATION;
    reasons.push("At least 75% of governed daily capacity is already used.");
  } else {
    mode = "NORMAL";
    allocation = NORMAL_ALLOCATION;
    reasons.push("Spare governed capacity is available for background intelligence growth.");
  }

  const estimatedRepairCostUsd = Math.max(0.005, Number(process.env.MARKETROUTE_G8_REPAIR_ESTIMATED_COST_USD ?? "0.04") || 0.04);
  const backgroundBudgetUsd = snapshot.dailyCostLimitUsd * (allocation.backgroundGrowthPercent / 100);
  const backgroundRemainingUsd = Math.max(0, backgroundBudgetUsd - snapshot.backgroundRepairCostTodayUsd);
  const maximumBackgroundRepairs = mode === "NORMAL" || mode === "CONSERVATIVE"
    ? Math.max(0, Math.min(20, Math.floor(backgroundRemainingUsd / estimatedRepairCostUsd)))
    : 0;

  if (maximumBackgroundRepairs === 0 && allocation.backgroundGrowthPercent > 0) reasons.push("The background-growth share has already been consumed for this governance day.");

  return {
    version: GENESIS_G8_CAPACITY_BUDGET_VERSION,
    mode,
    allocation,
    capacityUsedRatio,
    requestUsedRatio: clamp(requestRatio, 0, 10),
    backgroundBudgetUsd,
    backgroundSpentUsd: snapshot.backgroundRepairCostTodayUsd,
    backgroundRemainingUsd,
    estimatedRepairCostUsd,
    maximumBackgroundRepairs,
    reasons,
    snapshot,
  };
}

export async function runGenesisG8CapacityBudgetCycle(): Promise<GenesisG8CapacityCycleResult> {
  const snapshot = await readGenesisG8CapacitySnapshot();
  const decision = decideGenesisG8Capacity(snapshot);
  if (decision.maximumBackgroundRepairs <= 0) return { ...decision, refresh: null };
  const limit = Math.min(decision.maximumBackgroundRepairs, decision.mode === "CONSERVATIVE" ? 2 : 6);
  const refresh = await runGenesisG8IntelligentBackgroundRefresh({ limit });
  return { ...decision, refresh };
}
