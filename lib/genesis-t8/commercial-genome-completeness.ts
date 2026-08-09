/**
 * Genesis T8 Commercial Genome Completeness Contract v1.0
 *
 * CE Release 1 / Build 5
 *
 * Adversarial ontology coverage profiles. These are not commercial scores and
 * do not classify real companies. They are deterministic test fixtures that
 * answer one question: can the canonical ontology represent the objective facts
 * required to reason about materially different commercial organisations?
 */

import {
  GENESIS_T8_COMMERCIAL_GENOME_PREDICATES,
  type GenesisT8CommercialGenomePredicate,
  type GenesisT8GenomeFamily,
} from "./commercial-genome-ontology";

export const GENESIS_T8_CE_GENOME_COMPLETENESS_BUILD = "BUILD5" as const;
export const GENESIS_T8_COMMERCIAL_GENOME_COMPLETENESS_VERSION = "1.0.0" as const;

export type GenesisT8CommercialArchetype = Readonly<{
  id: string;
  description: string;
  requiredPredicates: readonly GenesisT8CommercialGenomePredicate[];
}>;

/**
 * Synthetic archetypes intentionally span very different operating realities.
 * Passing them means the ontology can express the required facts; it does not
 * mean Genesis has enough evidence about any real organisation.
 */
export const GENESIS_T8_COMMERCIAL_ARCHETYPES = Object.freeze([
  {
    id: "ENTERPRISE_SAAS",
    description: "Enterprise software provider with recurring revenue, integrations and formal buyer security requirements.",
    requiredPredicates: [
      "commercial.business_model", "commercial.revenue_model", "commercial.product_delivery_mode",
      "market.customer_size_segment", "market.contract_model", "technology.api_capability",
      "technology.deployment_model", "buying.has_formal_procurement", "risk.vendor_security_requirement",
      "organisation.technology_owner_function",
    ],
  },
  {
    id: "MANUFACTURER",
    description: "Asset-intensive manufacturer with factories, inventory, supply chain and process technology.",
    requiredPredicates: [
      "operations.has_manufacturing", "operations.manufacturing_process", "operations.has_inventory",
      "operations.asset_intensity", "operations.supply_chain_complexity", "operations.facility_type",
      "technology.erp", "risk.health_safety_regime", "organisation.operations_owner_function",
    ],
  },
  {
    id: "LOGISTICS_OPERATOR",
    description: "Multi-site logistics operator with warehouses, fleet/transport modes and customer contracts.",
    requiredPredicates: [
      "operations.has_warehouse", "operations.warehouse_count", "operations.logistics_mode",
      "operations.inventory_complexity", "operations.order_volume_band", "market.contract_model",
      "technology.wms", "ecosystem.logistics_provider", "organisation.operations_owner_function",
    ],
  },
  {
    id: "RETAIL_ECOMMERCE",
    description: "Retail or ecommerce organisation with consumer channels, fulfilment and commerce technology.",
    requiredPredicates: [
      "market.customer_type", "market.customer_channel", "market.purchase_frequency",
      "commercial.route_to_market", "operations.has_distribution", "operations.order_volume_band",
      "technology.ecommerce_platform", "commercial.pricing_model",
    ],
  },
  {
    id: "REGULATED_HEALTHCARE",
    description: "Regulated healthcare operator with sites, compliance and stringent supplier controls.",
    requiredPredicates: [
      "risk.regulatory_regime", "risk.certification", "risk.data_residency_constraint",
      "risk.vendor_security_requirement", "risk.health_safety_regime", "operations.has_physical_sites",
      "buying.vendor_onboarding_duration", "organisation.procurement_owner_function",
    ],
  },
  {
    id: "PUBLIC_SECTOR_BUYER",
    description: "Public-sector organisation purchasing through tenders, frameworks and formal procurement.",
    requiredPredicates: [
      "identity.ownership_type", "buying.procurement_model", "buying.has_formal_procurement",
      "buying.tender_usage", "buying.vendor_framework", "ecosystem.procurement_framework",
      "buying.purchase_authority_model", "organisation.procurement_owner_function",
    ],
  },
  {
    id: "PROFESSIONAL_SERVICES",
    description: "Service-led organisation selling projects or retained expertise with distributed delivery.",
    requiredPredicates: [
      "commercial.service_category", "commercial.service_delivery_mode", "market.contract_model",
      "market.customer_size_segment", "operations.workforce_model", "commercial.minimum_contract_value",
      "market.average_contract_value",
    ],
  },
  {
    id: "FIELD_SERVICE_CONSTRUCTION",
    description: "Field-based organisation operating physical sites, subcontractors and safety constraints.",
    requiredPredicates: [
      "operations.has_field_service", "operations.workforce_model", "operations.has_physical_sites",
      "risk.health_safety_regime", "ecosystem.outsourcing_partner", "risk.insurance_requirement",
      "organisation.operations_owner_function",
    ],
  },
  {
    id: "REGULATED_FINTECH",
    description: "Technology-led regulated financial organisation with identity, data and integration constraints.",
    requiredPredicates: [
      "risk.regulatory_regime", "risk.data_residency_constraint", "technology.api_capability",
      "technology.identity_provider", "technology.data_platform", "technology.deployment_model",
      "risk.vendor_security_requirement", "financial.reporting_currency",
    ],
  },
  {
    id: "VENTURE_STARTUP",
    description: "Young growth company with funding, hiring and rapidly changing technology and strategy.",
    requiredPredicates: [
      "identity.founded_date", "identity.employee_count", "financial.funding_event", "signal.hiring",
      "strategy.priority", "technology.cloud_platform", "technology.ai_adoption",
      "organisation.decision_centralisation",
    ],
  },
  {
    id: "WHOLESALE_DISTRIBUTOR",
    description: "Distributor with inventory, logistics, reseller relationships and B2B customer channels.",
    requiredPredicates: [
      "operations.has_inventory", "operations.has_distribution", "operations.inventory_complexity",
      "commercial.route_to_market", "ecosystem.distributor", "ecosystem.reseller",
      "market.customer_type", "technology.erp",
    ],
  },
  {
    id: "MULTINATIONAL_ENTERPRISE",
    description: "Large multinational with subsidiaries, multiple operating countries and centralised governance.",
    requiredPredicates: [
      "identity.parent_entity", "identity.subsidiary_entity", "identity.operating_country",
      "identity.employee_count", "identity.ownership_type", "organisation.decision_centralisation",
      "buying.purchase_currency", "financial.reporting_currency", "risk.regulatory_regime",
    ],
  },
] as const satisfies readonly GenesisT8CommercialArchetype[]);

