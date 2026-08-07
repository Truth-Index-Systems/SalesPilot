import "server-only";

import { z } from "zod";

const SearchArchetypeSchema = z.object({
  name: z.string().min(1).max(120),
  operatingReality: z.string().min(1).max(420),
  sectors: z.array(z.string().min(1).max(120)).min(1).max(8),
  searchTerms: z.array(z.string().min(1).max(180)).min(2).max(10),
  evidenceSignals: z.array(z.string().min(1).max(220)).min(2).max(10),
});

export const CompanySearchPlanSchema = z.object({
  schemaVersion: z.literal("company-search-plan/v1"),
  commercialProblem: z.string().min(1).max(500),
  operationalConditions: z.array(z.string().min(1).max(220)).min(3).max(12),
  companyArchetypes: z.array(SearchArchetypeSchema).min(3).max(8),
  buyerRoleSynonyms: z.array(z.string().min(1).max(120)).min(3).max(16),
  geographyVariants: z.array(z.string().min(1).max(120)).min(1).max(12),
  sourcePriority: z.array(z.string().min(1).max(160)).min(3).max(8),
  exclusionRules: z.array(z.string().min(1).max(220)).min(2).max(10),
  diversificationRule: z.string().min(1).max(420),
});

export type CompanySearchPlan = z.output<typeof CompanySearchPlanSchema>;

type SearchPlanInput = {
  organisationId: string;
  campaignId: string;
  schedulerRunId?: string | null;
  jobId: string;
  campaign: Record<string, unknown>;
  business: Record<string, unknown>;
  customerWebsite?: string | null;
  searchPass: number;
  searchStrategy: string;
};

function text(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) return value.map(text).filter(Boolean).join(" · ");
  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).map(text).filter(Boolean).join(" · ");
  }
  return "";
}

function clip(value: string, max: number): string {
  const compact = value.replace(/\s+/g, " ").trim();
  if (compact.length <= max) return compact;
  return compact.slice(0, Math.max(1, max - 1)).trimEnd() + "…";
}

function unique(values: string[], limit: number, maxLength = 10_000): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const raw of values.map(item => item.trim()).filter(Boolean)) {
    const value = clip(raw, maxLength);
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(value);
    if (output.length >= limit) break;
  }
  return output;
}

function includesAny(haystack: string, needles: string[]): boolean {
  return needles.some(needle => haystack.includes(needle));
}

function roleSynonyms(source: string): string[] {
  const roles = source.split(/[·,;|/\n]+/).map(value => value.trim()).filter(Boolean);
  return unique([
    ...roles,
    "Head of Operations",
    "Operations Director",
    "Operations Manager",
    "Regional Operations Manager",
    "Site Manager",
    "Plant Manager",
    "General Manager",
    "Continuous Improvement Manager",
    "Transformation Director",
    "Managing Director",
  ], 16, 120);
}

function geographyVariants(source: string, pass: number, strategy: string): string[] {
  const lower = source.toLowerCase();
  const values = ["United Kingdom", "UK-wide"];
  if (includesAny(lower, ["global", "international", "worldwide", "multi-country"])) values.push("Europe", "International");
  if (includesAny(lower, ["ireland", "irish"])) values.push("Ireland");
  if (includesAny(lower, ["united states", "usa", "north america"])) values.push("United States", "North America");
  if (pass > 1 || strategy === "BROADER_GEOGRAPHY_AND_SIZE") values.push("Europe", "English-speaking markets");
  return unique(values, 12, 120);
}

