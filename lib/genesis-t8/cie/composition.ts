/**
 * CIE-R1 Constitutional Composition.
 * Additive migration constitution. Does not change live behaviour.
 */
export const CIE_COMPOSITION_VERSION = "1.0.0" as const;

export type CieAuthorityMode = "AUTHORITATIVE" | "SHADOW" | "PRESENTATION_ONLY" | "LEGACY_TO_ERADICATE";
export type CieOwner = "AI" | "TRUTH_INDEX" | "CE1" | "UDOSIB" | "MARKETROUTE" | "LEGACY";

export type CieBoundaryContract = Readonly<{
  id: string;
  owner: CieOwner;
  assumes: readonly string[];
  guarantees: readonly string[];
  owns: readonly string[];
  mayNotOwn: readonly string[];
}>;

export const CIE_BOUNDARY_CONTRACTS = Object.freeze([
  {
    id: "EVIDENCE_TO_AI",
    owner: "AI",
    assumes: ["source material is acquired with provenance"],
    guarantees: ["semantic proposals are explicit", "semantic uncertainty is preserved"],
    owns: ["interpretation", "classification", "entity resolution", "relationship proposal"],
    mayNotOwn: ["truth probability", "commercial ranking", "route ranking", "contact ranking", "opportunity ranking"],
  },
  {
    id: "AI_TO_CE1",
    owner: "CE1",
    assumes: ["AI output is a semantic proposal rather than an authoritative decision"],
    guarantees: ["canonical typed commercial knowledge", "stable identities", "ontology-conformant relationships"],
    owns: ["canonical representation", "commercial ontology", "commercial graph structure"],
    mayNotOwn: ["truth probability", "commercial desirability", "decision ranking"],
  },
  {
    id: "CE1_TO_TRUTH",
    owner: "TRUTH_INDEX",
    assumes: ["canonical claims retain evidence provenance"],
    guarantees: ["truth qualification", "contradiction state", "freshness qualification", "evidence dependence metadata"],
    owns: ["truth", "confidence", "coverage", "evidence dependence", "truth contradiction", "freshness"],
    mayNotOwn: ["commercial desirability", "route ranking", "contact ranking", "opportunity ranking"],
  },
  {
    id: "TRUTH_TO_UDOSIB",
    owner: "UDOSIB",
    assumes: ["only truth-qualified canonical knowledge enters commercial reasoning"],
    guarantees: ["deterministic commercial reality", "epistemic state", "temporal state", "constraint reasoning", "auditable decision trace"],
    owns: ["commercial reasoning", "commercial stability", "research priority", "commercial graph reasoning", "counterfactual recourse", "opportunity projection"],
    mayNotOwn: ["semantic interpretation", "truth probability", "evidence fabrication"],
  },
  {
    id: "UDOSIB_TO_MARKETROUTE",
    owner: "MARKETROUTE",
    assumes: ["CIE decision output is deterministic and auditable"],
    guarantees: ["application workflow never overrides CIE commercial authority"],
    owns: ["presentation", "workflow", "human approval", "execution mechanics"],
    mayNotOwn: ["commercial ranking", "route ranking", "contact ranking", "truth calculation"],
  },
] as const satisfies readonly CieBoundaryContract[]);

export type CieAuthorityPath = Readonly<{
  id: string;
  source: string;
  decision: string;
  currentOwner: CieOwner;
  targetOwner: CieOwner;
  currentMode: CieAuthorityMode;
  targetRelease: "CIE-R2" | "CIE-R3" | "CIE-R4" | "CIE-R5" | "CIE-R6" | "CIE-R7" | "CIE-R8";
}>;

