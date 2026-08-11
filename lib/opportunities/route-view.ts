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
  authorityState: "OPEN" | "UNRESOLVED";
  evidenceState: "EVIDENCE_LINKED" | "EVIDENCE_INCOMPLETE";
  evidenceSummary: string;
  recommendation: string;
  nextStep: string;
  isReady: boolean;
};

export function buildAccessRoute(row: OpportunityOverview): AccessRouteView {
  const intelligentChannel = row.commercial_route_channel_value || null;
  const intelligentType = row.commercial_route_channel_type || null;
  const intelligentEmail = intelligentChannel && ["DIRECT_EMAIL", "DEPARTMENT_EMAIL", "GENERAL_EMAIL"].includes(intelligentType || "") ? intelligentChannel : null;
  const intelligentLinkedIn = intelligentChannel && intelligentType === "LINKEDIN" ? intelligentChannel : null;
  const email = intelligentEmail || row.primary_contact_email || row.primary_route_email || null;
  const emailStatus = intelligentEmail ? "ROUTE_VERIFIED" : row.primary_contact_email_status || row.primary_route_verification_status || null;
  const linkedinUrl = intelligentLinkedIn || row.primary_contact_linkedin_url || null;
  const phone = intelligentChannel && intelligentType === "SWITCHBOARD" ? intelligentChannel : null;
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

  const isReady = Boolean(email || linkedinUrl || (intelligentChannel && intelligentType && intelligentType !== "UNKNOWN"));
  const authorityState: AccessRouteView["authorityState"] = isReady ? "OPEN" : "UNRESOLVED";
  const evidenceCount = Number(row.commercial_route_evidence_count || 0) + Number(row.contact_evidence_count || 0);
  const evidenceState: AccessRouteView["evidenceState"] = evidenceCount > 0 ? "EVIDENCE_LINKED" : "EVIDENCE_INCOMPLETE";
  const evidenceSummary = evidenceCount > 0
    ? `${evidenceCount} linked route evidence source${evidenceCount === 1 ? "" : "s"}.`
    : "Route evidence is still being assembled.";

  const recommendation = row.commercial_route_rationale || row.recommended_entry_strategy || row.primary_route_reason || row.contact_reason_selected || (
    isReady
      ? "This route is currently authorised by the CIE route/contact decision path."
      : "MarketRoute is still gathering enough evidence to establish an OPEN commercial route."
  );
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
    authorityState,
    evidenceState,
    evidenceSummary,
    recommendation,
    nextStep,
    isReady,
  };
}
