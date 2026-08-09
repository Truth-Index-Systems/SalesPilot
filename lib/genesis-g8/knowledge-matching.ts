import type { GenesisG8KnowledgeEligibility } from "./eligibility";

export interface GenesisG8BusinessDnaRetrievalInput {
  company: { website: string };
  idealCustomers: Array<{ segment: string; industries: string[]; companySize: string; geographies: string[]; buyerRoles: string[]; pains: string[] }>;
  campaigns: Array<{ audience: string; objective: string }>;
}

export const GENESIS_G8_KNOWLEDGE_MATCHING_VERSION = "G8.1-R13-MATCHING-1.0" as const;

export interface GenesisG8RetrievalProfile {
  sellerDomain: string;
  industries: string[];
  segments: string[];
  geographies: string[];
  companySizes: string[];
  buyerRoles: string[];
  pains: string[];
  campaignAudiences: string[];
  campaignObjectives: string[];
  searchLexemes: string[];
}

export interface GenesisG8CompanySearchProjection {
  entityId: string;
  canonicalKey: string;
  displayName: string | null;
  status: "ACTIVE" | "SUPPRESSED" | "SUPERSEDED";
  reviewState: "UNREVIEWED" | "NEEDS_REVIEW" | "HUMAN_APPROVED" | "HUMAN_CORRECTED" | "HUMAN_REJECTED";
  searchText: string;
  claimText: Record<string, string>;
  truthIndex: number;
  confidence: number;
  coverage: number;
  identityConfidence: number;
  contactCount: number;
  routeCount: number;
  contactTruthScore: number;
  routeTruthScore: number;
  sourceChannels: string[];
  humanReviewed: boolean;
  lexicalRank: number;
  updatedAt: string;
}

export interface GenesisG8BusinessMatchDimensions {
  industry: number;
  segment: number;
  geography: number;
  companySize: number;
  buyerRole: number;
  commercialProblem: number;
}

export interface GenesisG8RankedCompanyCandidate extends GenesisG8CompanySearchProjection {
  businessFit: number;
  retrievalScore: number;
  retrievalConfidence: number;
  routeReadiness: number;
  dimensions: GenesisG8BusinessMatchDimensions;
  matchedTerms: string[];
  eligibility?: GenesisG8KnowledgeEligibility;
}

const DIMENSION_WEIGHTS: Record<keyof GenesisG8BusinessMatchDimensions, number> = {
  industry: 0.30,
  segment: 0.20,
  geography: 0.12,
  companySize: 0.13,
  buyerRole: 0,
  commercialProblem: 0.25,
};

const clamp100 = (value: number) => Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
const round2 = (value: number) => Math.round(value * 100) / 100;
const unique = (values: string[]) => [...new Set(values.map(normalisePhrase).filter(Boolean))];

