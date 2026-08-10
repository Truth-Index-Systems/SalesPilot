import type { ContactDiscoveryResult } from "./schemas";

/** MR-R1 Build 8 deterministic ranking compatibility fence. */
export const MARKETROUTE_CONTACT_ROUTE_AUTHORITY_VERSION = "MR-R1-BUILD8-1.0.0" as const;

const clamp = (value: number): number => Math.max(0, Math.min(100, Math.round(Number.isFinite(value) ? value : 0)));

export function deterministicContactOverall(input: {
  identity: number; role: number; buyingRelevance: number; operationalRelevance: number; evidenceQuality: number;
  unknownCount?: number; riskCount?: number;
}): number {
  const base = input.identity * 0.24 + input.role * 0.20 + input.buyingRelevance * 0.24 + input.operationalRelevance * 0.12 + input.evidenceQuality * 0.20;
  const penalty = Math.min(18, (input.unknownCount ?? 0) * 2 + (input.riskCount ?? 0) * 3);
  return clamp(base - penalty);
}

export function deterministicConfidenceLabel(overall: number): "VERIFIED" | "LIKELY" | "POSSIBLE" | "UNKNOWN" {
  if (overall >= 88) return "VERIFIED";
  if (overall >= 72) return "LIKELY";
  if (overall >= 50) return "POSSIBLE";
  return "UNKNOWN";
}

export function deterministicChannelRouting(input: {
  confidence: number; responseLikelihood: number; campaignRelevance: number; publicVerified: boolean;
}): number {
  return clamp(input.confidence * 0.30 + input.responseLikelihood * 0.25 + input.campaignRelevance * 0.30 + (input.publicVerified ? 15 : 5));
}

export function deterministicRouteOrderingScore(input: {
  authority: number; accessibility: number; commercialRelevance: number; evidenceQuality: number; resilience: number; confidence: number;
}): number {
  return clamp(
    input.authority * 0.17 + input.accessibility * 0.21 + input.commercialRelevance * 0.22 +
    input.evidenceQuality * 0.18 + input.resilience * 0.12 + input.confidence * 0.10,
  );
}

/**
 * Final authoritative ordering pass. Call only after source/evidence normalisation,
 * because normalisation may change evidence quality, confidence or remove channels.
 * Model-provided aggregate/ranking values are never authoritative.
 */
export function finaliseDeterministicContactRouteAuthority(result: ContactDiscoveryResult): ContactDiscoveryResult {
  const contacts = result.contacts
    .map(contact => {
      const overall = deterministicContactOverall({
        identity: contact.confidence.identity,
        role: contact.confidence.role,
        buyingRelevance: contact.confidence.buyingRelevance,
        operationalRelevance: contact.confidence.operationalRelevance,
        evidenceQuality: contact.confidence.evidenceQuality,
        unknownCount: contact.unknowns.length,
        riskCount: contact.riskFlags.length,
      });
      return {
        ...contact,
        confidence: {
          ...contact.confidence,
          overall,
          label: deterministicConfidenceLabel(overall),
        },
      };
    })
    .sort((a, b) => b.confidence.overall - a.confidence.overall || a.fullName.localeCompare(b.fullName));

  const companyContactChannels = result.companyContactChannels
    .map(channel => ({
      ...channel,
      routingScore: deterministicChannelRouting({
        confidence: channel.confidence,
        responseLikelihood: channel.responseLikelihood,
        campaignRelevance: channel.campaignRelevance,
        publicVerified: channel.verificationStatus === "PUBLIC_VERIFIED",
      }),
    }))
    .sort((a, b) => b.routingScore - a.routingScore || a.emailAddress.localeCompare(b.emailAddress));

  const routes = [...result.routes]
    .sort((a, b) => deterministicRouteOrderingScore(b) - deterministicRouteOrderingScore(a) || a.routeKey.localeCompare(b.routeKey));

  return { ...result, contacts, companyContactChannels, routes };
}
