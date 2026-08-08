import "server-only";
import { requireOrganisationContext } from "@/lib/auth/organisation-context";
import { databaseRequest } from "@/lib/database/postgrest";

export type G5TimelineEntry = {
  id: string;
  occurredAt: string;
  title: string;
  description: string;
  status: "complete" | "active" | "warning" | "blocked";
};

export type G5LiveTimeline = {
  strategyId: string;
  state: string;
  currentTitle: string;
  currentDescription: string;
  isActive: boolean;
  entries: G5TimelineEntry[];
};

type EventRow = {
  id: string;
  event_type: string;
  previous_state: string | null;
  next_state: string | null;
  metadata_json: Record<string, unknown> | null;
  occurred_at: string;
};

type StrategyRow = {
  id: string;
  state: string;
  failure_stage: string | null;
  failure_reason: string | null;
  human_review_action: string | null;
  updated_at: string;
};

type QueueRow = {
  status: string;
  channel_type: string;
  scheduled_for: string | null;
  recipient_timezone: string | null;
  sent_at: string | null;
  last_error: string | null;
  updated_at: string;
};

type HoldRow = {
  reason_code: string;
  reason_message: string;
  last_checked_at: string;
  resolved_at: string | null;
};

function workerName(metadata: Record<string, unknown> | null): string {
  return typeof metadata?.worker === "string" ? metadata.worker : "";
}

function describeEvent(row: EventRow): G5TimelineEntry | null {
  const worker = workerName(row.metadata_json);
  const next = row.next_state ?? "";
  const base = { id: row.id, occurredAt: row.occurred_at, status: "complete" as const };

  if (row.event_type === "CREATED") return { ...base, title: "Engagement strategy started", description: "The approved G4 opportunity has entered Engagement Intelligence." };
  if (row.event_type === "CLAIMED" && (worker === "COMMERCIAL_REASONING" || next === "REASONING")) return { ...base, title: "Building commercial argument", description: "MarketRoute is converting the approved opportunity into an evidence-backed reason to engage." };
  if (row.event_type === "TRANSITIONED" && row.previous_state === "REASONING" && next === "STRATEGY_READY") return { ...base, title: "Commercial argument ready", description: "The commercial problem, consequence, credible outcome and next commitment have been established." };
  if (row.event_type === "CLAIMED" && worker === "CHANNEL_STRATEGY") return { ...base, title: "Selecting strongest engagement route", description: "MarketRoute is choosing the best executable route from G4's already-discovered commercial routes." };
  if (row.event_type === "CHANNEL_STRATEGY_READY") return { ...base, title: "Engagement route selected", description: "The primary, secondary and fallback route strategy is ready." };
  if (row.event_type === "PERSONALISATION_SAFETY_READY") return { ...base, title: "Checking personalisation safety", description: "Verified facts, commercial inferences and prohibited claims have been separated before outreach." };
  if (row.event_type === "CLAIMED" && worker === "OUTREACH_GENERATION") return { ...base, title: "Writing outreach", description: "MarketRoute is preparing channel-specific first-touch outreach for the selected route." };
  if (row.event_type === "TRANSITIONED" && next === "SELF_REVIEW") return { ...base, title: "Outreach drafted", description: "The first-touch message has been generated and moved into mandatory independent review." };
  if (row.event_type === "CLAIMED" && worker === "SELF_REVIEW") return { ...base, title: "Checking evidence and factual accuracy", description: "MarketRoute is reviewing claims, route alignment, tone, clarity, CTA quality and hallucination risk." };
  if (row.event_type === "SELF_REVIEW_REWRITE") return { ...base, title: "Improving outreach", description: "The reviewer found issues and returned the draft for an automatic rewrite." };
  if (row.event_type === "SELF_REVIEW_PASS") return { ...base, title: "Independent review passed", description: "The message passed the mandatory evidence, safety and commercial-quality review." };
  if (row.event_type === "SELF_REVIEW_BLOCK") return { ...base, status: "blocked", title: "Outreach blocked", description: "The independent review found issues that prevent this engagement from progressing." };
  if (row.event_type === "ENGAGEMENT_QUALITY_SCORED") return { ...base, title: "Engagement confidence calculated", description: "MarketRoute has produced the separate, explainable Engagement Confidence score." };
  if (row.event_type === "HUMAN_EDITED") return { ...base, title: "Outreach edited", description: "Your edit has been saved and returned to mandatory self-review and quality scoring." };
  if (row.event_type === "HUMAN_ROUTE_CHANGED") return { ...base, title: "Alternative route selected", description: "The secondary G4 route was selected without rerunning discovery or changing G4 truth." };
  if (row.event_type === "HUMAN_APPROVED") return { ...base, title: "Outreach approved", description: "The reviewed first-touch engagement has been approved for execution." };
  if (row.event_type === "AUTO_APPROVED") return { ...base, title: "Outreach approved automatically", description: "Autopilot approved the engagement after independent review, quality and route-safety gates passed." };
  if (row.event_type === "HUMAN_REJECTED") return { ...base, status: "blocked", title: "Engagement rejected", description: "The engagement was stopped by a workspace user." };
  if (row.event_type === "TRANSITIONED" && row.previous_state === "APPROVED" && next === "QUEUED") return { ...base, title: "Queued for recipient's working day", description: "Execution has been scheduled under the approved route and recipient-local sending policy." };
  if (row.event_type === "TRANSITIONED" && row.previous_state === "QUEUED" && next === "SENT") return { ...base, title: "Outreach sent", description: "The approved first-touch message was accepted by the configured transport." };
  if (row.event_type === "RETRY_SCHEDULED") return { ...base, status: "warning", title: "Automatic retry scheduled", description: "A retryable processing issue occurred. Previous valid intelligence has been preserved." };
  if (row.event_type === "FAILED_TERMINAL") return { ...base, status: "blocked", title: "Engagement stopped", description: "A terminal issue prevented this strategy from progressing." };
  return null;
}