export type GenesisT8DecisionCapability = Readonly<{
  id: string;
  question: string;
  requiredPredicates: readonly GenesisT8CommercialGenomePredicate[];
}>;

/**
 * Cross-industry reasoning prerequisites. A future commercial engine may ask
 * these questions, but this Build only proves the facts can be represented.
 */
export const GENESIS_T8_DECISION_CAPABILITIES = Object.freeze([
  { id: "GEOGRAPHIC_SERVICEABILITY", question: "Can geography and operating footprint be compared without inventing fit?", requiredPredicates: ["identity.headquarters_country", "identity.operating_country", "market.served_country"] },
  { id: "SCALE_COMPATIBILITY", question: "Can material scale be represented without a lead score?", requiredPredicates: ["identity.employee_count", "financial.revenue", "operations.operating_scale", "operations.site_count"] },
  { id: "TECHNICAL_COMPATIBILITY", question: "Can deployment and integration constraints be represented?", requiredPredicates: ["technology.api_capability", "technology.deployment_model", "technology.data_integration_method", "technology.legacy_dependency"] },
  { id: "PROCUREMENT_COMPATIBILITY", question: "Can formal buying constraints be represented?", requiredPredicates: ["buying.procurement_model", "buying.vendor_framework", "buying.payment_terms", "buying.vendor_onboarding_duration", "buying.purchase_authority_model"] },
  { id: "ECONOMIC_COMPATIBILITY", question: "Can transaction economics be represented without judging attractiveness?", requiredPredicates: ["commercial.minimum_contract_value", "market.average_contract_value", "financial.revenue", "buying.purchase_currency"] },
  { id: "ORGANISATIONAL_OWNERSHIP", question: "Can business-function ownership be represented without doing contact fit?", requiredPredicates: ["organisation.business_function", "organisation.procurement_owner_function", "organisation.technology_owner_function", "organisation.operations_owner_function"] },
  { id: "OPERATING_NEED_CONTEXT", question: "Can physical and operational complexity be represented?", requiredPredicates: ["operations.facility_type", "operations.inventory_complexity", "operations.supply_chain_complexity", "operations.automation_level"] },
  { id: "REGULATORY_COMPATIBILITY", question: "Can supplier and regulatory constraints be represented?", requiredPredicates: ["risk.regulatory_regime", "risk.certification", "risk.data_residency_constraint", "risk.vendor_security_requirement", "risk.insurance_requirement"] },
  { id: "COMMERCIAL_DELIVERY_COMPATIBILITY", question: "Can the way each business sells and delivers be compared?", requiredPredicates: ["commercial.delivery_model", "commercial.product_delivery_mode", "commercial.service_delivery_mode", "commercial.route_to_market"] },
  { id: "MOMENTUM_CONTEXT", question: "Can current change be represented without converting it into a timing score?", requiredPredicates: ["signal.hiring", "signal.technology_project", "signal.product_launch", "signal.contract_award", "signal.regulatory_change"] },
  { id: "ECOSYSTEM_CONTEXT", question: "Can partner, supplier and intermediary paths be represented?", requiredPredicates: ["ecosystem.supplier", "ecosystem.strategic_partner", "ecosystem.distributor", "ecosystem.systems_integrator", "ecosystem.regulator"] },
] as const satisfies readonly GenesisT8DecisionCapability[]);

