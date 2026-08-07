import type { OpportunityOverview } from "@/lib/opportunities/domain";

export type AccessRouteView = {
  personName: string | null;
  role: string;
  type: "direct_email" | "linkedin" | "email_route" | "switchboard" | "introduction" | "unverified";
  typeLabel: string;
  email: string | null;
  emailStatus: string | null;
  linkedinUrl: string | null;
  phone: string | null;
  confidence: number;
  quality: number;
  qualityStars: string;
  qualityLabel: string;
  confidenceLabel: string;
  confidenceSummary: string;
  recommendation: string;
  nextStep: string;
  isReady: boolean;
};

function clampScore(value: number | null | undefined) {
  if (!Number.isFinite(Number(value))) return 0;
  return Math.max(0, Math.min(100, Math.round(Number(value))));
}

function qualityFromConfidence(confidence: number) {
  if (confidence >= 95) return 5;
  if (confidence >= 85) return 4;
  if (confidence >= 70) return 3;
  if (confidence >= 55) return 2;
  return 1;
}

function stars(quality: number) {
  return `${"★".repeat(quality)}${"☆".repeat(5 - quality)}`;
}

function qualityLabel(quality: number) {
  if (quality >= 5) return "Exceptional route";
  if (quality >= 4) return "Strong route";
  if (quality >= 3) return "Viable route";
  if (quality >= 2) return "Limited route";
  return "Early route";
}

function confidencePresentation(confidence: number) {
  if (confidence >= 90) return { label: "High confidence", summary: "Evidence strongly supports this route." };
  if (confidence >= 70) return { label: "Good confidence", summary: "The route is supported, with some uncertainty remaining." };
  if (confidence >= 50) return { label: "Moderate confidence", summary: "Useful route signals exist, but human judgement is still important." };
  return { label: "Low confidence", summary: "SalesPilot needs stronger route evidence before relying on this path." };
}

export function buildAccessRoute(row: OpportunityOverview): AccessRouteView {
  const intelligentChannel = row.commercial_route_channel_value || null;
  const intelligentType = row.commercial_route_channel_type || null;
  const intelligentEmail = intelligentChannel && ["DIRECT_EMAIL","DEPARTMENT_EMAIL","GENERAL_EMAIL"].includes(intelligentType || "") ? intelligentChannel : null;
  const intelligentLinkedIn = intelligentChannel && intelligentType === "LINKEDIN" ? intelligentChannel : null;
  const email = intelligentEmail || row.primary_contact_email || row.primary_route_email || null;
  const emailStatus = intelligentEmail ? "ROUTE_VERIFIED" : row.primary_contact_email_status || row.primary_route_verification_status || null;
  const linkedinUrl = intelligentLinkedIn || row.primary_contact_linkedin_url || null;
  const phone = intelligentChannel && intelligentType === "SWITCHBOARD" ? intelligentChannel : null;
  const confidence = clampScore(
    row.commercial_route_confidence ?? row.route_confidence ?? row.primary_route_confidence ?? row.primary_contact_confidence ?? row.primary_route_score ?? row.contactability ?? 0,
  );
  const qualityScore = clampScore(row.commercial_route_quality ?? row.route_quality ?? row.primary_route_score ?? confidence);
  const quality = qualityFromConfidence(qualityScore);
  const role = row.commercial_route_target_role || row.commercial_route_contact_role || row.primary_contact_role || row.primary_route_likely_reader || "Commercial decision maker";

  let type: AccessRouteView["type"] = "unverified";
  let typeLabel = "Route research in progress";
  if (email && (row.commercial_route_contact_name || row.primary_contact_name)) {
    type = "direct_email";
    typeLabel = "Direct email";
  } else if (linkedinUrl) {
    type = "linkedin";
    typeLabel = "LinkedIn route";
  } else if (email) {
    type = "email_route";
    typeLabel = "Verified email route";
  } else if (intelligentType === "SWITCHBOARD" && intelligentChannel) {
    type = "switchboard";
    typeLabel = "Switchboard route";
  } else if (intelligentType === "INTRODUCTION" && intelligentChannel) {
    type = "introduction";
    typeLabel = "Introduction route";
  }

  const reasons: string[] = [];
  if (email) reasons.push("a supported email route is available");
  if (linkedinUrl) reasons.push("a public LinkedIn profile is available");
  if (phone) reasons.push(`a verified switchboard number (${phone}) is available`);
  if ((row.buying_authority ?? 0) >= 70) reasons.push("the role has strong purchasing authority");
  if ((row.contactability ?? 0) >= 70) reasons.push("the route is highly accessible");

  const recommendation = row.commercial_route_rationale || row.recommended_entry_strategy || row.primary_route_reason || row.contact_reason_selected || (
    reasons.length
      ? `Recommended because ${reasons.slice(0, 2).join(" and ")}.`
      : "SalesPilot is still gathering enough evidence to recommend a reliable entry route."
  );
  const confidencePresentationValue = confidencePresentation(confidence);
  const nextStep = row.commercial_route_next_step || (email
    ? `Approach ${row.commercial_route_contact_name || row.primary_contact_name || role} through the supported email route and anchor the opening message to the identified commercial need.`
    : linkedinUrl
      ? `Use LinkedIn to establish relevance with ${row.commercial_route_contact_name || row.primary_contact_name || role}, then earn a direct conversation or introduction.`
      : phone
        ? `Call ${phone} and use the verified switchboard route to reach ${row.commercial_route_contact_name || row.primary_contact_name || role}.`
        : "Continue route research before beginning outreach.");

  return {
    personName: row.commercial_route_contact_name || row.primary_contact_name,
    role,
    type,
    typeLabel,
    email,
    emailStatus,
    linkedinUrl,
    phone,
    confidence,
    quality,
    qualityStars: stars(quality),
    qualityLabel: qualityLabel(quality),
    confidenceLabel: confidencePresentationValue.label,
    confidenceSummary: confidencePresentationValue.summary,
    recommendation,
    nextStep,
    isReady: Boolean(email || linkedinUrl || (intelligentChannel && intelligentType && intelligentType !== "UNKNOWN")),
  };
}

export function routeConfidenceClass(confidence: number) {
  if (confidence >= 90) return "high";
  if (confidence >= 70) return "good";
  if (confidence >= 50) return "moderate";
  return "low";
}
