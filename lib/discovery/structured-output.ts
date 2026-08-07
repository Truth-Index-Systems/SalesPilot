import { z } from "zod";
import { CompanyDiscoveryResultSchema, type DiscoveredCompany } from "./schemas";

export const CompanyDiscoveryGatewaySchema = z.record(z.unknown());

type JsonRecord = Record<string, unknown>;

const MATCH_LABELS = new Set(["Strongest match", "Strong match", "Good match"]);

function record(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : null;
}

function text(value: unknown, max: number, fallback = ""): string {
  const cleaned = typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  return (cleaned || fallback).slice(0, max);
}

function nullableText(value: unknown, max: number): string | null {
  const cleaned = text(value, max);
  return cleaned || null;
}

function score(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(100, Math.round(number))) : 0;
}

function httpUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

function strings(value: unknown, maxItems: number, maxLength: number): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(item => text(item, maxLength)).filter(Boolean).slice(0, maxItems);
}

function canonicalEvidence(value: unknown) {
  const item = record(value);
  if (!item) return null;
  const claim = text(item.claim, 500);
  const sourceUrl = httpUrl(item.sourceUrl);
  if (!claim || !sourceUrl) return null;
  return {
    claim,
    sourceUrl,
    sourceTitle: nullableText(item.sourceTitle, 200),
    excerpt: nullableText(item.excerpt, 700),
  };
}

function canonicalCompany(value: unknown): DiscoveredCompany | null {
  const item = record(value);
  if (!item) return null;

  const name = text(item.name, 180);
  const websiteUrl = httpUrl(item.websiteUrl);
  const summary = text(item.summary, 900);
  if (!name || !websiteUrl || !summary) return null;

  const evidence = (Array.isArray(item.evidence) ? item.evidence : [])
    .map(canonicalEvidence)
    .filter((entry): entry is NonNullable<ReturnType<typeof canonicalEvidence>> => Boolean(entry))
    .slice(0, 8);
  if (!evidence.length) return null;

  const fit = record(item.fitBreakdown) ?? {};
  const confidence = score(item.confidence);
  const rawLabel = typeof item.matchLabel === "string" ? item.matchLabel.trim() : "";
  const matchLabel: DiscoveredCompany["matchLabel"] = MATCH_LABELS.has(rawLabel)
    ? rawLabel as DiscoveredCompany["matchLabel"]
    : confidence >= 88 ? "Strongest match" : confidence >= 74 ? "Strong match" : "Good match";

  const why = strings(item.why, 6, 400);

  return {
    name,
    websiteUrl,
    country: text(item.country, 120),
    industry: text(item.industry, 180),
    summary,
    confidence,
    matchLabel,
    fitBreakdown: {
      industryFit: score(fit.industryFit),
      audienceFit: score(fit.audienceFit),
      operationalFit: score(fit.operationalFit),
      geographyFit: score(fit.geographyFit),
      commercialFit: score(fit.commercialFit),
    },
    // Reusing the model's own summary is safer than inventing a reason when its
    // `why` array was malformed or truncated. Verification still decides whether
    // this company is retained.
    why: why.length ? why : [summary.slice(0, 400)],
    uncertainties: strings(item.uncertainties, 6, 400),
    riskFlags: strings(item.riskFlags, 6, 300),
    evidence,
  };
}

/**
 * Converts a mechanically recoverable model object into the canonical Company
 * Discovery contract. This layer only performs deterministic safety work:
 * clipping, score clamping, URL validation, enum repair and removal of malformed
 * candidates/evidence. It never invents a company, source or evidence claim.
 * The existing official-site verifier remains the authority on retention.
 */
export function canonicaliseCompanyDiscoveryOutput(value: unknown) {
  const root = record(value) ?? {};
  const companies = (Array.isArray(root.companies) ? root.companies : [])
    .map(canonicalCompany)
    .filter((entry): entry is DiscoveredCompany => Boolean(entry))
    .slice(0, 20);

  return CompanyDiscoveryResultSchema.parse({
    schemaVersion: "company-discovery/v2",
    searchSummary: text(root.searchSummary, 700, "Company discovery research completed."),
    companies,
  });
}
