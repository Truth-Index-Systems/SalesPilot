import type { AiEnvelope } from "@/lib/ai/contracts";
import type { BusinessDnaPayload, CampaignProposal } from "@/lib/ai/schemas/business-dna";

/**
 * GPT models sometimes interpret an otherwise valid integer score as a 0–10
 * rating even when the transport schema permits 0–100. Only rescale when the
 * accompanying confidence makes that interpretation credible. Genuine low
 * confidence proposals remain low rather than being promoted automatically.
 */
export function normaliseCampaignFitScore(score: number, confidence: number): number {
  const bounded = Math.max(0, Math.min(100, Math.round(score)));
  if (bounded >= 1 && bounded <= 10 && confidence >= 0.5) {
    return Math.min(100, bounded * 10);
  }
  return bounded;
}

export function normaliseCampaignProposal(proposal: CampaignProposal): CampaignProposal {
  return {
    ...proposal,
    fitScore: normaliseCampaignFitScore(proposal.fitScore, proposal.confidence),
  };
}

export function normaliseBusinessDnaPayload(payload: BusinessDnaPayload): BusinessDnaPayload {
  return {
    ...payload,
    campaigns: payload.campaigns.map(normaliseCampaignProposal),
  };
}

export function normaliseBusinessAnalysis(
  analysis: AiEnvelope<BusinessDnaPayload>,
): AiEnvelope<BusinessDnaPayload> {
  return {
    ...analysis,
    payload: normaliseBusinessDnaPayload(analysis.payload),
  };
}

export function campaignMatchLabel(score: number): string {
  if (score >= 90) return "Strongest match";
  if (score >= 80) return "Strong match";
  if (score >= 65) return "Good match";
  if (score >= 45) return "Possible match";
  return "Low match";
}
