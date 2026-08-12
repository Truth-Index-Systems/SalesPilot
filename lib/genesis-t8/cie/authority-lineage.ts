/**
 * MarketRoute Forensic Build 3 — authority lineage fingerprints.
 *
 * Exact production identity and material downstream authority are deliberately
 * separated. Time-aware Truth may create a new exact trace without changing
 * the commercial authority that R5/R6 are allowed to consume.
 */
import type { CieR4CommercialDecision } from "./commercial-decision-authority";
import type { GenesisT8CommercialRealityPropagation } from "../mathematics/constraint-propagation";

export const MARKETROUTE_FORENSIC_BUILD3_STATE_VERSION = "MR-T8-FB3-STATE-1.0.0" as const;

function hash(value: unknown): string {
  const text = JSON.stringify(value);
  const prime = 0x100000001b3n, mask = 0xffffffffffffffffn;
  const seeds = [0xcbf29ce484222325n, 0x84222325cbf29cen, 0x9e3779b97f4a7c15n, 0xd6e8feb86659fd93n];
  return seeds.map((seed) => {
    let h = seed;
    for (let i = 0; i < text.length; i += 1) { h ^= BigInt(text.charCodeAt(i)); h = (h * prime) & mask; }
    return h.toString(16).padStart(16, "0");
  }).join("");
}

function canonicalText(value: string | null | undefined): string | null {
  const v = (value ?? "").trim().toLowerCase();
  return v || null;
}

function canonicalUnknown(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalUnknown);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, child]) => [key, canonicalUnknown(child)]));
  }
  if (typeof value === "string") return value.trim();
  return value;
}

export type R4MaterialAuthorityFingerprintInput = Readonly<{
  sellerContextFingerprint: string;
  constraintFingerprint: string;
  targetTruthEntityId: string;
  targetFacts: Readonly<{ companyId: string; canonicalDomain: string | null; industry: string | null; country: string | null }>;
  propagation: GenesisT8CommercialRealityPropagation;
  decision: CieR4CommercialDecision;
}>;

/**
 * Fingerprints only facts that can alter downstream commercial authority.
 * Exact snapshot/reference-time identity is intentionally excluded; those live
 * in the production input fingerprint and research basis instead.
 */
export function buildR4MaterialAuthorityFingerprint(input: R4MaterialAuthorityFingerprintInput): string {
  const boundaryStates = input.propagation.states
    .filter((state) => state.local.constraintClass === "BOUNDARY")
    .map((state) => ({
      constraintId: state.constraintId,
      applicability: state.local.applicability,
      semanticPolarity: state.local.semanticPolarity,
      localState: state.local.localState,
    }))
    .sort((a, b) => a.constraintId.localeCompare(b.constraintId));
  const limitingStates = input.propagation.states
    .filter((state) => state.local.constraintClass === "LIMITING")
    .map((state) => ({
      constraintId: state.constraintId,
      applicability: state.local.applicability,
      semanticPolarity: state.local.semanticPolarity,
      localState: state.local.localState,
    }))
    .sort((a, b) => a.constraintId.localeCompare(b.constraintId));

  return hash({
    stateVersion: MARKETROUTE_FORENSIC_BUILD3_STATE_VERSION,
    sellerContextFingerprint: input.sellerContextFingerprint,
    constraintFingerprint: input.constraintFingerprint,
    targetTruthEntityId: input.targetTruthEntityId,
    targetFacts: {
      companyId: input.targetFacts.companyId,
      canonicalDomain: canonicalText(input.targetFacts.canonicalDomain),
      industry: canonicalText(input.targetFacts.industry),
      country: canonicalText(input.targetFacts.country),
    },
    commercialAuthority: {
      realityId: input.decision.realityId,
      targetEntityId: input.decision.targetEntityId,
      realityState: input.decision.realityState,
      disposition: input.decision.disposition,
      viability: input.propagation.viability,
      eliminatingConstraintIds: [...input.propagation.eliminatingConstraintIds].sort(),
      unresolvedBoundaryConstraintIds: [...input.propagation.unresolvedBoundaryConstraintIds].sort(),
      boundaryStates,
      limitingStates,
      criticalDimensions: [...input.decision.stability.criticalDimensions].sort(),
    },
  });
}

/** R6 input identity uses only the route/contact fields its current evaluator can consume. */
export function buildR6AuthoritySourceFingerprint(input: Readonly<{
  r4AuthorityFingerprint: string;
  routes: readonly unknown[];
  contacts: readonly unknown[];
}>): string {
  const byId = (a: unknown, b: unknown): number => String((a as any)?.id ?? "").localeCompare(String((b as any)?.id ?? ""));
  return hash({
    stateVersion: MARKETROUTE_FORENSIC_BUILD3_STATE_VERSION,
    r4AuthorityFingerprint: input.r4AuthorityFingerprint,
    routes: [...input.routes].sort(byId).map(canonicalUnknown),
    contacts: [...input.contacts].sort(byId).map(canonicalUnknown),
  });
}
