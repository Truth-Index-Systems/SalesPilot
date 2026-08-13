import type { CieR5RouteAuthorityResult } from "./route-authority";
import { contactTruthSupportsChannel, type ContactTruthSnapshot } from "./contact-truth";

export const GENESIS_T8_CIE_R6_VERSION = "1.0.0" as const;
export const GENESIS_T8_CIE_R6_BUILD = "CIE-R6" as const;
export const GENESIS_T8_CIE_R6_AUTHORITY_MODE = "AUTHORITATIVE" as const;

export type CieR6ContactCandidate = Readonly<{
  contactId: string;
  fullName: string;
  roleTitle: string;
  department: string | null;
  emailAddress: string | null;
  emailStatus: string | null;
  linkedinProfileUrl: string | null;
  linkedinStatus: string | null;
  reviewStatus: string | null;
  contactTruth: ContactTruthSnapshot;
}>;

export type CieR6RouteContactBinding = Readonly<{
  routeId: string;
  contactId: string | null;
  mode: "NAMED_CONTACT" | "ORGANISATIONAL_ROUTE";
  reason: string;
}>;

export type CieR6ContactAuthorityResult = Readonly<{
  authorityMode: "AUTHORITATIVE";
  primaryContactId: string | null;
  contactFrontier: readonly string[];
  bindings: readonly CieR6RouteContactBinding[];
  canUnlockOpportunity: boolean;
  reasons: readonly string[];
}>;

type RouteRow = Readonly<{
  id?: unknown;
  contactName?: unknown;
  contactRole?: unknown;
  targetRole?: unknown;
  channelType?: unknown;
  channelValue?: unknown;
}>;

const norm = (value: unknown): string => typeof value === "string"
  ? value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ")
  : "";

function eligible(contact: CieR6ContactCandidate): boolean {
  if (!contact.contactId.trim() || !contact.fullName.trim() || !contact.roleTitle.trim()) return false;
  if (["REJECTED", "HOLD", "ARCHIVED"].includes(contact.reviewStatus ?? "")) return false;
  return contact.contactTruth.authorityReady;
}

function channelSupported(route: RouteRow, contact: CieR6ContactCandidate): boolean {
  const channelType = typeof route.channelType === "string" ? route.channelType : "UNKNOWN";
  const value = typeof route.channelValue === "string" ? route.channelValue.trim().toLowerCase() : "";
  if (channelType === "DIRECT_EMAIL") {
    return !!contact.emailAddress && contact.emailAddress.toLowerCase() === value && contactTruthSupportsChannel(contact.contactTruth, "DIRECT_EMAIL");
  }
  if (channelType === "LINKEDIN") {
    return !!contact.linkedinProfileUrl && contact.linkedinProfileUrl.trim().toLowerCase() === value && contactTruthSupportsChannel(contact.contactTruth, "LINKEDIN");
  }
  return true;
}

function routeBindings(routeAuthority: CieR5RouteAuthorityResult, routes: readonly RouteRow[], contacts: readonly CieR6ContactCandidate[]): readonly CieR6RouteContactBinding[] {
  const byRoute = new Map(routes.map(route => [String(route.id ?? ""), route] as const));
  const candidates = contacts.filter(eligible);
  const bindings: CieR6RouteContactBinding[] = [];

  for (const routeId of routeAuthority.selectedRouteIds) {
    const route = byRoute.get(routeId);
    if (!route) throw new Error(`GENESIS_T8_CIE_R6_VIOLATION:SELECTED_ROUTE_MISSING:${routeId}`);
    const contactName = norm(route.contactName);
    if (!contactName) {
      bindings.push(Object.freeze({ routeId, contactId: null, mode: "ORGANISATIONAL_ROUTE", reason: "Authoritative OPEN route does not require a named person." }));
      continue;
    }

    const routeRole=norm(route.contactRole);
    const named = candidates.filter(contact => norm(contact.fullName) === contactName && (!routeRole || norm(contact.roleTitle)===routeRole) && channelSupported(route, contact));
    if (!named.length) {
      throw new Error(`GENESIS_T8_CIE_R6_CONTACT_UNRESOLVED:${routeId}`);
    }
    const ids = named.map(contact => contact.contactId).sort((a, b) => a.localeCompare(b));
    for (const contactId of ids) {
      bindings.push(Object.freeze({ routeId, contactId, mode: "NAMED_CONTACT", reason: "Contact is explicitly named by an authoritative OPEN route and has current truth-qualified identity, employment, role and channel ownership." }));
    }
  }
  return Object.freeze(bindings);
}

