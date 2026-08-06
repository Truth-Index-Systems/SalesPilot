import "server-only";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { canonicalDomain } from "./normalise";
import type { DiscoveredCompany, VerifiedDiscoveredCompany, VerifiedDiscoveryEvidence } from "./schemas";

const MAX_BYTES = 750_000;
const TIMEOUT_MS = 8_000;

export type CompanyVerificationReason =
  | "INVALID_DOMAIN"
  | "HOMEPAGE_UNREACHABLE"
  | "NO_OFFICIAL_EVIDENCE"
  | "EVIDENCE_TOO_WEAK"
  | "CONFIDENCE_TOO_LOW";

export type CompanyVerificationResult =
  | { accepted: true; company: VerifiedDiscoveredCompany; diagnostics: CompanyVerificationDiagnostics }
  | { accepted: false; reason: CompanyVerificationReason; diagnostics: CompanyVerificationDiagnostics };

export type CompanyVerificationDiagnostics = {
  officialEvidenceSubmitted: number;
  officialEvidenceReachable: number;
  excerptMatches: number;
  evidenceQuality: number;
  fitScore: number;
  finalConfidence: number;
};

function emptyDiagnostics(): CompanyVerificationDiagnostics {
  return { officialEvidenceSubmitted: 0, officialEvidenceReachable: 0, excerptMatches: 0, evidenceQuality: 0, fitScore: 0, finalConfidence: 0 };
}

function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) return true;
  const [a, b] = parts;
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224;
}

function isPrivateIpv6(ip: string): boolean {
  const value = ip.toLowerCase();
  return value === "::" || value === "::1" || value.startsWith("fc") || value.startsWith("fd") || value.startsWith("fe8") || value.startsWith("fe9") || value.startsWith("fea") || value.startsWith("feb");
}

async function assertPublicHost(hostname: string): Promise<void> {
  if (hostname === "localhost" || hostname.endsWith(".local")) throw new Error("UNSAFE_DISCOVERY_SOURCE");
  if (isIP(hostname)) {
    if ((isIP(hostname) === 4 && isPrivateIpv4(hostname)) || (isIP(hostname) === 6 && isPrivateIpv6(hostname))) throw new Error("UNSAFE_DISCOVERY_SOURCE");
    return;
  }
  const addresses = await lookup(hostname, { all: true, verbatim: true });
  if (addresses.length === 0) throw new Error("DISCOVERY_SOURCE_UNREACHABLE");
  for (const address of addresses) {
    if ((address.family === 4 && isPrivateIpv4(address.address)) || (address.family === 6 && isPrivateIpv6(address.address))) throw new Error("UNSAFE_DISCOVERY_SOURCE");
  }
}

function normaliseText(value: string): string {
  return value.toLowerCase().replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/gi, " ").replace(/[^a-z0-9]+/g, " ").trim();
}

function meaningfulTokens(value: string): string[] {
  return normaliseText(value).split(/\s+/).filter((token) => token.length >= 4).slice(0, 80);
}

function excerptSupported(pageText: string, excerptValue: string | null | undefined): boolean {
  const excerpt = normaliseText(excerptValue ?? "");
  if (excerpt.length < 12) return false;
  if (pageText.includes(excerpt.slice(0, 240))) return true;
  const tokens = meaningfulTokens(excerpt);
  if (tokens.length < 4) return false;
  const pageTokens = new Set(meaningfulTokens(pageText));
  const matches = tokens.filter((token) => pageTokens.has(token)).length;
  return matches / tokens.length >= 0.6;
}

async function fetchPublicPage(initialUrl: string, expectedDomain: string): Promise<{ text: string; finalUrl: string }> {
  let current = new URL(initialUrl);
  for (let redirect = 0; redirect < 4; redirect += 1) {
    if (!["http:", "https:"].includes(current.protocol)) throw new Error("UNSAFE_DISCOVERY_SOURCE");
    if (canonicalDomain(current.toString()) !== expectedDomain) throw new Error("DISCOVERY_SOURCE_NOT_OFFICIAL");
    await assertPublicHost(current.hostname);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetch(current, {
        method: "GET",
        redirect: "manual",
        cache: "no-store",
        signal: controller.signal,
        headers: { "user-agent": "SalesPilot Company Research/1.0", accept: "text/html,application/xhtml+xml" },
      });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location) throw new Error("DISCOVERY_SOURCE_REDIRECT_INVALID");
        current = new URL(location, current);
        continue;
      }
      if (!response.ok) throw new Error("DISCOVERY_SOURCE_UNREACHABLE");
      const contentType = response.headers.get("content-type") ?? "";
      if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) throw new Error("DISCOVERY_SOURCE_UNSUPPORTED");
      const declaredLength = Number(response.headers.get("content-length") ?? 0);
      if (declaredLength > MAX_BYTES) throw new Error("DISCOVERY_SOURCE_TOO_LARGE");
      const text = (await response.text()).slice(0, MAX_BYTES);
      return { text: normaliseText(text), finalUrl: current.toString() };
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error("DISCOVERY_SOURCE_TOO_MANY_REDIRECTS");
}

