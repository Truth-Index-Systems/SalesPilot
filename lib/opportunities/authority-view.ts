import type { CieOpportunityAuthorityState, OpportunityOverview } from "./domain";

export function presentOpportunityAuthorityState(state: CieOpportunityAuthorityState): string {
  switch (state) {
    case "READY": return "READY";
    case "REJECTED": return "Commercial reality rejected";
    case "TEMPORAL_HOLD": return "Temporal hold";
    case "RESEARCH_REQUIRED": return "Research required";
    case "ROUTE_UNRESOLVED": return "Route unresolved";
    case "ROUTE_STALE": return "Route stale";
    case "CONTACT_UNRESOLVED": return "Contact unresolved";
    case "CONTACT_STALE": return "Contact stale";
    case "COMMERCIAL_AUTHORITY_STALE": return "Commercial authority stale";
    default: return "Commercial reality pending";
  }
}

export function isOpportunityAuthorityReady(row: OpportunityOverview): boolean {
  return row.authority_state === "READY" && row.authority_ready && row.authority_current && row.r4_current && row.r5_current && row.r6_current;
}

export function opportunityAuthorityNeedsResearch(row: OpportunityOverview): boolean {
  return ["AWAITING_COMMERCIAL_REALITY","RESEARCH_REQUIRED","ROUTE_UNRESOLVED","CONTACT_UNRESOLVED"].includes(row.authority_state);
}

export function opportunityAuthorityIsStale(row: OpportunityOverview): boolean {
  return ["COMMERCIAL_AUTHORITY_STALE","ROUTE_STALE","CONTACT_STALE"].includes(row.authority_state);
}