function buildArchetypes(context: string, strategy: string): CompanySearchPlan["companyArchetypes"] {
  const lower = context.toLowerCase();
  const operational = includesAny(lower, ["shift", "handover", "site", "plant", "warehouse", "depot", "operations", "production", "maintenance", "safety", "downtime"]);
  const software = includesAny(lower, ["software", "saas", "platform", "system", "app", "automation", "digital"]);
  const compliance = includesAny(lower, ["compliance", "audit", "approval", "controlled", "record", "governance", "safety"]);
  const multiSite = includesAny(lower, ["multi-site", "multisite", "multiple sites", "regional", "locations", "distributed"]);

  const commonSignals = unique([
    operational ? "Official evidence of operational sites, shift work, production, warehousing, maintenance or service delivery" : "Official evidence of the operating condition described by the campaign",
    multiSite ? "Locations, facilities or regional operating footprint" : "A clearly evidenced operating footprint",
    compliance ? "Careers, reports or policies showing governance, safety, compliance or controlled processes" : "Careers or operations evidence showing the relevant workflow",
    "Relevant leadership or operational buyer roles on official pages or job descriptions",
  ], 8);

  const archetypes: CompanySearchPlan["companyArchetypes"] = [];
  const add = (name: string, reality: string, sectors: string[], terms: string[]) => {
    archetypes.push({
      name: clip(name, 120),
      operatingReality: clip(reality, 420),
      sectors: unique(sectors, 8, 120),
      searchTerms: unique(terms, 10, 180),
      evidenceSignals: unique(commonSignals, 10, 220),
    });
  };

  if (operational) {
    add("Multi-site operational organisations", "Organisations coordinating work, accountability and performance across several operational locations.", ["Logistics", "Manufacturing", "Facilities management", "Transport", "Utilities"], ["multi-site operations locations", "regional operations sites", "operational locations company", "site operations careers"]);
    add("Shift-based production and logistics", "Businesses where teams hand work between shifts and continuity failures can create delay, downtime, safety or quality risk.", ["Manufacturing", "Warehousing", "Distribution", "Food production", "Automotive"], ["shift operations plant", "24/7 warehouse operations", "production shift careers", "distribution centre operations"]);
    add("Safety and compliance-sensitive operations", "Organisations that require controlled records, approvals, accountability and auditable operational processes.", ["Utilities", "Engineering", "Healthcare operations", "Food and beverage", "Infrastructure"], ["operational compliance sites", "safety critical operations company", "quality operations careers", "controlled operational records"]);
    add("Field and service operations", "Distributed teams carrying out maintenance, engineering, facilities or customer operations across sites and regions.", ["Field services", "Engineering services", "Facilities", "Telecommunications", "Construction services"], ["regional field operations", "maintenance operations locations", "facilities operations careers", "service delivery sites"]);
  } else {
    add("Core ideal-customer organisations", "Companies whose operating model and commercial priorities closely match the approved campaign audience.", ["B2B services", "Technology-enabled businesses", "Professional services"], ["approved audience companies", "buyer role company", "business need operations"]);
    add("High-complexity organisations", "Businesses with enough operational or organisational complexity for the proposed solution to create measurable value.", ["Mid-market", "Enterprise", "Multi-location businesses"], ["multi-location company", "operational complexity careers", "regional business operations"]);
    add("Change and transformation buyers", "Organisations publicly investing in process improvement, modernisation, automation or measurable efficiency.", ["Business services", "Technology", "Industrial services"], ["digital transformation operations", "process improvement careers", "automation initiative company"]);
  }

  if (software) {
    add("Manual-to-digital transition opportunities", "Teams replacing spreadsheets, email, paper or fragmented processes with governed digital workflows.", ["Operational businesses", "Professional services", "Regulated services"], ["manual process digital transformation", "spreadsheet workflow operations", "process modernisation company", "workflow automation initiative"]);
  }

  if (strategy === "ADJACENT_INDUSTRIES") {
    add("Adjacent industries", "Companies in neighbouring sectors that preserve the same operating conditions and commercial need as the approved audience.", ["Industrial services", "Infrastructure", "Healthcare operations", "Retail distribution"], ["adjacent sector operations", "multi-site operations careers", "regional operating locations", "operational transformation"]);
  }

  if (strategy === "OPERATIONAL_SIMILARITY") {
    add("Operational-similarity matches", "Companies whose day-to-day operating model mirrors the target workflow even when their formal industry label differs.", ["Distributed operations", "Field services", "Facilities", "Transport", "Production"], ["distributed operations sites", "shift based operations", "regional service operations", "operational continuity"]);
  }

  if (strategy === "PROBLEM_SIMILARITY") {
    add("Problem-similarity matches", "Companies showing evidence of the same measurable workflow, continuity, risk, quality or coordination problem described by the campaign.", ["Operational businesses", "Regulated services", "Complex service organisations"], ["continuous improvement operations", "workflow risk operations", "quality improvement careers", "process reliability initiative"]);
  }

  if (strategy === "BUYER_SIMILARITY") {
    add("Buyer-similarity matches", "Companies employing equivalent operational, transformation, continuous-improvement or site leadership roles that would own the approved problem.", ["Manufacturing", "Logistics", "Business services", "Infrastructure"], ["operations director careers", "continuous improvement manager", "transformation director operations", "site manager careers"]);
  }

  if (strategy === "COMPANY_ECOSYSTEM") {
    add("Company-ecosystem matches", "Companies connected to the same supplier, partner, customer, facility or operating ecosystem as already-supported target organisations, while still requiring independent official evidence.", ["Supply chain", "Industrial ecosystems", "Partner networks", "Service networks"], ["supplier network operations", "strategic partners operations", "customer case study operations", "facility network company"]);
  }

  return archetypes.slice(0, 8);
}

