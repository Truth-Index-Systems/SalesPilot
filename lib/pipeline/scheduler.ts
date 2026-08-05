import "server-only";
import { randomUUID } from "node:crypto";
import { runNextCompanyDiscovery } from "@/features/discovery/company-discovery.service";
import { runNextContactDiscovery } from "@/features/contacts/contact-discovery.service";
import {
  acquirePipelineSchedulerLease,
  preparePipelineWork,
  releasePipelineSchedulerLease,
  type SchedulerPreparation,
} from "./repository";

type WorkerResult = { processed: boolean; sessionId?: string; saved?: number };

type SettledWorker =
  | { ok: true; result: WorkerResult }
  | { ok: false; error: string };

export type PipelineSchedulerResult = {
  acquired: boolean;
  runId: string | null;
  preparation: SchedulerPreparation | null;
  company: SettledWorker | null;
  contact: SettledWorker | null;
};

async function settle(work: () => Promise<WorkerResult>): Promise<SettledWorker> {
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
 * eligible jobs. Dispatch is intentionally sequential during stabilisation so
 * one invocation cannot create competing state transitions inside the same
 * campaign at the same time.
 */
export async function runPipelineScheduler(): Promise<PipelineSchedulerResult> {
  const owner = `vercel:${process.env.VERCEL_REGION ?? "local"}:${randomUUID()}`;
  const lease = await acquirePipelineSchedulerLease(owner);
  if (!lease.acquired || !lease.run_id) {
    return { acquired: false, runId: null, preparation: null, company: null, contact: null };
  }

  const runId = lease.run_id;
  try {
    const preparation = await preparePipelineWork(runId);
    const company = await settle(runNextCompanyDiscovery);
    const contact = await settle(runNextContactDiscovery);
    return { acquired: true, runId, preparation, company, contact };
  } finally {
    await releasePipelineSchedulerLease(runId).catch((error) => {
      console.error("Failed to release pipeline scheduler lease", error);
    });
  }
}
