import { CompanyDiscoveryResultSchema, type DiscoveredCompany } from "./schemas";

function safeUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    return url;
  } catch {
    return null;
  }
}

export function canonicalDomain(value: string): string | null {
  const url = safeUrl(value);
  if (!url) return null;
  return url.hostname.toLowerCase().replace(/^www\./, "");
}

function matchLabel(confidence: number): DiscoveredCompany["matchLabel"] {
  if (confidence >= 88) return "Strongest match";
  if (confidence >= 74) return "Strong match";
  return "Good match";
}

export function normaliseDiscoveryResult(
  value: unknown,
  options: { customerWebsite?: string | null; minimumConfidence?: number; maximumCompanies?: number } = {},
) {
  const parsed = CompanyDiscoveryResultSchema.parse(value);
  const customerDomain = options.customerWebsite ? canonicalDomain(options.customerWebsite) : null;
  const minimumConfidence = options.minimumConfidence ?? 60;
  const maximumCompanies = options.maximumCompanies ?? 12;
  const seen = new Set<string>();
  const companies: DiscoveredCompany[] = [];

  for (const company of parsed.companies) {
    const domain = canonicalDomain(company.websiteUrl);
    if (!domain || domain === customerDomain || seen.has(domain)) continue;
    if (company.confidence < minimumConfidence) continue;

    const officialEvidence = company.evidence.filter((item) => canonicalDomain(item.sourceUrl) === domain);
    if (officialEvidence.length === 0) continue;

    seen.add(domain);
    companies.push({
      ...company,
      websiteUrl: `https://${domain}`,
      confidence: Math.max(0, Math.min(100, Math.round(company.confidence))),
      matchLabel: matchLabel(company.confidence),
      evidence: officialEvidence.slice(0, 8),
      why: company.why.slice(0, 6),
      uncertainties: company.uncertainties.slice(0, 6),
    });

    if (companies.length >= maximumCompanies) break;
  }

  if (companies.length === 0) throw new Error("DISCOVERY_NO_VERIFIED_COMPANIES");
  return { ...parsed, companies };
}
