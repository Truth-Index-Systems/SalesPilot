import type { ClaimCriticality, TruthClaim, TruthEntityType } from "./truth";

export type IntelligenceContractVersion = "MR-CONTRACTS-1.0";

export interface IntelligenceClaimDefinition {
  key: string;
  label: string;
  criticality: ClaimCriticality;
  weight: number;
  freshnessHalfLifeDays: number;
  /** Minimum number of evidence items expected before a claim can be considered adequately covered. */
  minimumEvidence: number;
  /** Whether this claim contributes to entity coverage. */
  countsTowardCoverage: boolean;
}

export interface IntelligenceContract {
  entityType: TruthEntityType;
  version: IntelligenceContractVersion;
  claims: readonly IntelligenceClaimDefinition[];
}

const d = (
  key: string,
  label: string,
  criticality: ClaimCriticality,
  weight: number,
  freshnessHalfLifeDays: number,
  minimumEvidence = 1,
  countsTowardCoverage = true,
): IntelligenceClaimDefinition => ({
  key,
  label,
  criticality,
  weight,
  freshnessHalfLifeDays,
  minimumEvidence,
  countsTowardCoverage,
});

export const INDUSTRY_INTELLIGENCE_CONTRACT: IntelligenceContract = {
  entityType: "industry",
  version: "MR-CONTRACTS-1.0",
  claims: [
    d("identity", "Industry identity", "CRITICAL", 4, 730),
    d("definition", "Industry definition", "REQUIRED", 2, 365),
    d("sector_structure", "Sector structure", "REQUIRED", 2, 180),
    d("buyer_archetypes", "Buyer archetypes", "REQUIRED", 2, 90),
    d("commercial_problems", "Commercial problems", "REQUIRED", 2, 60),
    d("buying_signals", "Buying signals", "SUPPORTING", 1.5, 30, 2),
    d("company_coverage", "Company coverage", "REQUIRED", 2.5, 30),
    d("contact_coverage", "Contact coverage", "SUPPORTING", 1.5, 30),
    d("route_coverage", "Route coverage", "SUPPORTING", 1.5, 30),
  ],
};

export const SECTOR_INTELLIGENCE_CONTRACT: IntelligenceContract = {
  entityType: "sector",
  version: "MR-CONTRACTS-1.0",
  claims: [
    d("identity", "Sector identity", "CRITICAL", 4, 730),
    d("parent_industry", "Parent industry", "CRITICAL", 4, 365),
    d("definition", "Sector definition", "REQUIRED", 2, 365),
    d("business_models", "Common business models", "REQUIRED", 2, 180),
    d("buyer_archetypes", "Buyer archetypes", "REQUIRED", 2, 90),
    d("commercial_problems", "Commercial problems", "REQUIRED", 2, 60),
    d("buying_signals", "Buying signals", "SUPPORTING", 1.5, 30, 2),
    d("company_coverage", "Company coverage", "REQUIRED", 2.5, 30),
  ],
};

export const COMPANY_INTELLIGENCE_CONTRACT: IntelligenceContract = {
  entityType: "company",
  version: "MR-CONTRACTS-1.0",
  claims: [
    d("identity", "Canonical company identity", "CRITICAL", 4, 365),
    d("canonical_domain", "Canonical company domain", "CRITICAL", 4, 180),
    d("current_operation", "Company currently operating", "CRITICAL", 4, 60),
    d("industry", "Industry", "REQUIRED", 2.5, 180),
    d("sector", "Sector", "REQUIRED", 2, 120),
    d("geography", "Operating geography", "REQUIRED", 2, 120),
    d("offering", "Products and services", "REQUIRED", 2.5, 90),
    d("customer_market", "Customer market", "REQUIRED", 2.5, 90),
    d("company_scale", "Company scale", "SUPPORTING", 1, 60),
    d("commercial_problems", "Relevant commercial problems", "REQUIRED", 2, 45),
    d("buying_signals", "Current buying signals", "SUPPORTING", 1.5, 14, 2),
    d("contact_coverage", "Decision-maker coverage", "REQUIRED", 2, 30),
    d("route_coverage", "Commercial route coverage", "REQUIRED", 2, 30),
  ],
};

