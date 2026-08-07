import "server-only";
import { randomUUID } from "node:crypto";
import { runNextCompanyDiscovery } from "@/features/discovery/company-discovery.service";
import { runNextRouteIntelligence } from "@/features/contacts/contact-discovery.service";
import type { WorkerExecutionResult } from "./executor";
import { syncOpportunityFoundations } from "@/lib/opportunities/builder";
import type { OpportunityScoringSummary, OpportunitySyncSummary } from "@/lib/opportunities/domain";
import { scoreOpportunityIntelligence } from "@/lib/opportunities/scoring";
import { buildEngagements } from "@/lib/engagement/builder";
import type { EngagementBuilderResult } from "@/lib/engagement/types";
import { runNextG5CommercialReasoning, type G5CommercialReasoningWorkerResult } from "@/lib/engagement/g5-commercial-reasoning";
import { runNextG5ChannelStrategy, type G5ChannelStrategyWorkerResult } from "@/lib/engagement/g5-channel-strategy";
import { buildEngagementLearning } from "@/lib/learning/service";
import { syncEngagementStrategies, syncEngagementLearningGuidance, reconcileEngagementFailures, type EngagementStrategySyncResult, type EngagementLearningGuidanceResult } from "@/lib/engagement/strategy";
import type { EngagementLearningBuilderResult } from "@/lib/learning/types";
import {
  acquirePipelineSchedulerLease,
  preparePipelineWork,
  releasePipelineSchedulerLease,
  type SchedulerPreparation,
  recordPipelineSchedulerOutcome,
  recoverPipelineJobs,
  planContactDiscoveryDispatch,
  syncContactDiscoveryFoundations,
  type ContactFoundationSync,
} from "./repository";

type SettledWorker =
  | { ok: true; result: WorkerExecutionResult }
  | { ok: false; error: string };

// Vercel terminates this route at 300 seconds. Keep a hard safety reserve for
// outcome persistence and lease release, and never claim a heavyweight worker
// unless there is enough wall-clock budget for its own abort envelope.
const SCHEDULER_HARD_LIMIT_MS = 300_000;
const SCHEDULER_SAFETY_RESERVE_MS = 25_000;
const ROUTE_INTELLIGENCE_START_BUDGET_MS = 245_000;
const ENGAGEMENT_AI_START_BUDGET_MS = 130_000;

function remainingSchedulerBudgetMs(startedAt: number): number {
  return Math.max(0, SCHEDULER_HARD_LIMIT_MS - SCHEDULER_SAFETY_RESERVE_MS - (Date.now() - startedAt));
}

function hasSchedulerBudget(startedAt: number, requiredMs: number): boolean {
  return remainingSchedulerBudgetMs(startedAt) >= requiredMs;
}

export type PipelineSchedulerResult = {
  acquired: boolean;
  runId: string | null;
  preparation: SchedulerPreparation | null;
  company: SettledWorker | null;
  contactFoundation: ContactFoundationSync | null;
  contact: SettledWorker | SettledWorker[] | null;
  opportunity: OpportunitySyncSummary | null;
  opportunityScoring: OpportunityScoringSummary | null;
  engagement: EngagementBuilderResult | null;
  engagementStrategy: EngagementStrategySyncResult | null;
  engagementLearningGuidance: EngagementLearningGuidanceResult | null;
  commercialReasoning: G5CommercialReasoningWorkerResult | null;
  channelStrategy: G5ChannelStrategyWorkerResult | null;
  outreachGeneration: null;
  engagementSelfReview: null;
  engagementQueue: null;
  engagementLearning: EngagementLearningBuilderResult | null;
};

async function settle(work: () => Promise<WorkerExecutionResult>): Promise<SettledWorker> {
  try {
    return { ok: true, result: await work() };
  } catch (error) {
    console.error("Autonomous pipeline worker failed", error);
    return { ok: false, error: error instanceof Error ? error.message : "PIPELINE_WORKER_FAILED" };
  }
}

/**
 * Runs one bounded scheduler cycle.
 *
 * The scheduler owns work evaluation. Workers only claim and execute already
 * eligible jobs. Normal contact work remains sequential. A campaign may receive
 * one persisted, budget-aware initial burst of fresh contact jobs.
 */
