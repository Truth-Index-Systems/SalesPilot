import { z } from "zod";
import { ContactDiscoveryResultSchema, type ContactDiscoveryResult } from "./schemas";
import { deterministicChannelRouting, deterministicConfidenceLabel, deterministicContactOverall, deterministicRouteOrderingScore } from "./deterministic-authority";

export const ContactDiscoveryGatewaySchema = z.record(z.unknown());

type JsonRecord = Record<string, unknown>;

const EVIDENCE_TYPES = new Set(["IDENTITY","ROLE","DEPARTMENT","LOCATION","BUYING_RELEVANCE","OPERATIONAL_RELEVANCE","EMAIL","LINKEDIN"]);
const SOURCE_KINDS = new Set(["OFFICIAL_WEBSITE","OFFICIAL_LINKEDIN_COMPANY","OFFICIAL_LINKEDIN_PROFILE","PRESS_RELEASE","REGULATORY_FILING","PUBLISHED_STAFF_DIRECTORY"]);
const CONFIDENCE_LABELS = new Set(["VERIFIED","LIKELY","POSSIBLE","UNKNOWN"]);
const EMAIL_STATUSES = new Set(["VERIFIED","LIKELY","UNKNOWN"]);
const LINKEDIN_STATUSES = new Set(["VERIFIED","HIGH_CONFIDENCE","UNKNOWN"]);
const CHANNEL_TYPES = new Set(["NAMED","DEPARTMENTAL","GENERAL"]);
const CHANNEL_VERIFICATION = new Set(["PUBLIC_VERIFIED","PATTERN_LIKELY"]);
const ROUTE_TYPES = new Set(["PRIMARY","OPERATIONAL","TRANSFORMATION","PROCUREMENT","TECHNICAL","EXECUTIVE","REGIONAL","FALLBACK"]);
const ROUTE_CHANNEL_TYPES = new Set(["DIRECT_EMAIL","LINKEDIN","DEPARTMENT_EMAIL","GENERAL_EMAIL","SWITCHBOARD","INTRODUCTION","UNKNOWN"]);
const ROUTE_DIFFICULTIES = new Set(["LOW","MEDIUM","HIGH"]);

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
function enumValue(value: unknown, allowed: Set<string>, fallback: string): string {
  const candidate = typeof value === "string" ? value.toUpperCase().trim() : "";
  return allowed.has(candidate) ? candidate : fallback;
}
function httpUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch { return null; }
}
function email(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const candidate = value.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate) && candidate.length <= 320 ? candidate : null;
}
function dateTime(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}
function strings(value: unknown, maxItems: number, maxLength: number): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(item => text(item, maxLength)).filter(Boolean).slice(0, maxItems);
}
function domainFromUrl(value: string): string | null {
  try { return new URL(value).hostname.toLowerCase().replace(/^www\./, "").slice(0, 255) || null; }
  catch { return null; }
}

function canonicalEvidence(value: unknown) {
  const item = record(value); if (!item) return null;
  const sourceUrl = httpUrl(item.sourceUrl); if (!sourceUrl) return null;
  const evidenceType = enumValue(item.evidenceType, EVIDENCE_TYPES, ""); if (!evidenceType) return null;
  const sourceKind = enumValue(item.sourceKind, SOURCE_KINDS, ""); if (!sourceKind) return null;
  const claim = text(item.claim, 500); if (!claim) return null;
  return {
    evidenceType,
    claim,
    sourceUrl,
    sourceTitle: nullableText(item.sourceTitle, 240),
    excerpt: nullableText(item.excerpt, 900),
    sourceKind,
    sourceDomain: nullableText(item.sourceDomain, 255) ?? domainFromUrl(sourceUrl),
    verified: item.verified === true,
    excerptMatched: item.excerptMatched === true,
    qualityScore: score(item.qualityScore),
    retrievedAt: dateTime(item.retrievedAt),
  };
}

