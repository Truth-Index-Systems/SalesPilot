/** MarketRoute Forensic Build 8 — current constitutional authority manifest. */
export const MARKETROUTE_FORENSIC_BUILD8_CERTIFICATION_VERSION = "MR-T8-FB8-CERT-1.0.0" as const;

export const MARKETROUTE_FORENSIC_BUILD8_ACTIVE_AUTHORITY = Object.freeze({
  truthSemantics: "MR-TI-2-TFR1",
  r4Producer: "MR-T8-FB3-1.0.0",
  r4BoundaryConstitution: "MR-T8-FB8-BOUNDARY-1.0.0",
  r5Producer: "MR-T8-FB5-R5-1.0.0",
  r6Producer: "MR-T8-FB6-R6-1.0.0",
  readModel: "cie-fb8-authoritative-read-model",
  communicationSelfReview: "g5-self-review/v4-fb8-categorical-quality",
  communicationQualityPolicy: "g5-engagement-quality/fb8-categorical-v2",
  communicationQualityAuthority: "AI_CATEGORICAL_SEMANTIC_REVIEW_NUMERIC_TELEMETRY_ONLY",
  certification: MARKETROUTE_FORENSIC_BUILD8_CERTIFICATION_VERSION,
} as const);

export const MARKETROUTE_FORENSIC_BUILD8_ACTIVE_AUTHORITY_MODULES = Object.freeze([
  "lib/genesis-g8/truth-v2/production-hydration.ts",
  "lib/genesis-g8/truth-v2/entity/aggregate.ts",
  "lib/genesis-t8/cie/commercial-boundary-constitution.ts",
  "lib/genesis-t8/cie/commercial-reality-producer.ts",
  "lib/genesis-t8/cie/authority-lineage.ts",
  "lib/genesis-t8/cie/route-authority.ts",
  "lib/genesis-t8/cie/contact-truth.ts",
  "lib/genesis-t8/cie/contact-authority.ts",
  "lib/opportunities/authority-contract.ts",
] as const);

/** These modules may remain for history/compatibility but cannot enter current authority modules. */
export const MARKETROUTE_FORENSIC_BUILD8_FORBIDDEN_AUTHORITY_IMPORT_FRAGMENTS = Object.freeze([
  "lib/genesis-g8/truth/equation",
  "lib/genesis-g8/read-model",
  "lib/intelligence/fit-score",
  "lib/engagement/commercial-reasoning",
  "lib/integrations/genesis-t8/legacy-seller-projection",
] as const);

/** Telemetry may exist elsewhere; these fields may not be read to create R4/R5/R6/READY authority. */
export const MARKETROUTE_FORENSIC_BUILD8_FORBIDDEN_AUTHORITY_FIELDS = Object.freeze([
  "opportunity_score",
  "company_fit",
  "operational_fit",
  "route_quality",
  "route_confidence",
  "is_viable",
  "overall_confidence",
  "engagement_confidence",
  "email_status",
] as const);