export const CONTACT_INTELLIGENCE_CONTRACT: IntelligenceContract = {
  entityType: "contact",
  version: "MR-CONTRACTS-1.0",
  claims: [
    d("identity", "Person identity", "CRITICAL", 4, 365),
    d("company_relationship", "Current company relationship", "CRITICAL", 4, 45),
    d("current_employment", "Current employment", "CRITICAL", 4, 45),
    d("role", "Current role", "REQUIRED", 2.5, 45),
    d("seniority", "Seniority", "REQUIRED", 2, 60),
    d("authority", "Commercial authority", "REQUIRED", 2.5, 45),
    d("work_location", "Work location", "SUPPORTING", 1, 120),
    d("linkedin", "LinkedIn/profile URL", "SUPPORTING", 1, 90),
    d("email", "Work email", "SUPPORTING", 1.5, 90),
    d("email_verification", "Email verification", "SUPPORTING", 1.5, 30),
    d("commercial_relevance", "Commercial relevance", "REQUIRED", 2, 45),
  ],
};

export const ROUTE_INTELLIGENCE_CONTRACT: IntelligenceContract = {
  entityType: "route",
  version: "MR-CONTRACTS-1.0",
  claims: [
    d("target_company", "Target company", "CRITICAL", 4, 60),
    d("route_identity", "Route identity", "CRITICAL", 4, 45),
    d("entry_point", "Entry point", "REQUIRED", 2.5, 45),
    d("decision_maker", "Decision maker", "REQUIRED", 2.5, 45),
    d("problem", "Commercial problem", "REQUIRED", 2.5, 30),
    d("commercial_rationale", "Commercial rationale", "REQUIRED", 2.5, 30),
    d("route_path", "Route path", "REQUIRED", 2, 30),
    d("supporting_signal", "Supporting signal", "SUPPORTING", 1.5, 14),
    d("dependencies", "Route dependencies", "SUPPORTING", 1, 30),
    d("risks", "Route risks and uncertainties", "SUPPORTING", 1, 30),
  ],
};

export const OPPORTUNITY_INTELLIGENCE_CONTRACT: IntelligenceContract = {
  entityType: "opportunity",
  version: "MR-CONTRACTS-1.0",
  claims: [
    d("company", "Company", "CRITICAL", 4, 60),
    d("commercial_fit", "Commercial fit", "CRITICAL", 4, 30),
    d("viable_route", "Viable commercial route", "CRITICAL", 4, 30),
    d("contact", "Relevant contact", "REQUIRED", 2.5, 45),
    d("commercial_reason", "Commercial reason", "REQUIRED", 2.5, 30),
    d("timing_signal", "Timing signal", "SUPPORTING", 1.5, 14),
    d("supporting_evidence", "Supporting evidence", "REQUIRED", 2.5, 30, 2),
    d("outreach_hypothesis", "Outreach hypothesis", "SUPPORTING", 1, 30),
    d("risks", "Risks and uncertainty", "SUPPORTING", 1, 30),
  ],
};

export const GENESIS_G8_INTELLIGENCE_CONTRACTS: Readonly<Record<TruthEntityType, IntelligenceContract>> = {
  industry: INDUSTRY_INTELLIGENCE_CONTRACT,
  sector: SECTOR_INTELLIGENCE_CONTRACT,
  company: COMPANY_INTELLIGENCE_CONTRACT,
  contact: CONTACT_INTELLIGENCE_CONTRACT,
  route: ROUTE_INTELLIGENCE_CONTRACT,
  opportunity: OPPORTUNITY_INTELLIGENCE_CONTRACT,
};

export function getIntelligenceContract(entityType: TruthEntityType): IntelligenceContract {
  return GENESIS_G8_INTELLIGENCE_CONTRACTS[entityType];
}

export function materialiseContractClaims(
  entityType: TruthEntityType,
  evidenceByClaimKey: Readonly<Record<string, TruthClaim["evidence"]>> = {},
): TruthClaim[] {
  return getIntelligenceContract(entityType).claims.map((definition) => ({
    id: `${entityType}:${definition.key}`,
    key: definition.key,
    label: definition.label,
    criticality: definition.criticality,
    weight: definition.weight,
    evidence: [...(evidenceByClaimKey[definition.key] ?? [])].map((evidence) => ({
      ...evidence,
      freshnessHalfLifeDays: definition.freshnessHalfLifeDays,
    })),
  }));
}

export function contractCoverageRequirements(entityType: TruthEntityType) {
  const claims = getIntelligenceContract(entityType).claims.filter((claim) => claim.countsTowardCoverage);
  const totalWeight = claims.reduce((sum, claim) => sum + claim.weight, 0);
  return {
    entityType,
    contractVersion: getIntelligenceContract(entityType).version,
    claimCount: claims.length,
    totalWeight,
    criticalClaimKeys: claims.filter((claim) => claim.criticality === "CRITICAL").map((claim) => claim.key),
  };
}