function canonicalContact(value: unknown) {
  const item = record(value); if (!item) return null;
  const fullName = text(item.fullName, 180); const roleTitle = text(item.roleTitle, 180);
  if (!fullName || !roleTitle) return null;
  const confidence = record(item.confidence) ?? {};
  const emailRow = record(item.email) ?? {};
  const linkedinRow = record(item.linkedin) ?? {};
  const evidence = (Array.isArray(item.evidence) ? item.evidence : []).map(canonicalEvidence).filter(Boolean).slice(0, 14);
  if (!evidence.length) return null;
  const emailAddress = email(emailRow.address);
  const linkedinUrl = httpUrl(linkedinRow.profileUrl);
  return {
    fullName,
    roleTitle,
    department: nullableText(item.department, 180),
    location: nullableText(item.location, 180),
    reasonSelected: text(item.reasonSelected, 900, "Supported route candidate identified during contact research."),
    confidence: (() => {
      const identity = score(confidence.identity);
      const role = score(confidence.role);
      const buyingRelevance = score(confidence.buyingRelevance);
      const operationalRelevance = score(confidence.operationalRelevance);
      const evidenceQuality = score(confidence.evidenceQuality);
      const overall = deterministicContactOverall({ identity, role, buyingRelevance, operationalRelevance, evidenceQuality, unknownCount: Array.isArray(item.unknowns) ? item.unknowns.length : 0, riskCount: Array.isArray(item.riskFlags) ? item.riskFlags.length : 0 });
      return { identity, role, buyingRelevance, operationalRelevance, evidenceQuality, overall, label: deterministicConfidenceLabel(overall) };
    })(),
    email: {
      address: emailAddress,
      status: emailAddress ? enumValue(emailRow.status, EMAIL_STATUSES, "UNKNOWN") : "UNKNOWN",
      confidence: emailAddress ? score(emailRow.confidence) : 0,
      sourceUrl: emailAddress ? httpUrl(emailRow.sourceUrl) : null,
      reason: text(emailRow.reason, 500, "No independently supported direct email route was returned."),
    },
    linkedin: {
      profileUrl: linkedinUrl,
      status: linkedinUrl ? enumValue(linkedinRow.status, LINKEDIN_STATUSES, "UNKNOWN") : "UNKNOWN",
      confidence: linkedinUrl ? score(linkedinRow.confidence) : 0,
      sourceUrl: linkedinUrl ? httpUrl(linkedinRow.sourceUrl) : null,
      reason: text(linkedinRow.reason, 500, "No independently supported LinkedIn route was returned."),
    },
    unknowns: strings(item.unknowns, 8, 400),
    riskFlags: strings(item.riskFlags, 8, 400),
    evidence,
  };
}

function canonicalChannel(value: unknown) {
  const item = record(value); if (!item) return null;
  const emailAddress = email(item.emailAddress); const sourceUrl = httpUrl(item.sourceUrl);
  const likelyReader = text(item.likelyReader, 300); const reasonSelected = text(item.reasonSelected, 600); const evidenceExcerpt = text(item.evidenceExcerpt, 900);
  if (!emailAddress || !sourceUrl || !likelyReader || !reasonSelected || !evidenceExcerpt) return null;
  return {
    emailAddress,
    channelType: enumValue(item.channelType, CHANNEL_TYPES, "GENERAL"),
    department: nullableText(item.department, 180),
    associatedContactName: nullableText(item.associatedContactName, 180),
    likelyReader,
    reasonSelected,
    verificationStatus: enumValue(item.verificationStatus, CHANNEL_VERIFICATION, "PATTERN_LIKELY"),
    ...(() => {
      const confidence = score(item.confidence);
      const responseLikelihood = score(item.responseLikelihood);
      const campaignRelevance = score(item.campaignRelevance);
      const verificationStatus = enumValue(item.verificationStatus, CHANNEL_VERIFICATION, "PATTERN_LIKELY");
      return { confidence, responseLikelihood, campaignRelevance, routingScore: deterministicChannelRouting({ confidence, responseLikelihood, campaignRelevance, publicVerified: verificationStatus === "PUBLIC_VERIFIED" }) };
    })(),
    sourceUrl,
    sourceTitle: nullableText(item.sourceTitle, 240),
    evidenceExcerpt,
  };
}


function canonicalOrganisationMap(value: unknown) {
  const item = record(value) ?? {};
  return {
    summary: text(item.summary, 1200, "MarketRoute mapped the likely commercial ownership structure from existing company intelligence and route research."),
    departments: strings(item.departments, 24, 180),
    businessUnits: strings(item.businessUnits, 24, 180),
    buyingCentres: strings(item.buyingCentres, 20, 180),
    hierarchy: strings(item.hierarchy, 24, 300),
    ownershipSignals: strings(item.ownershipSignals, 20, 400),
  };
}

