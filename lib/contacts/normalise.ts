import type { ContactDiscoveryResult, DiscoveredContact } from "./schemas";

function clean(value: string | null | undefined, max = 900) {
  return (value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function hostname(value: string) {
  try { return new URL(value).hostname.toLowerCase().replace(/^www\./, ""); } catch { return ""; }
}

function companyDomain(value: string | null | undefined) {
  if (!value) return "";
  try { return new URL(value).hostname.toLowerCase().replace(/^www\./, ""); } catch { return value.toLowerCase().replace(/^www\./, "").split("/")[0]; }
}

function allowedSource(sourceUrl: string, sourceKind: string, officialDomain: string) {
  const host = hostname(sourceUrl);
  if (!host) return false;
  if (officialDomain && (host === officialDomain || host.endsWith(`.${officialDomain}`))) return true;
  if (sourceKind === "OFFICIAL_LINKEDIN_COMPANY") return host === "linkedin.com" || host.endsWith(".linkedin.com");
  if (sourceKind === "REGULATORY_FILING") return /(^|\.)(gov|gov\.uk|sec\.gov|companieshouse\.gov\.uk)$/.test(host);
  return false;
}

export function normaliseContactDiscoveryResult(result: ContactDiscoveryResult, companyWebsite?: string | null) {
  const domain = companyDomain(companyWebsite);
  const contacts = result.contacts.map((contact): DiscoveredContact | null => {
    const evidence = contact.evidence
      .map(item => ({
        ...item,
        claim: clean(item.claim, 500),
        sourceTitle: item.sourceTitle ? clean(item.sourceTitle, 240) : null,
        excerpt: item.excerpt ? clean(item.excerpt, 900) : null,
        sourceDomain: hostname(item.sourceUrl),
        verified: allowedSource(item.sourceUrl, item.sourceKind, domain),
        excerptMatched: Boolean(item.excerpt && clean(item.excerpt).length >= 20),
      }))
      .filter(item => item.verified && item.claim && item.sourceUrl);

    const identityEvidence = evidence.some(item => item.evidenceType === "IDENTITY");
    const roleEvidence = evidence.some(item => item.evidenceType === "ROLE");
    if (!identityEvidence || !roleEvidence) return null;

    const evidenceQuality = Math.round(evidence.reduce((sum, item) => sum + item.qualityScore, 0) / evidence.length);
    const overall = Math.round((contact.confidence.identity * .24) + (contact.confidence.role * .24) + (contact.confidence.buyingRelevance * .2) + (contact.confidence.operationalRelevance * .16) + (evidenceQuality * .16));
    const label = overall >= 85 && contact.confidence.identity >= 85 && contact.confidence.role >= 85
      ? "VERIFIED" : overall >= 70 ? "LIKELY" : overall >= 50 ? "POSSIBLE" : "UNKNOWN";

    return {
      ...contact,
      fullName: clean(contact.fullName, 180),
      roleTitle: clean(contact.roleTitle, 180),
      department: contact.department ? clean(contact.department, 180) : null,
      location: contact.location ? clean(contact.location, 180) : null,
      reasonSelected: clean(contact.reasonSelected, 900),
      confidence: { ...contact.confidence, evidenceQuality, overall, label },
      unknowns: contact.unknowns.map(v => clean(v, 400)).filter(Boolean),
      riskFlags: contact.riskFlags.map(v => clean(v, 400)).filter(Boolean),
      evidence,
    };
  }).filter((contact): contact is DiscoveredContact => Boolean(contact));

  return { ...result, contacts };
}