export const CIE_AUTHORITY_MIGRATION_MAP = Object.freeze([
  { id: "LIVE_OPPORTUNITY_SCORING", source: "lib/opportunities/scoring.ts", decision: "opportunity scoring", currentOwner: "LEGACY", targetOwner: "UDOSIB", currentMode: "SHADOW", targetRelease: "CIE-R4" },
  { id: "CIE_R4_COMMERCIAL_DECISION", source: "lib/genesis-t8/cie/commercial-decision-authority.ts", decision: "commercial opportunity decision", currentOwner: "UDOSIB", targetOwner: "UDOSIB", currentMode: "AUTHORITATIVE", targetRelease: "CIE-R4" },
  { id: "CONTACT_WEIGHTED_AUTHORITY", source: "lib/contacts/deterministic-authority.ts", decision: "contact ranking", currentOwner: "LEGACY", targetOwner: "UDOSIB", currentMode: "PRESENTATION_ONLY", targetRelease: "CIE-R6" },
  { id: "ROUTE_WEIGHTED_AUTHORITY", source: "lib/contacts/deterministic-authority.ts", decision: "route ranking", currentOwner: "LEGACY", targetOwner: "UDOSIB", currentMode: "SHADOW", targetRelease: "CIE-R5" },
  { id: "CIE_R5_ROUTE_AUTHORITY", source: "lib/genesis-t8/cie/route-authority.ts", decision: "route ranking", currentOwner: "UDOSIB", targetOwner: "UDOSIB", currentMode: "AUTHORITATIVE", targetRelease: "CIE-R5" },
  { id: "G5_AI_ROUTE_SELECTION", source: "lib/engagement/g5-channel-strategy-openai.ts", decision: "primary/secondary/fallback route selection", currentOwner: "AI", targetOwner: "UDOSIB", currentMode: "SHADOW", targetRelease: "CIE-R5" },
  { id: "CIE_R5_EXECUTION_ROUTE_SELECTION", source: "lib/genesis-t8/cie/route-authority.ts", decision: "primary/secondary/fallback route selection", currentOwner: "UDOSIB", targetOwner: "UDOSIB", currentMode: "AUTHORITATIVE", targetRelease: "CIE-R5" },
  { id: "G5_ENGAGEMENT_CONFIDENCE", source: "lib/engagement/g5-engagement-quality.ts", decision: "autonomous engagement quality authority", currentOwner: "LEGACY", targetOwner: "UDOSIB", currentMode: "PRESENTATION_ONLY", targetRelease: "CIE-R8" },
  { id: "CIE_R8_AUTOPILOT_GATE", source: "supabase/migrations/0146_genesis_t8_cie_r8_legacy_math_eradication.sql", decision: "autonomous engagement quality authority", currentOwner: "UDOSIB", targetOwner: "UDOSIB", currentMode: "AUTHORITATIVE", targetRelease: "CIE-R8" },
  { id: "CE2_EVOLUTION_LIBRARY", source: "lib/genesis-t8/ce2-evolution", decision: "commercial decision calculus", currentOwner: "UDOSIB", targetOwner: "UDOSIB", currentMode: "AUTHORITATIVE", targetRelease: "CIE-R3" },
] as const satisfies readonly CieAuthorityPath[]);

export function assertCieBoundaryContracts(): void {
  const ids = new Set<string>();
  for (const contract of CIE_BOUNDARY_CONTRACTS) {
    if (ids.has(contract.id)) throw new Error(`CIE_COMPOSITION_VIOLATION:DUPLICATE_BOUNDARY:${contract.id}`);
    ids.add(contract.id);
    if (!contract.assumes.length || !contract.guarantees.length || !contract.owns.length || !contract.mayNotOwn.length) {
      throw new Error(`CIE_COMPOSITION_VIOLATION:INCOMPLETE_BOUNDARY:${contract.id}`);
    }
  }
}

export function assertSingleAuthority(paths: readonly CieAuthorityPath[]): void {
  const authoritative = new Map<string, string>();
  for (const path of paths) {
    if (path.currentMode !== "AUTHORITATIVE") continue;
    const prior = authoritative.get(path.decision);
    if (prior) throw new Error(`CIE_AUTHORITY_VIOLATION:DUAL_AUTHORITY:${path.decision}:${prior}:${path.id}`);
    authoritative.set(path.decision, path.id);
  }
}

export function assertShadowCannotControl(mode: CieAuthorityMode): void {
  if (mode === "SHADOW") throw new Error("CIE_AUTHORITY_VIOLATION:SHADOW_CANNOT_CONTROL");
}

export function getCieBoundary(id: string): CieBoundaryContract | undefined {
  return CIE_BOUNDARY_CONTRACTS.find((x) => x.id === id);
}

assertCieBoundaryContracts();
assertSingleAuthority(CIE_AUTHORITY_MIGRATION_MAP);
