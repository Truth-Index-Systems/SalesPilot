import "server-only";
import { randomUUID } from "node:crypto";
import { runNextCompanyDiscovery } from "@/features/discovery/company-discovery.service";
import { runNextRouteIntelligence } from "@/features/contacts/contact-discovery.service";
import type { WorkerExecutionResult } from "./executor";
import { syncOpportunityFoundations } from "@/lib/opportunities/builder";
import type { OpportunityScoringSummary, OpportunitySyncSummary } from "@/lib/opportunities/domain";
import { scoreOpportunityIntelligence } from "@/lib/opportunities/scoring";
import type { EngagementBuilderResult } from "@/lib/engagement/types";
import { runNextG5CommercialReasoning, type G5CommercialReasoningWorkerResult } from "@/lib/engagement/g5-commercial-reasoning";
import { runNextG5ChannelStrategy, type G5ChannelStrategyWorkerResult } from "@/lib/engagement/g5-channel-strategy";
import { runNextG5OutreachGeneration, type G5OutreachGenerationWorkerResult } from "@/lib/engagement/g5-outreach-generation";
import { runNextG5PersonalisationSafety, type G5PersonalisationSafetyWorkerResult } from "@/lib/engagement/g5-personalisation-safety";
import { runNextG5SelfReview, type G5SelfReviewWorkerResult } from "@/lib/engagement/g5-self-review";
import { runNextG5EngagementQuality, type G5EngagementQualityWorkerResult } from "@/lib/engagement/g5-engagement-quality";
import { runG5ExecutionCycle, type G5ExecutionResult } from "@/lib/engagement/g5-execution";
import { runG5AutopilotApproval, type G5AutopilotApprovalResult } from "@/lib/engagement/g5-autopilot";
import type { EngagementStrategySyncResult, EngagementLearningGuidanceResult } from "@/lib/engagement/strategy";
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
  personalisationSafety: G5PersonalisationSafetyWorkerResult | null;
  outreachGeneration: G5OutreachGenerationWorkerResult | null;
  engagementSelfReview: G5SelfReviewWorkerResult | null;
  engagementQuality: G5EngagementQualityWorkerResult | null;
  autopilotApproval: G5AutopilotApprovalResult | null;
  engagementQueue: G5ExecutionResult | null;
  engagementLearning: EngagementLearningBuilderResult | null;
  parallelExecution: {
    g4: { kind: "ROUTE_INTELLIGENCE" | "COMPANY_DISCOVERY" | "NONE"; attempted: number; results: SettledWorker[] };
    g5: Array<{ stage: "COMMERCIAL_REASONING" | "CHANNEL_STRATEGY" | "OUTREACH_GENERATION" | "SELF_REVIEW" | "NONE"; result: unknown }>;
    limits: { organisationHeavyInFlight: 2; campaignCompanyRouteInFlight: 3; schedulerG4DispatchWidth: number; schedulerG5DispatchWidth: number };
  };
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
 * Runs one bounded dispatcher cycle.
 *
 * Speed R2 boundary: this scheduler dispatches/resumes eligible pipeline stages,
 * but it does not own provider polling. OpenAI response retrieval belongs to the
 * dedicated background collector. Workers consume cached completions only.
 * Speed R3 permits bounded independent dispatch while preserving G4/G5 state authority.
 */