/**
 * CIE-R6 contact authority.
 *
 * Contacts do not compete on weighted confidence. A person is authoritative
 * only by participating in an R5-authorised OPEN route and satisfying the
 * route's identity/role/channel requirements. If multiple contacts satisfy the
 * same authorised relationship they remain a nondominated contact frontier;
 * contact ID ordering is an operational tie-break only.
 */
export function evaluateCieR6ContactAuthority(input: {
  routeAuthority: CieR5RouteAuthorityResult;
  routes: readonly RouteRow[];
  contacts: readonly CieR6ContactCandidate[];
}): CieR6ContactAuthorityResult {
  if (input.routeAuthority.strategy.primary.routeId.length === 0) throw new Error("GENESIS_T8_CIE_R6_VIOLATION:R5_ROUTE_AUTHORITY_REQUIRED");
  const bindings = routeBindings(input.routeAuthority, input.routes, input.contacts);
  const namedIds = [...new Set(bindings.flatMap(binding => binding.contactId ? [binding.contactId] : []))].sort((a, b) => a.localeCompare(b));
  const hasOrganisationalRoute = bindings.some(binding => binding.mode === "ORGANISATIONAL_ROUTE");
  if (!namedIds.length && !hasOrganisationalRoute) throw new Error("GENESIS_T8_CIE_R6_CONTACT_UNRESOLVED");

  return Object.freeze({
    authorityMode: GENESIS_T8_CIE_R6_AUTHORITY_MODE,
    primaryContactId: namedIds[0] ?? null,
    contactFrontier: Object.freeze(namedIds),
    bindings,
    canUnlockOpportunity: true,
    reasons: Object.freeze([
      "CONTACT_AUTHORITY_DERIVES_FROM_R5_OPEN_ROUTE_PARTICIPATION",
      "CURRENT_TRUTH_QUALIFIED_IDENTITY_EMPLOYMENT_ROLE_AND_CHANNEL_ARE_REQUIRED_FOR_NAMED_CONTACT_AUTHORITY",
      "WEIGHTED_CONTACT_CONFIDENCE_DOES_NOT_RANK_CONTACTS",
      namedIds.length > 1 ? "MULTIPLE_NONDOMINATED_CONTACTS_EXIST_CANONICAL_ID_ORDER_IS_OPERATIONAL_ONLY" : "CONTACT_BINDING_IS_UNAMBIGUOUS_OR_ORGANISATIONAL",
      hasOrganisationalRoute ? "A_NAMED_CONTACT_IS_NOT_REQUIRED_WHEN_THE_AUTHORISED_ROUTE_IS_ORGANISATIONAL" : "NAMED_CONTACT_ROUTE_REQUIRES_EXPLICIT_CONTACT_BINDING",
    ]),
  });
}

export const GENESIS_T8_CIE_R6_CONTACT_LAWS = Object.freeze([
  "UDOSIB_GRAPH_RELATIONSHIP_NOT_WEIGHTED_CONFIDENCE_OWNS_CONTACT_SELECTION",
  "A_NAMED_CONTACT_MUST_PARTICIPATE_IN_AN_AUTHORITATIVE_OPEN_ROUTE",
  "CONTACT_IDENTITY_CURRENT_EMPLOYMENT_AND_CURRENT_ROLE_MUST_BE_TRUTH_QUALIFIED",
  "DIRECT_CONTACT_CHANNEL_OWNERSHIP_MUST_BE_TRUTH_QUALIFIED",
  "LEGACY_CONTACT_EVIDENCE_VERIFIED_BOOLEAN_HAS_NO_AUTHORITY",
  "CHANNEL_COMPATIBILITY_MUST_BE_EXPLICIT_FOR_DIRECT_CONTACT_ROUTES",
  "ORGANISATIONAL_ROUTES_MAY_BE_EXECUTABLE_WITHOUT_A_NAMED_CONTACT",
  "MULTIPLE_VALID_CONTACTS_FORM_A_FRONTIER_AND_ARE_NOT_WEIGHTED_AGAINST_EACH_OTHER",
  "CANONICAL_CONTACT_ID_ORDER_IS_OPERATIONAL_ONLY",
  "LEGACY_OVERALL_CONFIDENCE_MAY_NOT_CONTROL_PRIMARY_CONTACT_SELECTION",
  "MISSING_CONTACT_BINDING_FAILS_CLOSED_AND_NEVER_FALLS_BACK_TO_LEGACY_SCORING",
] as const);
