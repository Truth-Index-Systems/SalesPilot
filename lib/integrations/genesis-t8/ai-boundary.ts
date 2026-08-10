/**
 * MR-R1 Build 7 — AI Boundary Hardening.
 *
 * AI owns semantic interpretation/research proposals only. Genesis is the sole
 * authority allowed to commit seller identity semantics as Business DNA,
 * Commercial Genome/Objectives and Constraint Contracts. Truth Index owns
 * truth qualification. UDOSIB/deterministic engines own commercial ranking.
 */
export const MARKETROUTE_GENESIS_AI_BOUNDARY_VERSION = "MR-R1-BUILD7-1.0.0" as const;

export const MARKETROUTE_GENESIS_AUTHORITATIVE_SELLER_ARTIFACTS = Object.freeze([
  "BUSINESS_DNA",
  "COMMERCIAL_GENOME",
  "COMMERCIAL_OBJECTIVES",
  "CONSTRAINT_CONTRACTS",
] as const);
export type MarketRouteGenesisAuthoritativeSellerArtifact =
  (typeof MARKETROUTE_GENESIS_AUTHORITATIVE_SELLER_ARTIFACTS)[number];

export const MARKETROUTE_GENESIS_FORBIDDEN_AI_DECISIONS = Object.freeze([
  "CONTACT_RANKING",
  "ROUTE_RANKING",
  "OPPORTUNITY_RANKING",
  "TRUTH_QUALIFICATION",
] as const);
export type MarketRouteGenesisForbiddenAiDecision =
  (typeof MARKETROUTE_GENESIS_FORBIDDEN_AI_DECISIONS)[number];

export type MarketRouteGenesisAuthorityActor =
  | "AI_SEMANTIC_PROPOSAL"
  | "GENESIS"
  | "TRUTH_INDEX"
  | "UDOSIB"
  | "MARKETROUTE_APPLICATION";

export function assertGenesisSellerArtifactCommitAuthority(
  actor: MarketRouteGenesisAuthorityActor,
  artifact: MarketRouteGenesisAuthoritativeSellerArtifact,
): void {
  if (actor !== "GENESIS") {
    throw new Error(`MARKETROUTE_GENESIS_AI_BOUNDARY_VIOLATION:${artifact}:AUTHORITATIVE_WRITER:${actor}`);
  }
}

export function assertAiDoesNotOwnDecision(decision: MarketRouteGenesisForbiddenAiDecision): never {
  throw new Error(`MARKETROUTE_GENESIS_AI_BOUNDARY_VIOLATION:${decision}:AI_MAY_ADVISE_SEMANTICS_ONLY`);
}

export const MARKETROUTE_GENESIS_AI_BOUNDARY = Object.freeze({
  version: MARKETROUTE_GENESIS_AI_BOUNDARY_VERSION,
  aiOwns: Object.freeze([
    "semantic interpretation",
    "web research",
    "entity/role identification",
    "evidence extraction",
    "semantic dimension proposals",
    "natural-language explanation",
  ]),
  genesisOwns: MARKETROUTE_GENESIS_AUTHORITATIVE_SELLER_ARTIFACTS,
  truthIndexOwns: Object.freeze(["truth qualification", "evidence confidence", "coverage", "freshness", "contradiction"]),
  udosibOwns: Object.freeze(["contact ranking", "route ranking", "opportunity ranking", "constraint reasoning", "commercial ordering"]),
});