export async function runPipelineScheduler(): Promise<PipelineSchedulerResult> {
  const schedulerStartedAt = Date.now();
  const owner = `vercel:${process.env.VERCEL_REGION ?? "local"}:${randomUUID()}`;
  const lease = await acquirePipelineSchedulerLease(owner, 300);
  if (!lease.acquired || !lease.run_id) {
    return { acquired: false, runId: null, preparation: null, company: null, contactFoundation: null, contact: null, opportunity: null, opportunityScoring: null, engagement: null, engagementStrategy: null, engagementLearningGuidance: null, commercialReasoning: null, channelStrategy: null, outreachGeneration: null, engagementSelfReview: null, engagementQueue: null, engagementLearning: null };
  }

  const runId = lease.run_id;
  try {
    await recoverPipelineJobs(runId);
    const preparation = await preparePipelineWork(runId);
    const context = { schedulerRunId: runId };

    // G4.7.8 fairness rule: approved companies awaiting Route Intelligence are
    // customer-committed work and take priority over speculative company
    // replenishment. Sync the route foundations before choosing the heavyweight
    // worker for this cron cycle. This prevents Company Discovery from consuming
    // every fresh execution window and silently starving Route Intelligence.
    const contactFoundation = await syncContactDiscoveryFoundations(runId);
    const contactPlan = await planContactDiscoveryDispatch(runId);
    const routeDue = contactPlan.dispatch_count > 0 && contactPlan.mode !== "BUDGET_BLOCKED";
    const canStartRouteIntelligence = routeDue
      && hasSchedulerBudget(schedulerStartedAt, ROUTE_INTELLIGENCE_START_BUDGET_MS);

    let company: SettledWorker | null = null;
    let contact: SettledWorker | SettledWorker[] | null = null;

    // one deep route investigation per scheduler cycle; never parallelise the heavyweight first pass.
    if (canStartRouteIntelligence) {
      console.info("Pipeline scheduler prioritising Route Intelligence over company replenishment", {
        runId,
        campaignId: contactPlan.campaign_id,
        remainingBudgetMs: remainingSchedulerBudgetMs(schedulerStartedAt),
      });
      contact = await settle(() => runNextRouteIntelligence(
        context,
        contactPlan.campaign_id ? { campaignId: contactPlan.campaign_id } : {},
      ));
    } else {
      if (routeDue) {
        console.info("Pipeline scheduler deferred Route Intelligence due to execution budget", {
          runId,
          remainingBudgetMs: remainingSchedulerBudgetMs(schedulerStartedAt),
          requiredBudgetMs: ROUTE_INTELLIGENCE_START_BUDGET_MS,
        });
      }

      // Only spend the heavyweight slot on Company Discovery when no runnable
      // Route Intelligence work is waiting. This keeps discovery autonomous while
      // ensuring approved companies can never be starved by replenishment.
      if (!routeDue) {
        company = await settle(() => runNextCompanyDiscovery(context));
      }
    }

    // Never chain a second heavyweight worker in the same invocation. A route
    // cycle and a company-discovery cycle each get a fresh serverless budget.
    // Cheap deterministic assembly may continue when the safety reserve permits.
    const opportunity = hasSchedulerBudget(schedulerStartedAt, 8_000) ? await syncOpportunityFoundations(runId) : null;
    const opportunityScoring = opportunity && hasSchedulerBudget(schedulerStartedAt, 8_000)
      ? await scoreOpportunityIntelligence(runId)
      : null;
    const engagement = hasSchedulerBudget(schedulerStartedAt, 8_000) ? await buildEngagements(runId) : null;
    const engagementStrategy = engagement && hasSchedulerBudget(schedulerStartedAt, 8_000)
      ? await syncEngagementStrategies(runId)
      : null;
    const engagementLearningGuidance = engagement && hasSchedulerBudget(schedulerStartedAt, 8_000)
      ? await syncEngagementLearningGuidance(runId)
      : null;
    if (engagement && hasSchedulerBudget(schedulerStartedAt, 8_000)) await reconcileEngagementFailures(runId);

    // G5 owns engagement intelligence from the approved Opportunity boundary onward.
    // Run at most ONE G5 AI worker per scheduler cycle. R2 gets first refusal for
    // WAITING opportunities; when there is no reasoning job, R3 may enrich an
    // existing STRATEGY_READY record with its fenced channel decision. This avoids
    // chaining two 120-second AI envelopes inside one serverless invocation.
    const commercialReasoning = hasSchedulerBudget(schedulerStartedAt, ENGAGEMENT_AI_START_BUDGET_MS)
      ? await runNextG5CommercialReasoning(runId)
      : null;
    const channelStrategy = hasSchedulerBudget(schedulerStartedAt, ENGAGEMENT_AI_START_BUDGET_MS)
      && (!commercialReasoning || !commercialReasoning.processed)
      ? await runNextG5ChannelStrategy(runId)
      : null;
    // R3 intentionally stops at STRATEGY_READY with channel_strategy_json persisted.
    // Release 4 will claim STRATEGY_READY -> GENERATING only after this decision exists.
    const outreachGeneration = null;
    const engagementSelfReview = null;
    const engagementQueue = null;
    const engagementLearning = hasSchedulerBudget(schedulerStartedAt, 8_000) ? await buildEngagementLearning(runId) : null;

    await recordPipelineSchedulerOutcome(runId, company, contact, {
      contactFoundation,
      foundation: opportunity,
      scoring: opportunityScoring,
      engagement,
      engagementStrategy,
      engagementLearningGuidance,
      commercialReasoning,
      channelStrategy,
      outreachGeneration,
      engagementSelfReview,
      engagementQueue,
      engagementLearning,
    });

    return {
      acquired: true,
      runId,
      preparation,
      company,
      contactFoundation,
      contact,
      opportunity,
      opportunityScoring,
      engagement,
      engagementStrategy,
      engagementLearningGuidance,
      commercialReasoning,
      channelStrategy,
      outreachGeneration,
      engagementSelfReview,
      engagementQueue,
      engagementLearning,
    };
  } finally {
    await releasePipelineSchedulerLease(runId).catch((error) => {
      console.error("Failed to release pipeline scheduler lease", error);
    });
  }
}
