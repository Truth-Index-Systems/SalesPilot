import "server-only";
import { randomUUID } from "node:crypto";
import { runNextCompanyDiscovery } from "@/features/discovery/company-discovery.service";
import { runNextContactDiscovery } from "@/features/contacts/contact-discovery.service";
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
    const contactFoundation = await syncContactDiscoveryFoundations(runId);
    const contactPlan = await planContactDiscoveryDispatch(runId);
    const burstCampaignId = contactPlan.campaign_id;
    const contact = contactPlan.dispatch_count === 0
      ? null
      : contactPlan.dispatch_count > 1 && burstCampaignId
        ? await Promise.all(
            Array.from({ length: contactPlan.dispatch_count }, () =>
              settle(() => runNextContactDiscovery(context, { campaignId: burstCampaignId, freshOnly: true })),
            ),
          )
        : await settle(() => runNextContactDiscovery(context));
    const opportunity = await syncOpportunityFoundations(runId);
    const opportunityScoring = await scoreOpportunityIntelligence(runId);
    const engagement = await buildEngagements(runId);
    const engagementStrategy = await syncEngagementStrategies(runId);
    const engagementLearningGuidance = await syncEngagementLearningGuidance(runId);
    await reconcileEngagementFailures(runId);
    const commercialReasoning = await runNextCommercialReasoning(runId);
    const outreachGeneration = await runNextOutreachGeneration(runId);
    const engagementSelfReview = await runNextEngagementSelfReview(runId);
    const engagementQueue = await buildEngagementSendQueue(runId);
    const engagementLearning = await buildEngagementLearning(runId);
    await recordPipelineSchedulerOutcome(runId, company, contact, { contactFoundation, foundation: opportunity, scoring: opportunityScoring, engagement, engagementStrategy, engagementLearningGuidance, commercialReasoning, outreachGeneration, engagementSelfReview, engagementQueue, engagementLearning });
    return { acquired: true, runId, preparation, company, contactFoundation, contact, opportunity, opportunityScoring, engagement, engagementStrategy, engagementLearningGuidance, commercialReasoning, outreachGeneration, engagementSelfReview, engagementQueue, engagementLearning };
  } finally {
    await releasePipelineSchedulerLease(runId).catch((error) => {
      console.error("Failed to release pipeline scheduler lease", error);
    });
  }
}