export async function runPipelineScheduler(): Promise<PipelineSchedulerResult> {
  const schedulerStartedAt = Date.now();
  const owner = `vercel:${process.env.VERCEL_REGION ?? "local"}:${randomUUID()}`;
  const lease = await acquirePipelineSchedulerLease(owner, 300);
  if (!lease.acquired || !lease.run_id) {
    return { acquired: false, runId: null, preparation: null, company: null, contactFoundation: null, contact: null, opportunity: null, opportunityScoring: null, engagement: null, engagementStrategy: null, engagementLearningGuidance: null, commercialReasoning: null, channelStrategy: null, personalisationSafety: null, outreachGeneration: null, engagementSelfReview: null, engagementQuality: null, autopilotApproval: null, engagementQueue: null, engagementLearning: null, parallelExecution: { g4: { kind: "NONE", attempted: 0, results: [] }, g5: [], limits: { organisationHeavyInFlight: 2, campaignCompanyRouteInFlight: 3, schedulerG4DispatchWidth: 0, schedulerG5DispatchWidth: 0 } } };
  }

  const runId = lease.run_id;
  try {
    await recoverPipelineJobs(runId);
    const preparation = await preparePipelineWork(runId);
    // Speed R3 controlled parallelism. The DB reservation boundary is the hard
    // authority for per-organisation/per-campaign in-flight limits; these widths
    // only bound how many independent claim attempts one scheduler invocation may
    // launch concurrently.
    const g4DispatchWidth = Math.max(1, Math.min(3, Number(process.env.SALESPILOT_R3_G4_DISPATCH_WIDTH ?? "2") || 2));
    const g5DispatchWidth = Math.max(1, Math.min(3, Number(process.env.SALESPILOT_R3_G5_DISPATCH_WIDTH ?? "2") || 2));

    const contactFoundation = await syncContactDiscoveryFoundations(runId);
    const contactPlan = await planContactDiscoveryDispatch(runId);
    const routeDue = contactPlan.dispatch_count > 0 && contactPlan.mode !== "BUDGET_BLOCKED";
    const context = { schedulerRunId: runId };

    async function runG4Batch(): Promise<{ kind: "ROUTE_INTELLIGENCE" | "COMPANY_DISCOVERY" | "NONE"; results: SettledWorker[] }> {
      if (!hasSchedulerBudget(schedulerStartedAt, 45_000)) return { kind: "NONE", results: [] };
      if (routeDue) {
        const width = Math.min(g4DispatchWidth, Math.max(1, contactPlan.dispatch_count));
        const results = await Promise.all(Array.from({ length: width }, () => settle(() => runNextRouteIntelligence(
          context,
          contactPlan.campaign_id ? { campaignId: contactPlan.campaign_id } : {},
        ))));
        return { kind: "ROUTE_INTELLIGENCE", results };
      }
      const results = await Promise.all(Array.from({ length: g4DispatchWidth }, () => settle(() => runNextCompanyDiscovery(context))));
      return { kind: "COMPANY_DISCOVERY", results };
    }

    type G5LaneResult = {
      stage: "COMMERCIAL_REASONING" | "CHANNEL_STRATEGY" | "OUTREACH_GENERATION" | "SELF_REVIEW" | "NONE";
      result: G5CommercialReasoningWorkerResult | G5ChannelStrategyWorkerResult | G5OutreachGenerationWorkerResult | G5SelfReviewWorkerResult | null;
    };

    async function runG5Lane(): Promise<G5LaneResult> {
      if (!hasSchedulerBudget(schedulerStartedAt, 45_000)) return { stage: "NONE", result: null };
      const reasoning = await runNextG5CommercialReasoning(runId);
      if (reasoning.outcome !== "NO_JOB") return { stage: "COMMERCIAL_REASONING", result: reasoning };
      const channel = await runNextG5ChannelStrategy(runId);
      if (channel.outcome !== "NO_JOB") return { stage: "CHANNEL_STRATEGY", result: channel };
      const outreach = await runNextG5OutreachGeneration(runId);
      if (outreach.outcome !== "NO_JOB") return { stage: "OUTREACH_GENERATION", result: outreach };
      const review = await runNextG5SelfReview(runId);
      if (review.outcome !== "NO_JOB") return { stage: "SELF_REVIEW", result: review };
      return { stage: "NONE", result: null };
    }

    // Independent G4 research and already-eligible G5 engagement work dispatch in
    // parallel. State-machine claims + AI reservation caps remain authoritative.
    const [g4Batch, g5Lanes] = await Promise.all([
      runG4Batch(),
      Promise.all(Array.from({ length: g5DispatchWidth }, () => runG5Lane())),
    ]);

    const companyResults = g4Batch.kind === "COMPANY_DISCOVERY" ? g4Batch.results : [];
    const routeResults = g4Batch.kind === "ROUTE_INTELLIGENCE" ? g4Batch.results : [];
    const company: SettledWorker | null = companyResults[0] ?? null;
    const contact: SettledWorker | SettledWorker[] | null = routeResults.length > 1 ? routeResults : (routeResults[0] ?? null);

    // Cheap deterministic assembly follows dispatch. Newly submitted background
    // jobs will naturally become eligible on webhook/collector completion.
    const opportunity = hasSchedulerBudget(schedulerStartedAt, 8_000) ? await syncOpportunityFoundations(runId) : null;
    const opportunityScoring = opportunity && hasSchedulerBudget(schedulerStartedAt, 8_000)
      ? await scoreOpportunityIntelligence(runId)
      : null;
    const engagement: EngagementBuilderResult | null = null;
    const engagementStrategy: EngagementStrategySyncResult | null = null;
    const engagementLearningGuidance: EngagementLearningGuidanceResult | null = null;

    // R5 remains deterministic and may progress independently of heavyweight AI.
    const personalisationSafety = hasSchedulerBudget(schedulerStartedAt, 8_000)
      ? await runNextG5PersonalisationSafety(runId)
      : null;

    const commercialReasoning = (g5Lanes.find(x => x.stage === "COMMERCIAL_REASONING")?.result as G5CommercialReasoningWorkerResult | undefined) ?? null;
    const channelStrategy = (g5Lanes.find(x => x.stage === "CHANNEL_STRATEGY")?.result as G5ChannelStrategyWorkerResult | undefined) ?? null;
    const outreachGeneration = (g5Lanes.find(x => x.stage === "OUTREACH_GENERATION")?.result as G5OutreachGenerationWorkerResult | undefined) ?? null;
    const engagementSelfReview = (g5Lanes.find(x => x.stage === "SELF_REVIEW")?.result as G5SelfReviewWorkerResult | undefined) ?? null;
    // R7 is deterministic and runs only after R6 has produced READY_FOR_APPROVAL.
    // It never reuses Opportunity Score and never changes the R6 PASS decision.
    const engagementQuality: G5EngagementQualityWorkerResult | null = hasSchedulerBudget(schedulerStartedAt, 8_000)
      ? await runNextG5EngagementQuality(runId)
      : null;
    // R12 deterministic Autopilot approval. It never calls AI and only acts on
    // campaigns explicitly configured as AUTOPILOT after R6 PASS + R7 quality.
    // Assisted/Approval campaigns remain READY_FOR_APPROVAL for a human.
    const autopilotApproval: G5AutopilotApprovalResult | null = hasSchedulerBudget(schedulerStartedAt, 8_000)
      ? await runG5AutopilotApproval(runId)
      : null;
    // R9 deterministic execution: approval is converted to a durable queue item,
    // then a due email may execute only inside the recipient-local 08:00-18:00 window.
    // Transport failure never regenerates reviewed content.
    const engagementQueue: G5ExecutionResult | null = hasSchedulerBudget(schedulerStartedAt, 8_000)
      ? await runG5ExecutionCycle(runId)
      : null;
    // Legacy G4 learning is frozen. R11 records factual G5 events; learning is deferred to G6/G7.
    const engagementLearning: EngagementLearningBuilderResult | null = null;

    const parallelExecution = {
      g4: { kind: g4Batch.kind, attempted: g4Batch.results.length, results: g4Batch.results },
      g5: g5Lanes,
      limits: { organisationHeavyInFlight: 2 as const, campaignCompanyRouteInFlight: 3 as const, schedulerG4DispatchWidth: g4DispatchWidth, schedulerG5DispatchWidth: g5DispatchWidth },
    };

    await recordPipelineSchedulerOutcome(runId, g4Batch.kind === "COMPANY_DISCOVERY" ? g4Batch.results : company, g4Batch.kind === "ROUTE_INTELLIGENCE" ? g4Batch.results : contact, {
      speedR3: parallelExecution,
      contactFoundation,
      foundation: opportunity,
      scoring: opportunityScoring,
      engagement,
      engagementStrategy,
      engagementLearningGuidance,
      commercialReasoning,
      channelStrategy,
      personalisationSafety,
      outreachGeneration,
      engagementSelfReview,
      engagementQuality,
      autopilotApproval,
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
      personalisationSafety,
      outreachGeneration,
      engagementSelfReview,
      engagementQuality,
      autopilotApproval,
      engagementQueue,
      engagementLearning,
      parallelExecution,
    };
  } finally {
    await releasePipelineSchedulerLease(runId).catch((error) => {
      console.error("Failed to release pipeline scheduler lease", error);
    });
  }
}
