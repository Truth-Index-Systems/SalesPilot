import { NextResponse } from "next/server";
import { verifyAndParseOpenAIWebhook, OpenAIWebhookSignatureError } from "@/lib/ai/openai-webhook";
import { collectOpenAIBackgroundResponseById, recordOpenAIBackgroundWebhookEvent } from "@/lib/ai/background-collector";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const RESPONSE_EVENTS = new Set(["response.completed", "response.failed", "response.cancelled", "response.incomplete"]);

export async function POST(request: Request) {
  const rawBody = await request.text();
  try {
    const event = await verifyAndParseOpenAIWebhook(rawBody, request.headers);
    if (!RESPONSE_EVENTS.has(event.type)) return NextResponse.json({ ok: true, ignored: true });

    const result = await recordOpenAIBackgroundWebhookEvent({
      eventId: event.id,
      eventType: event.type,
      responseId: event.data.id,
      createdAt: event.created_at,
    });
    const recorded = result[0] ?? { accepted: true, duplicate: false, matched: false };

    // For successful completions, opportunistically collect the already-finished
    // response now. If provider retrieval is briefly unavailable, the dedicated
    // recovery collector will retry without making webhook delivery fail.
    let collection: string | null = null;
    if (event.type === "response.completed" && recorded.matched) {
      collection = await collectOpenAIBackgroundResponseById(event.data.id).catch(error => {
        console.warn("OpenAI webhook completion collection deferred", {
          responseId: event.data.id,
          error: error instanceof Error ? error.message : "COLLECTION_FAILED",
        });
        return "DEFERRED";
      });
    }

    return NextResponse.json({ ok: true, duplicate: recorded.duplicate, matched: recorded.matched, collection });
  } catch (error) {
    if (error instanceof OpenAIWebhookSignatureError) {
      console.warn("Rejected OpenAI webhook", { reason: error.message });
      return NextResponse.json({ ok: false, error: "INVALID_WEBHOOK_SIGNATURE" }, { status: 400 });
    }
    console.error("OpenAI webhook ingestion failed", error);
    return NextResponse.json({ ok: false, error: "WEBHOOK_INGESTION_FAILED" }, { status: 500 });
  }
}
