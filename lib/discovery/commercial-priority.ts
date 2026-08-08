import type { VerifiedDiscoveredCompany } from "@/lib/discovery/schemas";

export type CommercialPriorityTier = "A" | "B" | "C";
export type CommercialPriority = {
  score: number;
  tier: CommercialPriorityTier;
  reasons: string[];
};

function clamp(value:number){return Math.max(0,Math.min(100,Math.round(value)));}

/**
 * Deterministic, evidence-aware ordering only. This does not replace GPT
 * commercial reasoning and never removes a verified company from eligibility.
 * It simply lets the expensive route/research queue start with the strongest
 * verified accounts first.
 */
export function scoreCommercialPriority(company: VerifiedDiscoveredCompany): CommercialPriority {
  const fit=company.fitBreakdown;
  const base =
    fit.commercialFit * 0.28 +
    fit.audienceFit * 0.20 +
    fit.operationalFit * 0.17 +
    fit.industryFit * 0.12 +
    fit.geographyFit * 0.05 +
    company.confidence * 0.10 +
    company.evidenceQuality * 0.08;

  const uncertaintyPenalty=Math.min(8,company.uncertainties.length*2);
  const riskPenalty=Math.min(10,company.riskFlags.length*2);
  const score=clamp(base-uncertaintyPenalty-riskPenalty);
  const tier:CommercialPriorityTier=score>=80?"A":score>=68?"B":"C";
  const reasons=[
    `Commercial fit ${fit.commercialFit}/100`,
    `Audience fit ${fit.audienceFit}/100`,
    `Evidence quality ${company.evidenceQuality}/100`,
  ];
  if(company.confidence>=80) reasons.push(`High discovery confidence ${company.confidence}/100`);
  if(company.riskFlags.length===0) reasons.push("No discovery risk flags");
  return {score,tier,reasons:reasons.slice(0,5)};
}