export function normalisePhrase(value: string): string {
  return value
    .toLowerCase()
    .replace(/https?:\/\//g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function domainFromUrl(value: string): string {
  try { return new URL(value).hostname.toLowerCase().replace(/^www\./, ""); }
  catch { return normalisePhrase(value).replace(/\s+/g, ""); }
}

function significantTokens(value: string): string[] {
  const stop = new Set(["and","the","for","with","from","into","that","this","your","our","their","company","companies","business","businesses","services","service","solutions","solution"]);
  return normalisePhrase(value).split(" ").filter((token) => token.length >= 3 && !stop.has(token));
}

function phraseSimilarity(term: string, corpus: string): number {
  const t = normalisePhrase(term);
  const c = normalisePhrase(corpus);
  if (!t || !c) return 0;
  if (c.includes(t)) return 1;
  const tokens = significantTokens(t);
  if (!tokens.length) return 0;
  const corpusTokens = new Set(significantTokens(c));
  const matched = tokens.filter((token) => corpusTokens.has(token)).length;
  const ratio = matched / tokens.length;
  return ratio >= 0.75 ? ratio : ratio >= 0.5 && matched >= 2 ? ratio * 0.8 : 0;
}

function dimensionScore(terms: string[], corpus: string): { score: number; matches: string[] } {
  if (!terms.length) return { score: 0, matches: [] };
  const scored = unique(terms)
    .map((term) => ({ term, score: phraseSimilarity(term, corpus) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.term.localeCompare(b.term));
  if (!scored.length) return { score: 0, matches: [] };
  // Alternatives inside a Business DNA dimension should not punish a company
  // for matching one strong ICP. Use the strongest match plus modest breadth.
  const strongest = scored[0].score;
  const breadth = Math.min(1, scored.length / Math.min(3, Math.max(1, terms.length)));
  return { score: clamp100((strongest * 0.85 + breadth * 0.15) * 100), matches: scored.slice(0, 4).map((item) => item.term) };
}

function weightedAvailableMean(values: Record<keyof GenesisG8BusinessMatchDimensions, { score: number; available: boolean }>) {
  let weighted = 0;
  let total = 0;
  for (const key of Object.keys(DIMENSION_WEIGHTS) as (keyof GenesisG8BusinessMatchDimensions)[]) {
    if (!values[key].available) continue;
    weighted += values[key].score * DIMENSION_WEIGHTS[key];
    total += DIMENSION_WEIGHTS[key];
  }
  return total > 0 ? weighted / total : 0;
}

export function buildGenesisG8RetrievalProfile(businessDna: GenesisG8BusinessDnaRetrievalInput): GenesisG8RetrievalProfile {
  const industries = unique(businessDna.idealCustomers.flatMap((item) => item.industries));
  const segments = unique(businessDna.idealCustomers.map((item) => item.segment));
  const geographies = unique(businessDna.idealCustomers.flatMap((item) => item.geographies));
  const companySizes = unique(businessDna.idealCustomers.map((item) => item.companySize));
  const buyerRoles = unique(businessDna.idealCustomers.flatMap((item) => item.buyerRoles));
  const pains = unique(businessDna.idealCustomers.flatMap((item) => item.pains));
  const campaignAudiences = unique(businessDna.campaigns.map((item) => item.audience));
  const campaignObjectives = unique(businessDna.campaigns.map((item) => item.objective));
  const searchLexemes = unique([
    ...industries,
    ...segments,
    ...geographies,
    ...companySizes,
    ...buyerRoles,
    ...pains,
    ...campaignAudiences,
    ...campaignObjectives,
  ]).flatMap(significantTokens);

  return {
    sellerDomain: domainFromUrl(businessDna.company.website),
    industries,
    segments,
    geographies,
    companySizes,
    buyerRoles,
    pains,
    campaignAudiences,
    campaignObjectives,
    searchLexemes: [...new Set(searchLexemes)].slice(0, 64),
  };
}

export function rankGenesisG8CompanyCandidate(
  candidate: GenesisG8CompanySearchProjection,
  profile: GenesisG8RetrievalProfile,
): GenesisG8RankedCompanyCandidate {
  const claim = candidate.claimText ?? {};
  const industryCorpus = [claim.industry, claim.sector, claim.customer_market, candidate.searchText].filter(Boolean).join(" ");
  const segmentCorpus = [claim.customer_market, claim.industry, claim.sector, claim.offering, candidate.searchText].filter(Boolean).join(" ");
  const geographyCorpus = [claim.geography, candidate.searchText].filter(Boolean).join(" ");
  const sizeCorpus = [claim.company_scale, candidate.searchText].filter(Boolean).join(" ");
  const buyerCorpus = [claim.contact_coverage, claim.route_coverage, candidate.searchText].filter(Boolean).join(" ");
  const problemCorpus = [claim.commercial_problems, claim.buying_signals, candidate.searchText].filter(Boolean).join(" ");

  const industry = dimensionScore(profile.industries, industryCorpus);
  const segment = dimensionScore([...profile.segments, ...profile.campaignAudiences], segmentCorpus);
  const geography = dimensionScore(profile.geographies, geographyCorpus);
  const companySize = dimensionScore(profile.companySizes, sizeCorpus);
  const buyerRole = dimensionScore(profile.buyerRoles, buyerCorpus);
  const commercialProblem = dimensionScore([...profile.pains, ...profile.campaignObjectives], problemCorpus);

  const dimensions: GenesisG8BusinessMatchDimensions = {
    industry: round2(industry.score),
    segment: round2(segment.score),
    geography: round2(geography.score),
    companySize: round2(companySize.score),
    buyerRole: round2(buyerRole.score),
    commercialProblem: round2(commercialProblem.score),
  };

  const businessFit = clamp100(weightedAvailableMean({
    industry: { score: industry.score, available: profile.industries.length > 0 },
    segment: { score: segment.score, available: profile.segments.length + profile.campaignAudiences.length > 0 },
    geography: { score: geography.score, available: profile.geographies.length > 0 },
    companySize: { score: companySize.score, available: profile.companySizes.length > 0 },
    // Buyer-role match is a route diagnostic, not intrinsic company fit. It is
    // represented through route readiness in Retrieval Score rather than
    // contaminating the customer-specific Business Fit score.
    buyerRole: { score: buyerRole.score, available: false },
    commercialProblem: { score: commercialProblem.score, available: profile.pains.length + profile.campaignObjectives.length > 0 },
  }));

  const routeReadiness = candidate.routeCount > 0
    ? clamp100(candidate.routeTruthScore)
    : candidate.contactCount > 0
      ? clamp100(candidate.contactTruthScore * 0.65)
      : 0;

  // Freshness is already represented deterministically inside MR-TI-2 evidence strength;
  // retrieval must not apply a second freshness penalty.
  const retrievalScore = clamp100(
    businessFit * 0.62
      + clamp100(candidate.truthIndex) * 0.25
      + clamp100(candidate.coverage) * 0.08
      + routeReadiness * 0.05,
  );

  const matchedTerms = [...new Set([
    ...industry.matches,
    ...segment.matches,
    ...geography.matches,
    ...companySize.matches,
    ...buyerRole.matches,
    ...commercialProblem.matches,
  ])].slice(0, 12);

  return {
    ...candidate,
    businessFit: round2(businessFit),
    retrievalScore: round2(retrievalScore),
    retrievalConfidence: round2(clamp100(candidate.identityConfidence || candidate.confidence)),
    routeReadiness: round2(routeReadiness),
    dimensions,
    matchedTerms,
  };
}

export function rankGenesisG8CompanyCandidates(
  candidates: GenesisG8CompanySearchProjection[],
  profile: GenesisG8RetrievalProfile,
  options: { minimumBusinessFit?: number; limit?: number } = {},
): GenesisG8RankedCompanyCandidate[] {
  const minimumBusinessFit = options.minimumBusinessFit ?? 25;
  const limit = Math.max(1, Math.min(100, Math.trunc(options.limit ?? 25)));
  return candidates
    .filter((candidate) => candidate.status === "ACTIVE" && candidate.reviewState !== "HUMAN_REJECTED")
    .filter((candidate) => candidate.canonicalKey !== profile.sellerDomain)
    .map((candidate) => rankGenesisG8CompanyCandidate(candidate, profile))
    .filter((candidate) => candidate.businessFit >= minimumBusinessFit)
    .sort((a, b) =>
      b.retrievalScore - a.retrievalScore
      || b.businessFit - a.businessFit
      || b.truthIndex - a.truthIndex
      || b.coverage - a.coverage
      || a.canonicalKey.localeCompare(b.canonicalKey))
    .slice(0, limit);
}

export function buildGenesisG8SearchTsQuery(profile: GenesisG8RetrievalProfile): string {
  const lexemes = profile.searchLexemes
    .map((term) => normalisePhrase(term).replace(/\s+/g, ""))
    .filter((term) => /^[a-z0-9]+$/.test(term) && term.length >= 3)
    .slice(0, 48);
  return [...new Set(lexemes)].join(" | ");
}
