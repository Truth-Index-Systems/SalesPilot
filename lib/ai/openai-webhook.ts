import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

export type OpenAIWebhookEvent = {
  id: string;
  type: "response.completed" | "response.failed" | "response.cancelled" | "response.incomplete" | string;
  created_at: number;
  data: { id: string };
  object?: string;
};

export class OpenAIWebhookSignatureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OpenAIWebhookSignatureError";
  }
}

function requireHeader(headers: Headers, name: string): string {
  const value = headers.get(name);
  if (!value) throw new OpenAIWebhookSignatureError(`Missing required header: ${name}`);
  return value;
}

function decodedWebhookSecret(secret: string): Buffer {
  if (!secret) throw new OpenAIWebhookSignatureError("OPENAI_WEBHOOK_SECRET is not configured");
  return secret.startsWith("whsec_")
    ? Buffer.from(secret.slice("whsec_".length), "base64")
    : Buffer.from(secret, "utf8");
}

/**
 * Mirrors OpenAI's documented webhook verification contract without introducing
 * another SDK/version dependency into the frozen Genesis application.
 */
export async function verifyAndParseOpenAIWebhook(
  rawBody: string,
  headers: Headers,
  options: { secret?: string; toleranceSeconds?: number } = {},
): Promise<OpenAIWebhookEvent> {
  const secret = options.secret ?? process.env.OPENAI_WEBHOOK_SECRET?.trim() ?? "";
  const toleranceSeconds = Math.max(30, options.toleranceSeconds ?? 300);
  const signatureHeader = requireHeader(headers, "webhook-signature");
  const timestamp = requireHeader(headers, "webhook-timestamp");
  const webhookId = requireHeader(headers, "webhook-id");

  const timestampSeconds = Number.parseInt(timestamp, 10);
  if (!Number.isFinite(timestampSeconds)) throw new OpenAIWebhookSignatureError("Invalid webhook timestamp format");
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (nowSeconds - timestampSeconds > toleranceSeconds) throw new OpenAIWebhookSignatureError("Webhook timestamp is too old");
  if (timestampSeconds > nowSeconds + toleranceSeconds) throw new OpenAIWebhookSignatureError("Webhook timestamp is too new");

  const signatures = signatureHeader
    .split(" ")
    .map(part => part.startsWith("v1,") ? part.slice(3) : part)
    .filter(Boolean);
  if (!signatures.length) throw new OpenAIWebhookSignatureError("Webhook signature is empty");

  const signedPayload = `${webhookId}.${timestamp}.${rawBody}`;
  const expected = createHmac("sha256", decodedWebhookSecret(secret)).update(signedPayload, "utf8").digest();

  let valid = false;
  for (const signature of signatures) {
    try {
      const candidate = Buffer.from(signature, "base64");
      if (candidate.length === expected.length && timingSafeEqual(candidate, expected)) {
        valid = true;
        break;
      }
    } catch {
      // Ignore malformed candidate signatures and continue checking the others.
    }
  }
  if (!valid) throw new OpenAIWebhookSignatureError("Webhook signature does not match");

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    throw new OpenAIWebhookSignatureError("Webhook payload is not valid JSON");
  }
  if (!parsed || typeof parsed !== "object") throw new OpenAIWebhookSignatureError("Webhook payload is not an object");
  const event = parsed as Partial<OpenAIWebhookEvent>;
  if (typeof event.id !== "string" || typeof event.type !== "string" || typeof event.created_at !== "number") {
    throw new OpenAIWebhookSignatureError("Webhook event shape is invalid");
  }
  if (!event.data || typeof event.data !== "object" || typeof event.data.id !== "string") {
    throw new OpenAIWebhookSignatureError("Webhook response id is missing");
  }
  return event as OpenAIWebhookEvent;
}