function currentCopy(strategy: StrategyRow, queue: QueueRow | null, hold: HoldRow | null): Pick<G5LiveTimeline, "currentTitle" | "currentDescription" | "isActive"> {
  if (hold && !hold.resolved_at) return { currentTitle: "Execution safely held", currentDescription: hold.reason_message, isActive: false };
  if (queue?.status === "SENDING") return { currentTitle: "Sending approved outreach", currentDescription: "The execution worker currently owns this send attempt.", isActive: true };
  if (queue?.status === "FAILED_RETRYABLE") return { currentTitle: "Transport retry scheduled", currentDescription: queue.last_error || "The same approved message will retry without regeneration.", isActive: true };
  if (queue?.status === "MANUAL_ACTION_REQUIRED") return { currentTitle: "Manual channel ready", currentDescription: `The approved ${queue.channel_type.toLowerCase()} route is ready for a workspace user to execute.`, isActive: false };

  switch (strategy.state) {
    case "WAITING": return { currentTitle: "Waiting to build commercial argument", currentDescription: "The opportunity is queued for Engagement Intelligence.", isActive: true };
    case "REASONING": return { currentTitle: "Building commercial argument", currentDescription: "MarketRoute is determining why to engage, why now and the smallest credible next commitment.", isActive: true };
    case "STRATEGY_READY": return { currentTitle: "Preparing engagement strategy", currentDescription: "The commercial argument is ready and MarketRoute is selecting or preparing the strongest route.", isActive: true };
    case "GENERATING": return { currentTitle: "Writing outreach", currentDescription: "Channel-specific outreach is being generated from the approved commercial strategy.", isActive: true };
    case "SELF_REVIEW": return { currentTitle: "Checking evidence and factual accuracy", currentDescription: "The generated outreach is undergoing mandatory independent review.", isActive: true };
    case "READY_FOR_APPROVAL": return { currentTitle: "Outreach ready for approval", currentDescription: "Commercial reasoning, route strategy, safety review and Engagement Confidence are complete.", isActive: false };
    case "APPROVED": return { currentTitle: "Approved for execution", currentDescription: "The deterministic execution layer is validating route, recipient and sending policy.", isActive: true };
    case "QUEUED": return { currentTitle: "Queued for execution", currentDescription: queue?.scheduled_for ? `Scheduled under ${queue.recipient_timezone || "the recipient timezone"} policy.` : "The approved engagement is waiting for its execution path.", isActive: true };
    case "SENT": return { currentTitle: "Outreach sent", currentDescription: "The first-touch engagement has completed its G5 execution lifecycle.", isActive: false };
    case "FAILED_RETRYABLE": return { currentTitle: "Automatic recovery in progress", currentDescription: strategy.failure_reason || "A retryable issue occurred and the strategy will resume without losing valid intelligence.", isActive: true };
    case "FAILED_TERMINAL": return { currentTitle: "Engagement stopped", currentDescription: strategy.failure_reason || "A terminal issue prevented this engagement from progressing.", isActive: false };
    default: return { currentTitle: "Engagement status", currentDescription: strategy.state.replaceAll("_", " ").toLowerCase(), isActive: false };
  }
}

export async function getG5LiveTimelineForOpportunity(opportunityId: string): Promise<G5LiveTimeline | null> {
  const context = await requireOrganisationContext();
  const strategies = await databaseRequest<StrategyRow[]>(
    `engagement_strategies?organisation_id=eq.${context.organisationId}&opportunity_id=eq.${encodeURIComponent(opportunityId)}&select=id,state,failure_stage,failure_reason,human_review_action,updated_at&limit=1`,
  );
  const strategy = strategies[0];
  if (!strategy) return null;

  const [events, queues, holds] = await Promise.all([
    databaseRequest<EventRow[]>(`engagement_strategy_events?organisation_id=eq.${context.organisationId}&strategy_id=eq.${strategy.id}&select=id,event_type,previous_state,next_state,metadata_json,occurred_at&order=occurred_at.asc`),
    databaseRequest<QueueRow[]>(`g5_engagement_execution_queue?organisation_id=eq.${context.organisationId}&strategy_id=eq.${strategy.id}&select=status,channel_type,scheduled_for,recipient_timezone,sent_at,last_error,updated_at&limit=1`),
    databaseRequest<HoldRow[]>(`g5_engagement_execution_holds?organisation_id=eq.${context.organisationId}&strategy_id=eq.${strategy.id}&resolved_at=is.null&select=reason_code,reason_message,last_checked_at,resolved_at&order=last_checked_at.desc&limit=1`),
  ]);

  const entries = events.map(describeEvent).filter((entry): entry is G5TimelineEntry => Boolean(entry));
  const queue = queues[0] ?? null;
  const hold = holds[0] ?? null;
  const current = currentCopy(strategy, queue, hold);
  return { strategyId: strategy.id, state: strategy.state, ...current, entries };
}
