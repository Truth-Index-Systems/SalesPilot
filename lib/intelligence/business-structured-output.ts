import { z } from "zod";
import { AiEnvelopeSchema, type AiEnvelope } from "@/lib/ai/contracts";
import { BusinessDnaPayloadSchema, type BusinessDnaPayload, type CampaignProposal } from "@/lib/ai/schemas/business-dna";

export const BusinessDiscoveryGatewaySchema = z.record(z.unknown());

const envelopeSchema = AiEnvelopeSchema(BusinessDnaPayloadSchema);
type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : null;
}

function text(value: unknown, max: number, fallback = ""): string {
  const cleaned = typeof value === "string" ? value.replace(/\u0000/g, "").replace(/\s+/g, " ").trim() : "";
  return (cleaned || fallback).slice(0, max);
}

function nullableText(value: unknown, max: number): string | null {
  const cleaned = text(value, max);
  return cleaned || null;
}

function strings(value: unknown, maxItems: number, maxLength: number): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(item => text(item, maxLength)).filter(Boolean).slice(0, maxItems);
}

function confidence(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(1, number)) : 0;
}

function score(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(100, Math.round(number))) : 0;
}

function httpUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value.replace(/\u0000/g, "").trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

function isoDate(value: unknown, fallback: string): string {
  if (typeof value === "string") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  return fallback;
}

function canonicalCampaign(value: unknown, index: number): CampaignProposal | null {
  const item = record(value);
  if (!item) return null;
  const name = text(item.name, 180);
  const objective = text(item.objective, 900);
  const audience = text(item.audience, 600);
  const buyerRoles = strings(item.buyerRoles, 12, 180);
  const messageAngle = text(item.messageAngle, 900);
  if (!name || !objective || !audience || !buyerRoles.length || !messageAngle) return null;
  const rawMode = typeof item.recommendedMode === "string" ? item.recommendedMode : "";
  const recommendedMode: CampaignProposal["recommendedMode"] = ["autopilot", "approval", "assisted"].includes(rawMode)
    ? rawMode as CampaignProposal["recommendedMode"]
    : "approval";
  const why = strings(item.why, 10, 500);
  return {
    id: text(item.id, 180, `campaign-${index + 1}`),
    name,
    objective,
    audience,
    buyerRoles,
    messageAngle,
    recommendedMode,
    fitScore: score(item.fitScore),
    confidence: confidence(item.confidence),
    why: why.length ? why : [objective.slice(0, 500)],
    risks: strings(item.risks, 10, 500),
  };
}

function canonicalPayload(value: unknown, canonicalWebsite: string): BusinessDnaPayload {
  const payload = record(value) ?? {};
  const company = record(payload.company) ?? {};
  const offers = (Array.isArray(payload.offers) ? payload.offers : []).map(value => {
    const item = record(value);
    if (!item) return null;
    const name = text(item.name, 180);
    const description = text(item.description, 900);
    if (!name || !description) return null;
    return { name, description, confidence: confidence(item.confidence) };
  }).filter((item): item is NonNullable<typeof item> => Boolean(item));

  const idealCustomers = (Array.isArray(payload.idealCustomers) ? payload.idealCustomers : []).map(value => {
    const item = record(value);
    if (!item) return null;
    const segment = text(item.segment, 240);
    const companySize = text(item.companySize, 180);
    const buyerRoles = strings(item.buyerRoles, 12, 180);
    const pains = strings(item.pains, 12, 500);
    if (!segment || !companySize || !buyerRoles.length || !pains.length) return null;
    return {
      segment,
      industries: strings(item.industries, 12, 180),
      companySize,
      geographies: strings(item.geographies, 12, 180),
      buyerRoles,
      pains,
      confidence: confidence(item.confidence),
    };
  }).filter((item): item is NonNullable<typeof item> => Boolean(item));

  const positioning = record(payload.positioning) ?? {};
  const campaigns = (Array.isArray(payload.campaigns) ? payload.campaigns : [])
    .map((value, index) => canonicalCampaign(value, index))
    .filter((item): item is CampaignProposal => Boolean(item))
    .slice(0, 5);

  const evidenceNotes = (Array.isArray(payload.evidenceNotes) ? payload.evidenceNotes : []).map(value => {
    const item = record(value);
    if (!item) return null;
    const claim = text(item.claim, 800);
    if (!claim) return null;
    return { claim, sourceUrl: httpUrl(item.sourceUrl), excerpt: nullableText(item.excerpt, 500) };
  }).filter((item): item is NonNullable<typeof item> => Boolean(item));

  return BusinessDnaPayloadSchema.parse({
    company: {
      name: text(company.name, 240, new URL(canonicalWebsite).hostname.replace(/^www\./, "")),
      website: canonicalWebsite,
      summary: text(company.summary, 1800, "Public website analysis completed."),
      industry: text(company.industry, 240, "Unknown"),
      businessModel: text(company.businessModel, 900, "Unknown"),
      locations: strings(company.locations, 20, 180),
    },
    offers,
    idealCustomers,
    positioning: {
      strongestValueProposition: text(positioning.strongestValueProposition, 1200, text(company.summary, 1200, "Value proposition requires review.")),
      differentiators: strings(positioning.differentiators, 12, 500),
      proofPoints: strings(positioning.proofPoints, 12, 500),
      likelyObjections: strings(positioning.likelyObjections, 12, 500),
      recommendedTone: strings(positioning.recommendedTone, 8, 180).length ? strings(positioning.recommendedTone, 8, 180) : ["Professional"],
      avoid: strings(positioning.avoid, 12, 500),
    },
    campaigns,
    evidenceNotes,
    unknowns: strings(payload.unknowns, 20, 500),
  });
}

/**
 * Canonicalises mechanically valid Business Discovery JSON without inventing
 * website facts. Trusted runtime metadata (canonical website, model, timestamp)
 * replaces model-supplied transport fields; malformed URLs/dates are removed or
 * normalised and overlong text is clipped before the strict application schema.
 */
export function canonicaliseBusinessDiscoveryOutput(value: unknown, context: { canonicalWebsite: string; model: string; generatedAt: string }): AiEnvelope<BusinessDnaPayload> {
  const root = record(value) ?? {};
  const evidence = (Array.isArray(root.evidence) ? root.evidence : []).map((value, index) => {
    const item = record(value);
    if (!item) return null;
    const sourceTypeRaw = typeof item.sourceType === "string" ? item.sourceType : "";
    const sourceType = ["website", "document", "provider", "user", "system"].includes(sourceTypeRaw) ? sourceTypeRaw : "website";
    return {
      sourceType,
      sourceId: text(item.sourceId, 240, `source-${index + 1}`),
      url: httpUrl(item.url),
      excerpt: nullableText(item.excerpt, 800),
      observedAt: isoDate(item.observedAt, context.generatedAt),
      freshness: ["current", "recent", "stale", "unknown"].includes(String(item.freshness)) ? String(item.freshness) : "unknown",
    };
  }).filter(Boolean);

  return envelopeSchema.parse({
    schemaVersion: "business-dna/v1",
    promptVersion: "business-discovery/v2-executive",
    model: context.model,
    generatedAt: context.generatedAt,
    confidence: confidence(root.confidence),
    warnings: strings(root.warnings, 20, 500),
    evidence,
    payload: canonicalPayload(root.payload, context.canonicalWebsite),
  });
}