export const GENESIS_T8_COMPLETENESS_LAWS = Object.freeze([
  "COMPLETENESS_MEANS_REPRESENTABILITY_NOT_EVIDENCE_AVAILABILITY",
  "ARCHETYPE_TESTS_NEVER_CLASSIFY_REAL_COMPANIES",
  "NO_ARCHETYPE_MAY_REQUIRE_A_DERIVED_FIT_OR_PRIORITY_SCORE",
  "UNKNOWN_FACTS_REMAIN_ABSENT_AND_DO_NOT_FAIL_ONTOLOGY_COMPLETENESS",
  "ORGANISATION_STRUCTURE_STOPS_AT_FUNCTION_OWNERSHIP_BEFORE_CONTACT_REASONING",
  "COMMERCIAL_CONSTRAINTS_ARE_FACTS_ONLY_WHEN_EVIDENCED_AND_TI_QUALIFIED",
  "COVERAGE_GAPS_EXTEND_PREDICATES_WITHOUT_REPURPOSING_EXISTING_IDS",
  "PASSING_BUILD5_DOES_NOT_FREEZE_THE_ONTOLOGY_BUILD6_AND_BUILD7_STILL_GOVERN_RESEARCH_AND_FREEZE",
] as const);

export type GenesisT8GenomeCompletenessReport = Readonly<{
  complete: boolean;
  missingPredicates: readonly string[];
  familyCounts: Readonly<Record<GenesisT8GenomeFamily, number>>;
  archetypeCoverage: Readonly<Record<string, number>>;
  capabilityCoverage: Readonly<Record<string, number>>;
}>;

export function auditCommercialGenomeCompleteness(): GenesisT8GenomeCompletenessReport {
  const available = new Set<string>(GENESIS_T8_COMMERCIAL_GENOME_PREDICATES.map((d) => d.predicate));
  const missing = new Set<string>();
  const familyCounts = {} as Record<GenesisT8GenomeFamily, number>;

  for (const definition of GENESIS_T8_COMMERCIAL_GENOME_PREDICATES) {
    familyCounts[definition.family] = (familyCounts[definition.family] ?? 0) + 1;
  }

  const archetypeCoverage: Record<string, number> = {};
  for (const archetype of GENESIS_T8_COMMERCIAL_ARCHETYPES) {
    const present = archetype.requiredPredicates.filter((predicate) => available.has(predicate)).length;
    archetypeCoverage[archetype.id] = present / archetype.requiredPredicates.length;
    for (const predicate of archetype.requiredPredicates) if (!available.has(predicate)) missing.add(predicate);
  }

  const capabilityCoverage: Record<string, number> = {};
  for (const capability of GENESIS_T8_DECISION_CAPABILITIES) {
    const present = capability.requiredPredicates.filter((predicate) => available.has(predicate)).length;
    capabilityCoverage[capability.id] = present / capability.requiredPredicates.length;
    for (const predicate of capability.requiredPredicates) if (!available.has(predicate)) missing.add(predicate);
  }

  return Object.freeze({
    complete: missing.size === 0,
    missingPredicates: Object.freeze([...missing].sort()),
    familyCounts: Object.freeze(familyCounts),
    archetypeCoverage: Object.freeze(archetypeCoverage),
    capabilityCoverage: Object.freeze(capabilityCoverage),
  });
}

export function assertCommercialGenomeCompletenessInvariant(): void {
  const report = auditCommercialGenomeCompleteness();
  if (!report.complete) {
    throw new Error(`GENESIS_T8_GENOME_COMPLETENESS_VIOLATION:MISSING:${report.missingPredicates.join(",")}`);
  }
  for (const [id, coverage] of Object.entries(report.archetypeCoverage)) {
    if (coverage !== 1) throw new Error(`GENESIS_T8_GENOME_COMPLETENESS_VIOLATION:ARCHETYPE:${id}`);
  }
  for (const [id, coverage] of Object.entries(report.capabilityCoverage)) {
    if (coverage !== 1) throw new Error(`GENESIS_T8_GENOME_COMPLETENESS_VIOLATION:CAPABILITY:${id}`);
  }
}
