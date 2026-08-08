import "server-only";
import { randomUUID } from "node:crypto";
import { databaseRequest } from "@/lib/database/postgrest";

const ENDPOINT = "https://api.openai.com/v1/responses";
const TERMINAL_FAILURES = new Set(["failed", "cancelled", "incomplete"]);

type CollectableBackgroundRow = {
  checkpoint_key: string;
  response_id: string;
  status: string;
  collector_lease_token: string;
};

export type BackgroundCollectorResult = {
  claimed: number;
  completed: number;
  pending: number;
  terminal: number;
  failed: number;
  repaired: { reconciledWebhooks: number; releasedCollectorLeases: number; orphanedReservations: number };
};

function collectorTimeoutMs() {
  const raw = Number(process.env.SALESPILOT_AI_BACKGROUND_COLLECT_TIMEOUT_MS ?? "12000");
  return Number.isFinite(raw) ? Math.max(5_000, Math.min(30_000, Math.trunc(raw))) : 12_000;
}

function apiKey() {
  const value = process.env.OPENAI_API_KEY?.trim();
  if (!value) throw new Error("OPENAI_API_KEY_MISSING");
  return value;
}

function responseStatus(value: unknown): string {
  if (!value || typeof value !== "object") return "unknown";
  const status = (value as { status?: unknown }).status;
  return typeof status === "string" ? status : "unknown";
}

function terminalDiagnostic(value: unknown, status: string): string | null {
  if (!TERMINAL_FAILURES.has(status)) return null;
  if (!value || typeof value !== "object") return `OPENAI_BACKGROUND_${status.toUpperCase()}`;
  const row = value as Record<string, unknown>;
  const incomplete = row.incomplete_details && typeof row.incomplete_details === "object" ? row.incomplete_details as Record<string, unknown> : null;
  const reason = incomplete && typeof incomplete.reason === "string" ? incomplete.reason : null;
  const error = row.error && typeof row.error === "object" ? row.error as Record<string, unknown> : null;
  const message = error && typeof error.message === "string" ? error.message : null;
  return [`OPENAI_BACKGROUND_${status.toUpperCase()}`, reason, message].filter(Boolean).join(":").slice(0, 1000);
}

export async function recordOpenAIBackgroundWebhookEvent(event: {
  eventId: string;
  eventType: string;
  responseId: string;
  createdAt: number;
}) {
  return databaseRequest<Array<{ accepted: boolean; duplicate: boolean; matched: boolean }>>(
    "rpc/record_openai_background_webhook_event",
    {
      method: "POST",
      body: JSON.stringify({
        p_event_id: event.eventId,
        p_event_type: event.eventType,
        p_response_id: event.responseId,
        p_created_at: event.createdAt,
      }),
    },
  );
}

export async function collectOpenAIBackgroundResponseById(responseId: string): Promise<"COMPLETED" | "PENDING" | "TERMINAL" | "UNTRACKED"> {
  const tracked = await databaseRequest<Array<{ checkpoint_key: string; status: string }>>(
    `ai_background_responses?response_id=eq.${encodeURIComponent(responseId)}&select=checkpoint_key,status&limit=1`,
  );
  if (!tracked[0]) return "UNTRACKED";

  const response = await fetch(`${ENDPOINT}/${encodeURIComponent(responseId)}`, {
    method: "GET",
    cache: "no-store",
    signal: AbortSignal.timeout(collectorTimeoutMs()),
    headers: { Authorization: `Bearer ${apiKey()}`, "Content-Type": "application/json" },
  });
  const json = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`OPENAI_BACKGROUND_COLLECT_HTTP_${response.status}`);

  const status = responseStatus(json);
  await databaseRequest("rpc/cache_ai_background_response_collection", {
    method: "POST",
    body: JSON.stringify({
      p_response_id: responseId,
      p_status: status,
      p_response_json: status === "completed" || TERMINAL_FAILURES.has(status) ? json : null,
      p_collector_lease_token: null,
      p_error_message: terminalDiagnostic(json, status),
    }),
  });

  if (status === "completed") return "COMPLETED";
  if (TERMINAL_FAILURES.has(status)) return "TERMINAL";
  return "PENDING";
}

async function collectClaim(row: CollectableBackgroundRow): Promise<"COMPLETED" | "PENDING" | "TERMINAL" | "FAILED"> {
  try {
    const response = await fetch(`${ENDPOINT}/${encodeURIComponent(row.response_id)}`, {
      method: "GET",
      cache: "no-store",
      signal: AbortSignal.timeout(collectorTimeoutMs()),
      headers: { Authorization: `Bearer ${apiKey()}`, "Content-Type": "application/json" },
    });
    const json = await response.json().catch(() => null);
    if (!response.ok) throw new Error(`OPENAI_BACKGROUND_COLLECT_HTTP_${response.status}`);
    const status = responseStatus(json);
    await databaseRequest("rpc/cache_ai_background_response_collection", {
      method: "POST",
      body: JSON.stringify({
        p_response_id: row.response_id,
        p_status: status,
        p_response_json: status === "completed" || TERMINAL_FAILURES.has(status) ? json : null,
        p_collector_lease_token: row.collector_lease_token,
        p_error_message: terminalDiagnostic(json, status),
      }),
    });
    if (status === "completed") return "COMPLETED";
    if (TERMINAL_FAILURES.has(status)) return "TERMINAL";
    return "PENDING";
  } catch (error) {
    await databaseRequest("rpc/release_ai_background_collection_lease", {
      method: "POST",
      body: JSON.stringify({
        p_response_id: row.response_id,
        p_collector_lease_token: row.collector_lease_token,
        p_error_message: error instanceof Error ? error.message : "BACKGROUND_COLLECTION_FAILED",
      }),
    }).catch(() => undefined);
    return "FAILED";
  }
}

/** Recovery collector. Webhooks are the primary completion signal; this poller
 * guarantees progress if a webhook is delayed or missed. It never executes an
 * AI stage and never submits new provider work. */
export async function runOpenAIBackgroundCollector(limit = 6): Promise<BackgroundCollectorResult> {
  const leaseOwner = `collector:${process.env.VERCEL_REGION ?? "local"}:${randomUUID()}`;
  const repairRows = await databaseRequest<Array<{reconciled_webhooks:number;released_collector_leases:number;orphaned_reservations:number}>>("rpc/repair_ai_background_observability", { method: "POST", body: "{}" }).catch(() => []);
  const repaired = repairRows[0] ?? { reconciled_webhooks: 0, released_collector_leases: 0, orphaned_reservations: 0 };
  const claims = await databaseRequest<CollectableBackgroundRow[]>("rpc/claim_ai_background_responses_for_collection", {
    method: "POST",
    body: JSON.stringify({ p_limit: Math.max(1, Math.min(12, Math.trunc(limit))), p_lease_owner: leaseOwner, p_lease_seconds: 45 }),
  });

  const summary: BackgroundCollectorResult = { claimed: claims.length, completed: 0, pending: 0, terminal: 0, failed: 0, repaired: { reconciledWebhooks: repaired.reconciled_webhooks, releasedCollectorLeases: repaired.released_collector_leases, orphanedReservations: repaired.orphaned_reservations } };
  const outcomes = await Promise.all(claims.map(row => collectClaim(row)));
  for (const outcome of outcomes) {
    if (outcome === "COMPLETED") summary.completed += 1;
    else if (outcome === "PENDING") summary.pending += 1;
    else if (outcome === "TERMINAL") summary.terminal += 1;
    else summary.failed += 1;
  }
  return summary;
}
