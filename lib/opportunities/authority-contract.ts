export const MARKETROUTE_FORENSIC_BUILD7_R4_PRODUCER = "MR-T8-FB3-1.0.0" as const;
export const MARKETROUTE_FORENSIC_BUILD7_R5_PRODUCER = "MR-T8-FB5-R5-1.0.0" as const;
export const MARKETROUTE_FORENSIC_BUILD7_R6_PRODUCER = "MR-T8-FB6-R6-1.0.0" as const;
export const MARKETROUTE_FORENSIC_BUILD7_TRUTH_SEMANTICS = "MR-TI-2-TFR1" as const;
export const MARKETROUTE_FORENSIC_BUILD8_BOUNDARY_CONSTITUTION = "MR-T8-FB8-BOUNDARY-1.0.0" as const;

export type Build7AuthorityState =
  | "AWAITING_COMMERCIAL_REALITY"
  | "COMMERCIAL_AUTHORITY_STALE"
  | "REJECTED"
  | "TEMPORAL_HOLD"
  | "RESEARCH_REQUIRED"
  | "ROUTE_UNRESOLVED"
  | "ROUTE_STALE"
  | "CONTACT_UNRESOLVED"
  | "CONTACT_STALE"
  | "READY";

export type Build7AuthorityInput = {
  workflowStatus: string;
  now: string;
  r4: {
    realityId: string | null;
    disposition: string | null;
    producerVersion: string | null;
    productionId: string | null;
    authorityFingerprint: string | null;
    targetTruthSemanticsVersion: string | null;
    truthSnapshotResolved: boolean;
    boundaryConstitutionVersion: string | null;
    boundaryComplete: boolean;
    appliedAt: string | null;
    updatedAt: string | null;
    nextValidationAt: string | null;
  };
  r5: {
    authorityStatus: string | null;
    producerVersion: string | null;
    authorityFingerprint: string | null;
    parentR4AuthorityFingerprint: string | null;
    appliedAt: string | null;
  };
  r6: {
    authorityStatus: string | null;
    producerVersion: string | null;
    contactTruthFingerprint: string | null;
    parentR4AuthorityFingerprint: string | null;
    parentR5AuthorityFingerprint: string | null;
    primaryContactId: string | null;
    nextRevalidationAt: string | null;
    appliedAt: string | null;
  };
};

const SHA256 = /^[0-9a-f]{64}$/;
const validFingerprint = (value: string | null) => Boolean(value && SHA256.test(value));

export function classifyBuild7Authority(input: Build7AuthorityInput) {
  const now = Date.parse(input.now);
  const boundaryContractCurrent = Boolean(
    input.r4.boundaryConstitutionVersion === MARKETROUTE_FORENSIC_BUILD8_BOUNDARY_CONSTITUTION &&
    (input.r4.disposition !== "COMMERCIAL_CANDIDATE" || input.r4.boundaryComplete)
  );

  const r4Current = Boolean(
    validFingerprint(input.r4.authorityFingerprint) &&
    input.r4.targetTruthSemanticsVersion === MARKETROUTE_FORENSIC_BUILD7_TRUTH_SEMANTICS &&
    input.r4.truthSnapshotResolved &&
    boundaryContractCurrent &&
    input.r4.appliedAt &&
    input.r4.updatedAt &&
    input.r4.nextValidationAt &&
    Number.isFinite(now) &&
    Date.parse(input.r4.nextValidationAt) > now &&
    input.r4.producerVersion === MARKETROUTE_FORENSIC_BUILD7_R4_PRODUCER &&
    input.r4.productionId
  );

  const r5Current = Boolean(
    input.r5.authorityStatus === "ACTIVE" &&
    input.r5.producerVersion === MARKETROUTE_FORENSIC_BUILD7_R5_PRODUCER &&
    validFingerprint(input.r5.authorityFingerprint) &&
    input.r5.parentR4AuthorityFingerprint === input.r4.authorityFingerprint &&
    input.r5.appliedAt
  );

  const namedContactCurrent = !input.r6.primaryContactId || Boolean(
    input.r6.nextRevalidationAt &&
    Number.isFinite(now) &&
    Date.parse(input.r6.nextRevalidationAt) > now
  );

  const r6Current = Boolean(
    input.r6.authorityStatus === "ACTIVE" &&
    input.r6.producerVersion === MARKETROUTE_FORENSIC_BUILD7_R6_PRODUCER &&
    validFingerprint(input.r6.contactTruthFingerprint) &&
    input.r6.parentR4AuthorityFingerprint === input.r4.authorityFingerprint &&
    input.r6.parentR5AuthorityFingerprint === input.r5.authorityFingerprint &&
    input.r6.appliedAt &&
    namedContactCurrent
  );

  let authorityState: Build7AuthorityState;
  if (!input.r4.realityId) authorityState = "AWAITING_COMMERCIAL_REALITY";
  else if (!r4Current) authorityState = "COMMERCIAL_AUTHORITY_STALE";
  else if (input.r4.disposition === "REJECT") authorityState = "REJECTED";
  else if (input.r4.disposition === "HOLD_TEMPORAL") authorityState = "TEMPORAL_HOLD";
  else if (input.r4.disposition === "RESEARCH_REQUIRED") authorityState = "RESEARCH_REQUIRED";
  else if (input.r4.disposition === "COMMERCIAL_CANDIDATE" && input.r5.authorityStatus === "STALE") authorityState = "ROUTE_STALE";
  else if (input.r4.disposition === "COMMERCIAL_CANDIDATE" && !r5Current) authorityState = "ROUTE_UNRESOLVED";
  else if (input.r4.disposition === "COMMERCIAL_CANDIDATE" && input.r6.authorityStatus === "STALE") authorityState = "CONTACT_STALE";
  else if (input.r4.disposition === "COMMERCIAL_CANDIDATE" && !r6Current) authorityState = "CONTACT_UNRESOLVED";
  else if (input.r4.disposition === "COMMERCIAL_CANDIDATE" && r6Current) authorityState = "READY";
  else authorityState = "COMMERCIAL_AUTHORITY_STALE";

  const authorityReady = authorityState === "READY";
  const authorityCurrent = Boolean(r4Current && (input.r4.disposition !== "COMMERCIAL_CANDIDATE" || (r5Current && r6Current)));
  const workflowAuthorityMismatch = Boolean(
    (authorityReady && !["READY", "APPROVED", "REJECTED", "ENGAGED"].includes(input.workflowStatus)) ||
    (!authorityReady && ["READY", "APPROVED"].includes(input.workflowStatus))
  );

  return Object.freeze({ authorityState, authorityReady, authorityCurrent, workflowAuthorityMismatch, r4Current, r5Current, r6Current });
}
