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
import { runNextCommercialReasoning, type CommercialReasoningWorkerResult } from "@/lib/engagement/commercial-reasoning";
import { runNextOutreachGeneration, type OutreachGenerationWorkerResult } from "@/lib/engagement/outreach-generation";
import { runNextEngagementSelfReview, type EngagementSelfReviewWorkerResult } from "@/lib/engagement/self-review";
import { buildEngagementSendQueue, type EngagementQueueBuilderResult } from "@/lib/engagement/queue-builder";
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
  commercialReasoning: CommercialReasoningWorkerResult | null;
  outreachGeneration: OutreachGenerationWorkerResult | null;
  engagementSelfReview: EngagementSelfReviewWorkerResult | null;
  engagementQueue: EngagementQueueBuilderResult | null;
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
  const lease = await acquirePipelineSchedulerLease(owner);
  if (!lease.acquired || !lease.run_id) {
    return { acquired: false, runId: null, preparation: null, company: null, contactFoundation: null, contact: null, opportunity: null, opportunityScoring: null, engagement: null, engagementStrategy: null, engagementLearningGuidance: null, commercialReasoning: null, outreachGeneration: null, engagementSelfReview: null, engagementQueue: null, engagementLearning: null };
  }

  const runId = lease.run_id;
  try {
    await recoverPipelineJobs(runId);
    const preparation = await preparePipelineWork(runId);
    const context = { schedulerRunId: runId };
    const company = await settle(() => runNextCompanyDiscovery(context));

    // A long Company Discovery pass may legitimately consume most of the cron
    // invocation while verifying many official sites. Never begin another stage
    // once we have entered the safety reserve: persist the scheduler outcome and
    // release the lease so the next minute can resume from durable state.
    if (!hasSchedulerBudget(schedulerStartedAt, 8_000)) {
      console.info("Pipeline scheduler ended cleanly after Company Discovery due to execution budget", {
        runId,
        remainingBudgetMs: remainingSchedulerBudgetMs(schedulerStartedAt),
      });
      await recordPipelineSchedulerOutcome(runId, company, null, {
        contactFoundation: null,
        foundation: null,
        scoring: null,
        engagement: null,
        engagementStrategy: null,
        engagementLearningGuidance: null,
        commercialReasoning: null,
        outreachGeneration: null,
        engagementSelfReview: null,
        engagementQueue: null,
        engagementLearning: null,
      });
      return {
        acquired: true, runId, preparation, company, contactFoundation: null, contact: null,
        opportunity: null, opportunityScoring: null, engagement: null, engagementStrategy: null,
        engagementLearningGuidance: null, commercialReasoning: null, outreachGeneration: null,
        engagementSelfReview: null, engagementQueue: null, engagementLearning: null,
      };
    }

    const contactFoundation = await syncContactDiscoveryFoundations(runId);
    const contactPlan = await planContactDiscoveryDispatch(runId);
    const burstCampaignId = contactPlan.campaign_id;
    // G4.7 first-pass Route Intelligence is intentionally deep. Running several
    // web-research jobs in parallel causes correlated OpenAI/Vercel timeouts and
    // lowers route quality. Execute one deep route investigation per scheduler
    // cycle; subsequent cron cycles pick up the remaining companies immediately.
    const canStartRouteIntelligence = contactPlan.dispatch_count > 0
      && hasSchedulerBudget(schedulerStartedAt, ROUTE_INTELLIGENCE_START_BUDGET_MS);
    if (contactPlan.dispatch_count > 0 && !canStartRouteIntelligence) {
      console.info("Pipeline scheduler deferred Route Intelligence to the next cron cycle", {
        runId,
        remainingBudgetMs: remainingSchedulerBudgetMs(schedulerStartedAt),
        requiredBudgetMs: ROUTE_INTELLIGENCE_START_BUDGET_MS,
      });
    }
    const contact = !canStartRouteIntelligence
      ? null
      : await settle(() => runNextRouteIntelligence(
          context,
          burstCampaignId ? { campaignId: burstCampaignId, freshOnly: true } : {},
        ));

    // These deterministic/database-only stages are cheap and safe to run after a
    // completed heavy worker provided the scheduler still has its safety reserve.
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

    const commercialReasoning = hasSchedulerBudget(schedulerStartedAt, ENGAGEMENT_AI_START_BUDGET_MS)
      ? await runNextCommercialReasoning(runId)
      : null;
    const outreachGeneration = hasSchedulerBudget(schedulerStartedAt, ENGAGEMENT_AI_START_BUDGET_MS)
      ? await runNextOutreachGeneration(runId)
      : null;
    const engagementSelfReview = hasSchedulerBudget(schedulerStartedAt, ENGAGEMENT_AI_START_BUDGET_MS)
      ? await runNextEngagementSelfReview(runId)
      : null;
    const engagementQueue = hasSchedulerBudget(schedulerStartedAt, 8_000) ? await buildEngagementSendQueue(runId) : null;
    const engagementLearning = hasSchedulerBudget(schedulerStartedAt, 8_000) ? await buildEngagementLearning(runId) : null;
    await recordPipelineSchedulerOutcome(runId, company, contact, { contactFoundation, foundation: opportunity, scoring: opportunityScoring, engagement, engagementStrategy, engagementLearningGuidance, commercialReasoning, outreachGeneration, engagementSelfReview, engagementQueue, engagementLearning });
    return { acquired: true, runId, preparation, company, contactFoundation, contact, opportunity, opportunityScoring, engagement, engagementStrategy, engagementLearningGuidance, commercialReasoning, outreachGeneration, engagementSelfReview, engagementQueue, engagementLearning };
  } finally {
    await releasePipelineSchedulerLease(runId).catch((error) => {
      console.error("Failed to release pipeline scheduler lease", error);
    });
  }
}
