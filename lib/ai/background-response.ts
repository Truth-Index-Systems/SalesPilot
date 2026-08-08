import "server-only";
import { createHash } from "node:crypto";
import { databaseRequest } from "@/lib/database/postgrest";
import type { AiJobType } from "@/lib/ai/governance";
import type { AiRequestTask } from "@/lib/ai/request-policy";

const ENDPOINT = "https://api.openai.com/v1/responses";

type BackgroundRow = {
  checkpoint_key: string;
  response_id: string;
  status: string;
  ledger_id: string;
  response_json: unknown | null;
  created_at: string;
};

export class OpenAIBackgroundPendingError extends Error {
  readonly responseId: string;
  readonly task: AiRequestTask;
  readonly status: string;
  constructor(task: AiRequestTask, responseId: string, status: string) {
    super(`OPENAI_BACKGROUND_PENDING:${task}:${responseId}:${status}`);
    this.name = "OpenAIBackgroundPendingError";
    this.task = task;
    this.responseId = responseId;
    this.status = status;
  }
}

export function isOpenAIBackgroundPending(error: unknown): error is OpenAIBackgroundPendingError {
  return error instanceof OpenAIBackgroundPendingError || (error instanceof Error && error.message.startsWith("OPENAI_BACKGROUND_PENDING:"));
}

function checkpointKey(input: { organisationId: string | null; campaignId?: string | null; jobType: AiJobType; jobId?: string | null; requestScope: string }) {
  return createHash("sha256").update([
    input.organisationId ?? "anonymous",
    input.campaignId ?? "none",
    input.jobType,
    input.jobId ?? "none",
    input.requestScope,
  ].join(":"), "utf8").digest("hex");
}

function submitTimeoutMs() {
  const raw = Number(process.env.SALESPILOT_AI_BACKGROUND_SUBMIT_TIMEOUT_MS ?? "30000");
  return Number.isFinite(raw) ? Math.max(10_000, Math.min(60_000, Math.trunc(raw))) : 30_000;
}

function pollTimeoutMs() {
  const raw = Number(process.env.SALESPILOT_AI_BACKGROUND_POLL_TIMEOUT_MS ?? "20000");
  return Number.isFinite(raw) ? Math.max(5_000, Math.min(45_000, Math.trunc(raw))) : 20_000;
}

function pendingStatus(value: unknown) {
  return value === "queued" || value === "in_progress";
}

function responseStatus(value: unknown): string {
  if (!value || typeof value !== "object") return "unknown";
  return typeof (value as { status?: unknown }).status === "string" ? String((value as { status: string }).status) : "unknown";
}

function responseId(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  return typeof (value as { id?: unknown }).id === "string" ? String((value as { id: string }).id) : null;
}

async function getCheckpoint(key: string): Promise<BackgroundRow | null> {
  const rows = await databaseRequest<BackgroundRow[]>(`ai_background_responses?checkpoint_key=eq.${encodeURIComponent(key)}&select=checkpoint_key,response_id,status,ledger_id,response_json,created_at&limit=1`);
  return rows[0] ?? null;
}

async function saveCheckpoint(params: {
  checkpointKey: string;
  organisationId: string | null;
  campaignId?: string | null;
  jobType: AiJobType;
  jobId?: string | null;
  task: AiRequestTask;
  requestScope: string;
  model: string;
  responseId: string;
  status: string;
  ledgerId: string;
  responseJson?: unknown | null;
}) {
  await databaseRequest("rpc/upsert_ai_background_response", {
    method: "POST",
    body: JSON.stringify({
      p_checkpoint_key: params.checkpointKey,
      p_organisation_id: params.organisationId,
      p_campaign_id: params.campaignId ?? null,
      p_job_type: params.jobType,
      p_job_id: params.jobId ?? null,
      p_task: params.task,
      p_request_scope: params.requestScope,
      p_model: params.model,
      p_response_id: params.responseId,
      p_status: params.status,
      p_ledger_id: params.ledgerId,
      p_response_json: params.responseJson ?? null,
    }),
  });
}

async function clearCheckpoint(key: string) {
  await databaseRequest("rpc/delete_ai_background_response", { method: "POST", body: JSON.stringify({ p_checkpoint_key: key }) }).catch(() => undefined);
}

function syntheticResponse(json: unknown, status = 200): Response {
  return new Response(JSON.stringify(json ?? null), { status, headers: { "content-type": "application/json" } });
}

export async function fetchResumableOpenAIResponse(params: {
  apiKey: string;
  task: AiRequestTask;
  organisationId: string | null;
  campaignId?: string | null;
  jobType: AiJobType;
  jobId?: string | null;
  requestScope: string;
  model: string;
  ledgerId: string;
}, init: RequestInit): Promise<Response> {
  const parsedBody = typeof init.body === "string" ? JSON.parse(init.body) as Record<string, unknown> : {};
  const key = checkpointKey(params);
  const existing = await getCheckpoint(key);

  if (existing?.response_json) return syntheticResponse(existing.response_json, 200);

  let json: unknown;
  let id: string | null = existing?.response_id ?? null;

  if (id) {
    const response = await fetch(`${ENDPOINT}/${encodeURIComponent(id)}`, {
      method: "GET",
      cache: "no-store",
      signal: AbortSignal.timeout(pollTimeoutMs()),
      headers: { Authorization: `Bearer ${params.apiKey}`, "Content-Type": "application/json" },
    });
    json = await response.json().catch(() => null);
    if (!response.ok) {
      if (response.status === 404) await clearCheckpoint(key);
      return syntheticResponse(json, response.status);
    }
  } else {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      cache: "no-store",
      signal: AbortSignal.timeout(submitTimeoutMs()),
      headers: { Authorization: `Bearer ${params.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ...parsedBody, background: true, store: false }),
    });
    json = await response.json().catch(() => null);
    if (!response.ok) return syntheticResponse(json, response.status);
    id = responseId(json);
    if (!id) return syntheticResponse({ error: { message: "Background response did not return an id" } }, 502);
  }

  const status = responseStatus(json);
  if (!id) return syntheticResponse({ error: { message: "Background response id missing" } }, 502);

  if (pendingStatus(status)) {
    await saveCheckpoint({ ...params, checkpointKey: key, responseId: id, status, responseJson: null });
    throw new OpenAIBackgroundPendingError(params.task, id, status);
  }

  if (status === "completed") {
    await saveCheckpoint({ ...params, checkpointKey: key, responseId: id, status, responseJson: json });
    return syntheticResponse(json, 200);
  }

  // Terminal non-success responses should be retriable by the owning stage. Clear
  // the checkpoint so its next scheduled attempt can submit a fresh background run.
  await clearCheckpoint(key);
  return syntheticResponse(json, 502);
}

export async function discardOpenAIBackgroundResponse(params: {
  organisationId: string | null;
  campaignId?: string | null;
  jobType: AiJobType;
  jobId?: string | null;
  requestScope: string;
}) {
  await clearCheckpoint(checkpointKey(params));
}