/**
 * Build a deterministic market-search specification.
 *
 * This phase must never call AI or the public internet. It translates the
 * already-approved Business DNA and campaign into a bounded search contract.
 * AI/web research begins only after the worker enters SEARCHING.
 */
export async function buildCompanySearchPlan(input: SearchPlanInput): Promise<CompanySearchPlan> {
  const campaignText = text(input.campaign);
  const businessText = text(input.business);
  const context = `${campaignText} ${businessText}`.trim();
  const objective = clip(text(input.campaign.objective) || text(input.business.summary) || "Find organisations with a commercially evidenced need for the approved offer.", 500);
  const audience = clip(text(input.campaign.audience), 180);
  const buyers = text(input.campaign.buyerRoles);

  const operationalConditions = unique([
    audience ? `Matches the approved audience: ${audience}` : "Matches the approved customer profile",
    objective ? `Has operating conditions connected to this commercial objective: ${objective}` : "Has an evidenced need connected to the campaign objective",
    "Shows sufficient organisational scale, complexity or repetition for the offer to create measurable value",
    "Has official evidence of relevant operations, locations, roles, initiatives, risks or workflows",
    input.searchPass > 1 ? `Has not been exhausted by earlier search pass ${input.searchPass - 1}` : "Can be verified independently before recommendation",
  ], 12, 220);

  const plan = {
    schemaVersion: "company-search-plan/v1" as const,
    commercialProblem: clip(objective, 500),
    operationalConditions,
    companyArchetypes: buildArchetypes(context, input.searchStrategy),
    buyerRoleSynonyms: roleSynonyms(buyers),
    geographyVariants: geographyVariants(context, input.searchPass, input.searchStrategy),
    sourcePriority: unique([
      "Official operations, facilities and locations pages",
      "Official careers pages and job descriptions",
      "Official annual, sustainability, safety or regulatory reports",
      "Official procurement and supplier pages",
      "Official case studies, project pages and company news",
      "Corporate homepage only as supporting context",
    ], 8, 160),
    exclusionRules: unique([
      "Exclude the customer's own company, domains and related brands",
      "Exclude vendors that merely sell a similarly named product unless they independently match the approved buyer profile",
      "Exclude directories, listicles, social-only profiles and unsupported aggregators as primary evidence",
      "Do not retain companies whose official evidence cannot support the commercial fit",
    ], 10, 220),
    diversificationRule: clip( input.searchPass > 1
      ? `Expansion pass ${input.searchPass} (${input.searchStrategy}) must explore archetypes, terminology or geography not exhausted by earlier passes while preserving the evidence gate.`
      : "Build a broad candidate pool across at least three distinct company archetypes before qualification; do not let one keyword family dominate the results.", 420),
  };

  return CompanySearchPlanSchema.parse(plan);
}