function canonicalBuyingPath(value: unknown, index: number) {
  const item = record(value); if (!item) return null;
  const entryRole = text(item.entryRole, 180); const targetRole = text(item.targetRole, 180);
  const steps = strings(item.steps, 10, 180);
  if (!entryRole || !targetRole || !steps.length) return null;
  return {
    name: text(item.name, 180, `Buying path ${index + 1}`),
    routeType: enumValue(item.routeType, ROUTE_TYPES, index === 0 ? "PRIMARY" : "FALLBACK"),
    objective: text(item.objective, 500, "Reach the relevant commercial owner."),
    entryRole, targetRole, steps,
    rationale: text(item.rationale, 900, "Route inferred from the supported organisation and buying structure."),
    confidence: score(item.confidence),
  };
}

function canonicalRoute(value: unknown, index: number) {
  const item = record(value); if (!item) return null;
  const entryRole = text(item.entryRole, 180); const targetRole = text(item.targetRole, 180);
  if (!entryRole || !targetRole) return null;
  const evidence = (Array.isArray(item.evidence) ? item.evidence : []).map(canonicalEvidence).filter(Boolean).slice(0, 12);
  const channelType = enumValue(item.channelType, ROUTE_CHANNEL_TYPES, "UNKNOWN");
  return {
    routeKey: text(item.routeKey, 120, `route-${index + 1}`).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0,120) || `route-${index + 1}`,
    routeType: enumValue(item.routeType, ROUTE_TYPES, index === 0 ? "PRIMARY" : "FALLBACK"),
    label: text(item.label, 180, `${entryRole} to ${targetRole}`),
    entryRole, targetRole, department: nullableText(item.department, 180),
    contactName: nullableText(item.contactName, 180), contactRole: nullableText(item.contactRole, 180),
    channelType, channelValue: nullableText(item.channelValue, 500),
    authority: score(item.authority), accessibility: score(item.accessibility),
    commercialRelevance: score(item.commercialRelevance), evidenceQuality: score(item.evidenceQuality),
    resilience: score(item.resilience), confidence: score(item.confidence),
    difficulty: enumValue(item.difficulty, ROUTE_DIFFICULTIES, "HIGH"),
    rationale: text(item.rationale, 1200, "Commercial route identified from supported public evidence."),
    nextStep: text(item.nextStep, 900, "Continue route research before outreach."),
    fallbackReason: nullableText(item.fallbackReason, 700),
    evidence,
  };
}

/**
 * Converts a structurally valid model object into the canonical persisted v3 contract.
 * This performs deterministic safety and authority work: clipping, enum fallback,
 * score clamping, deterministic contact/channel/route ordering, invalid-channel removal
 * and replacement of model-owned identifiers with trusted IDs.
 * It never manufactures a person, company route, source URL or evidence claim.
 */
export function canonicaliseContactDiscoveryOutput(value: unknown, expectedCompanyId: string): ContactDiscoveryResult {
  const root = record(value) ?? {};
  const contacts = (Array.isArray(root.contacts) ? root.contacts : []).map(canonicalContact).filter(Boolean).sort((a: any, b: any) => b.confidence.overall - a.confidence.overall || a.fullName.localeCompare(b.fullName)).slice(0, 20);
  const companyContactChannels = (Array.isArray(root.companyContactChannels) ? root.companyContactChannels : []).map(canonicalChannel).filter(Boolean).sort((a: any, b: any) => b.routingScore - a.routingScore || a.emailAddress.localeCompare(b.emailAddress)).slice(0, 30);
  const buyingPaths = (Array.isArray(root.buyingPaths) ? root.buyingPaths : []).map(canonicalBuyingPath).filter(Boolean).slice(0, 12);
  const routes = (Array.isArray(root.routes) ? root.routes : []).map(canonicalRoute).filter(Boolean).sort((a: any, b: any) => deterministicRouteOrderingScore(b) - deterministicRouteOrderingScore(a) || a.routeKey.localeCompare(b.routeKey)).slice(0, 16);
  return ContactDiscoveryResultSchema.parse({
    schemaVersion: "contact-discovery/v3",
    companyId: expectedCompanyId,
    researchSummary: text(root.researchSummary, 900, "Route intelligence research completed."),
    organisationMap: canonicalOrganisationMap(root.organisationMap),
    buyingPaths, routes,
    contacts,
    companyContactChannels,
    unresolvedRoles: strings(root.unresolvedRoles, 20, 180),
    uncertainties: strings(root.uncertainties, 12, 500),
  });
}