function weightedFit(company: DiscoveredCompany): number {
  const fit = company.fitBreakdown;
  return Math.round(fit.industryFit * 0.25 + fit.audienceFit * 0.25 + fit.operationalFit * 0.2 + fit.geographyFit * 0.1 + fit.commercialFit * 0.2);
}

function label(confidence: number): DiscoveredCompany["matchLabel"] {
  if (confidence >= 88) return "Strongest match";
  if (confidence >= 74) return "Strong match";
  return "Good match";
}

export async function verifyDiscoveredCompanyDetailed(company: DiscoveredCompany): Promise<CompanyVerificationResult> {
  const domain = canonicalDomain(company.websiteUrl);
  if (!domain) return { accepted: false, reason: "INVALID_DOMAIN", diagnostics: emptyDiagnostics() };

  // A marketing homepage is not the strongest proof source and may block bots even
  // when official operations, careers or report pages are publicly reachable.
  // Verify the evidence package first; only treat the homepage as a supporting signal.
  let homepageReachable = true;
  try {
    await fetchPublicPage(company.websiteUrl, domain);
  } catch {
    homepageReachable = false;
  }

  const officialEvidence = company.evidence.filter((item) => canonicalDomain(item.sourceUrl) === domain);
  const verifiedEvidence: VerifiedDiscoveryEvidence[] = [];
  for (const evidence of officialEvidence) {
    try {
      const page = await fetchPublicPage(evidence.sourceUrl, domain);
      const excerptMatched = excerptSupported(page.text, evidence.excerpt);
      verifiedEvidence.push({ ...evidence, verified: true, excerptMatched, sourceDomain: domain, retrievedAt: new Date().toISOString() });
    } catch {
      continue;
    }
  }

  const excerptMatches = verifiedEvidence.filter((item) => item.excerptMatched).length;
  const evidenceQuality = Math.min(100, 38 + Math.min(verifiedEvidence.length, 4) * 12 + Math.min(excerptMatches, 3) * 8);
  const fitScore = weightedFit(company);
  const confidence = Math.round(Math.min(company.confidence, fitScore * 0.72 + evidenceQuality * 0.28));
  const diagnostics = {
    officialEvidenceSubmitted: officialEvidence.length,
    officialEvidenceReachable: verifiedEvidence.length,
    excerptMatches,
    evidenceQuality,
    fitScore,
    finalConfidence: confidence,
  };

  if (verifiedEvidence.length === 0) return { accepted: false, reason: homepageReachable ? "NO_OFFICIAL_EVIDENCE" : "HOMEPAGE_UNREACHABLE", diagnostics };

  // One reachable official source is acceptable when campaign fit and model
  // confidence are both strong. Weak-fit candidates still require richer or
  // directly matched evidence. This preserves the evidence-first gate without
  // discarding legitimate smaller businesses whose official sites are sparse.
  const minimumEvidenceQuality = fitScore >= 72 && company.confidence >= 72 ? 48 : 55;
  if (evidenceQuality < minimumEvidenceQuality) return { accepted: false, reason: "EVIDENCE_TOO_WEAK", diagnostics };
  if (confidence < 58) return { accepted: false, reason: "CONFIDENCE_TOO_LOW", diagnostics };

  return {
    accepted: true,
    diagnostics,
    company: {
      ...company,
      websiteUrl: `https://${domain}`,
      confidence,
      matchLabel: label(confidence),
      evidence: verifiedEvidence.slice(0, 8),
      evidenceQuality,
      verificationStatus: "VERIFIED",
    },
  };
}

export async function verifyDiscoveredCompany(company: DiscoveredCompany): Promise<VerifiedDiscoveredCompany | null> {
  const result = await verifyDiscoveredCompanyDetailed(company);
  return result.accepted ? result.company : null;
}
