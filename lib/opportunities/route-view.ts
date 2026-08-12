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

/**
 * Founder-facing route read model.
 *
 * Forensic Build 4 deliberately treats `commercial_route_id` as the authority
 * boundary: opportunity_overview only populates that row from the primary route
 * of an ACTIVE MR-T8-FB4 R5 decision. Legacy contact channels are not allowed to
 * infer OPEN route authority.
 */
export function buildAccessRoute(row: OpportunityOverview): AccessRouteView {
  const hasAuthorisedRoute = Boolean(row.commercial_route_id);
  const intelligentChannel = hasAuthorisedRoute ? row.commercial_route_channel_value || null : null;
  const intelligentType = hasAuthorisedRoute ? row.commercial_route_channel_type || null : null;
  const email = intelligentChannel && ["DIRECT_EMAIL", "DEPARTMENT_EMAIL", "GENERAL_EMAIL"].includes(intelligentType || "") ? intelligentChannel : null;
  const linkedinUrl = intelligentChannel && intelligentType === "LINKEDIN" ? intelligentChannel : null;
  const phone = intelligentChannel && intelligentType === "SWITCHBOARD" ? intelligentChannel : null;
  const emailStatus = email ? "CIE_R5_OPEN" : null;
  const role = row.commercial_route_target_role || row.commercial_route_contact_role || "Commercial decision maker";

  let type: AccessRouteView["type"] = "unverified";
  let typeLabel = "Route research in progress";
  if (email && row.commercial_route_contact_name) {
    type = "direct_email";
    typeLabel = "Direct email";
  } else if (linkedinUrl) {
    type = "linkedin";
    typeLabel = "LinkedIn route";
  } else if (email) {
    type = "email_route";
    typeLabel = "Evidence-qualified email route";
  } else if (intelligentType === "SWITCHBOARD" && intelligentChannel) {
    type = "switchboard";
    typeLabel = "Switchboard route";
  } else if (intelligentType === "INTRODUCTION" && intelligentChannel) {
    type = "introduction";
    typeLabel = "Introduction route";
  }

  const isReady = Boolean(hasAuthorisedRoute && intelligentChannel && intelligentType && intelligentType !== "UNKNOWN");
  const authorityState: AccessRouteView["authorityState"] = isReady ? "OPEN" : "UNRESOLVED";
  const evidenceCount = hasAuthorisedRoute ? Number(row.commercial_route_evidence_count || 0) : 0;
  const evidenceState: AccessRouteView["evidenceState"] = isReady && evidenceCount > 0 ? "EVIDENCE_LINKED" : "EVIDENCE_INCOMPLETE";
  const evidenceSummary = isReady && evidenceCount > 0
    ? `${evidenceCount} qualifying evidence source${evidenceCount === 1 ? "" : "s"} support the authorised route.`
    : "No active evidence-qualified R5 route is currently authorised.";

  const recommendation = row.commercial_route_rationale || (
    isReady
      ? "This route is authorised by the current persisted CIE-R5 decision and bound downstream through R6."
      : "MarketRoute is still gathering enough evidence to establish an OPEN commercial route."
  );
  const nextStep = row.commercial_route_next_step || (email
    ? `Approach ${row.commercial_route_contact_name || role} through the evidence-qualified email route and anchor the opening message to the identified commercial need.`
    : linkedinUrl
      ? `Use the authorised LinkedIn route to establish relevance with ${row.commercial_route_contact_name || role}, then earn a direct conversation or introduction.`
      : phone
        ? `Call ${phone} through the evidence-qualified switchboard route to reach ${row.commercial_route_contact_name || role}.`
        : "Continue route research before beginning outreach.");

  return {
    personName: hasAuthorisedRoute ? row.commercial_route_contact_name : null,
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
