/**
 * Genesis T8 Commercial Genome Ontology v1.0
 *
 * CE Release 1 / Build 4
 *
 * Canonical commercial vocabulary for the Genesis T8 Commercial Token Graph.
 * This module defines predicates and metadata only. It does not research,
 * qualify truth, calculate fit, rank opportunities, or persist application data.
 */

import type {
  GenesisT8CanonicalValueType,
  GenesisT8TokenKind,
  GenesisT8TokenMutability,
} from "./token-theory";
import type { GenesisT8CommercialDimension } from "./commercial-graph-9d";

export const GENESIS_T8_COMMERCIAL_GENOME_VERSION = "1.0.0" as const;
export const GENESIS_T8_CE_COMMERCIAL_GENOME_BUILD = "BUILD4" as const;

export const GENESIS_T8_GENOME_FAMILIES = Object.freeze([
  "CORPORATE_IDENTITY",
  "COMMERCIAL_IDENTITY",
  "OPERATIONS",
  "CUSTOMERS_MARKETS",
  "COMMERCIAL_BEHAVIOUR",
  "ORGANISATION",
  "TECHNOLOGY",
  "FINANCIAL",
  "STRATEGY",
  "RISK_COMPLIANCE",
  "DYNAMIC_SIGNALS",
  "ECOSYSTEM",
] as const);

export type GenesisT8GenomeFamily = (typeof GENESIS_T8_GENOME_FAMILIES)[number];

export type GenesisT8EvidenceExpectation =
  | "ONE_CREDIBLE_SOURCE"
  | "MULTI_SOURCE_PREFERRED"
  | "INDEPENDENT_CORROBORATION_PREFERRED"
  | "AUTHORITATIVE_SOURCE_PREFERRED"
  | "AUTHORITATIVE_SOURCE_REQUIRED"
  | "EVENT_SOURCE_REQUIRED";

/**
 * Refresh classes are semantic scheduling hints, not hard cron intervals.
 * Build 6 research orchestration may translate them into operational policy.
 */
export type GenesisT8RefreshClass =
  | "ON_IDENTITY_CHANGE"
  | "VERY_SLOW"
  | "SLOW"
  | "MEDIUM"
  | "FAST"
  | "EVENT_DRIVEN";

export type GenesisT8GenomePredicateDefinition = Readonly<{
  predicate: string;
  family: GenesisT8GenomeFamily;
  label: string;
  meaning: string;
  kind: GenesisT8TokenKind;
  valueType: GenesisT8CanonicalValueType;
  mutability: GenesisT8TokenMutability;
  refreshClass: GenesisT8RefreshClass;
  evidenceExpectation: GenesisT8EvidenceExpectation;
  dimensions: readonly GenesisT8CommercialDimension[];
  aliases?: readonly string[];
}>;

const p = <T extends GenesisT8GenomePredicateDefinition>(definition: T): T => Object.freeze(definition);

/**
 * v1 canonical predicate catalogue.
 *
 * Design rule: predicates describe objective commercial reality only. They may
 * never encode suitability, attractiveness, priority, recommendation, or score.
 */
export const GENESIS_T8_COMMERCIAL_GENOME_PREDICATES = Object.freeze([
  // A — Corporate identity
  p({ predicate: "identity.legal_name", family: "CORPORATE_IDENTITY", label: "Legal name", meaning: "Registered legal name of the organisation.", kind: "IDENTITY", valueType: "TEXT", mutability: "VERY_STABLE", refreshClass: "ON_IDENTITY_CHANGE", evidenceExpectation: "AUTHORITATIVE_SOURCE_PREFERRED", dimensions: ["SEMANTIC", "STRUCTURAL", "TRUTH"] }),
  p({ predicate: "identity.trading_name", family: "CORPORATE_IDENTITY", label: "Trading name", meaning: "Name used commercially by the organisation.", kind: "IDENTITY", valueType: "TEXT", mutability: "STABLE", refreshClass: "SLOW", evidenceExpectation: "ONE_CREDIBLE_SOURCE", dimensions: ["SEMANTIC", "STRUCTURAL", "TRUTH"] }),
  p({ predicate: "identity.canonical_domain", family: "CORPORATE_IDENTITY", label: "Canonical domain", meaning: "Primary canonical internet domain controlled by the organisation.", kind: "IDENTITY", valueType: "DOMAIN", mutability: "STABLE", refreshClass: "SLOW", evidenceExpectation: "ONE_CREDIBLE_SOURCE", dimensions: ["SEMANTIC", "STRUCTURAL", "TECHNOLOGICAL", "TRUTH"] }),
  p({ predicate: "identity.operating_status", family: "CORPORATE_IDENTITY", label: "Operating status", meaning: "Current operating state of the organisation.", kind: "STATE", valueType: "ENUM", mutability: "DYNAMIC", refreshClass: "MEDIUM", evidenceExpectation: "AUTHORITATIVE_SOURCE_PREFERRED", dimensions: ["STRUCTURAL", "TEMPORAL", "TRUTH"] }),
  p({ predicate: "identity.founded_date", family: "CORPORATE_IDENTITY", label: "Founded date", meaning: "Date or best-supported date on which the organisation was founded.", kind: "IDENTITY", valueType: "DATE", mutability: "IMMUTABLE", refreshClass: "ON_IDENTITY_CHANGE", evidenceExpectation: "AUTHORITATIVE_SOURCE_PREFERRED", dimensions: ["STRUCTURAL", "TEMPORAL", "TRUTH"] }),
  p({ predicate: "identity.headquarters_country", family: "CORPORATE_IDENTITY", label: "Headquarters country", meaning: "Country containing the organisation's principal headquarters.", kind: "STATE", valueType: "COUNTRY", mutability: "STABLE", refreshClass: "SLOW", evidenceExpectation: "MULTI_SOURCE_PREFERRED", dimensions: ["STRUCTURAL", "OPERATIONAL", "TRUTH"] }),
  p({ predicate: "identity.operating_country", family: "CORPORATE_IDENTITY", label: "Operating country", meaning: "Country in which the organisation has substantive operations.", kind: "STATE", valueType: "COUNTRY", mutability: "DYNAMIC", refreshClass: "MEDIUM", evidenceExpectation: "MULTI_SOURCE_PREFERRED", dimensions: ["STRUCTURAL", "OPERATIONAL", "COMMERCIAL", "TRUTH"] }),
  p({ predicate: "identity.parent_entity", family: "CORPORATE_IDENTITY", label: "Parent entity", meaning: "Entity that owns or controls the organisation.", kind: "STATE", valueType: "ENTITY_REF", mutability: "DYNAMIC", refreshClass: "MEDIUM", evidenceExpectation: "AUTHORITATIVE_SOURCE_PREFERRED", dimensions: ["STRUCTURAL", "RELATIONAL", "TRUTH"] }),
  p({ predicate: "identity.subsidiary_entity", family: "CORPORATE_IDENTITY", label: "Subsidiary entity", meaning: "Entity controlled by the organisation.", kind: "STATE", valueType: "ENTITY_REF", mutability: "DYNAMIC", refreshClass: "MEDIUM", evidenceExpectation: "AUTHORITATIVE_SOURCE_PREFERRED", dimensions: ["STRUCTURAL", "RELATIONAL", "TRUTH"] }),
  p({ predicate: "identity.employee_count", family: "CORPORATE_IDENTITY", label: "Employee count", meaning: "Supported current number or estimate of employees.", kind: "QUANTITY", valueType: "INTEGER", mutability: "DYNAMIC", refreshClass: "MEDIUM", evidenceExpectation: "MULTI_SOURCE_PREFERRED", dimensions: ["STRUCTURAL", "OPERATIONAL", "TEMPORAL", "TRUTH"] }),

  // B — Commercial identity
  p({ predicate: "commercial.industry", family: "COMMERCIAL_IDENTITY", label: "Industry", meaning: "Canonical industry in which the organisation principally operates.", kind: "CLASSIFICATION", valueType: "ENUM", mutability: "STABLE", refreshClass: "SLOW", evidenceExpectation: "MULTI_SOURCE_PREFERRED", dimensions: ["SEMANTIC", "COMMERCIAL", "TRUTH"] }),
  p({ predicate: "commercial.sector", family: "COMMERCIAL_IDENTITY", label: "Sector", meaning: "Canonical commercial sector associated with the organisation.", kind: "CLASSIFICATION", valueType: "ENUM", mutability: "STABLE", refreshClass: "SLOW", evidenceExpectation: "MULTI_SOURCE_PREFERRED", dimensions: ["SEMANTIC", "COMMERCIAL", "TRUTH"] }),
  p({ predicate: "commercial.business_model", family: "COMMERCIAL_IDENTITY", label: "Business model", meaning: "Canonical model through which the organisation creates and captures value.", kind: "CLASSIFICATION", valueType: "ENUM", mutability: "STABLE", refreshClass: "SLOW", evidenceExpectation: "MULTI_SOURCE_PREFERRED", dimensions: ["SEMANTIC", "COMMERCIAL", "STRATEGIC", "TRUTH"] }),
  p({ predicate: "commercial.revenue_model", family: "COMMERCIAL_IDENTITY", label: "Revenue model", meaning: "Mechanism through which the organisation earns revenue.", kind: "BEHAVIOUR", valueType: "ENUM", mutability: "STABLE", refreshClass: "SLOW", evidenceExpectation: "MULTI_SOURCE_PREFERRED", dimensions: ["COMMERCIAL", "STRUCTURAL", "TRUTH"] }),
  p({ predicate: "commercial.product_category", family: "COMMERCIAL_IDENTITY", label: "Product category", meaning: "Canonical category of products sold by the organisation.", kind: "CAPABILITY", valueType: "ENUM", mutability: "DYNAMIC", refreshClass: "MEDIUM", evidenceExpectation: "ONE_CREDIBLE_SOURCE", dimensions: ["SEMANTIC", "COMMERCIAL", "TRUTH"] }),
  p({ predicate: "commercial.service_category", family: "COMMERCIAL_IDENTITY", label: "Service category", meaning: "Canonical category of services supplied by the organisation.", kind: "CAPABILITY", valueType: "ENUM", mutability: "DYNAMIC", refreshClass: "MEDIUM", evidenceExpectation: "ONE_CREDIBLE_SOURCE", dimensions: ["SEMANTIC", "COMMERCIAL", "TRUTH"] }),
  p({ predicate: "commercial.core_capability", family: "COMMERCIAL_IDENTITY", label: "Core capability", meaning: "Operational or commercial capability materially provided by the organisation.", kind: "CAPABILITY", valueType: "ENUM", mutability: "DYNAMIC", refreshClass: "MEDIUM", evidenceExpectation: "MULTI_SOURCE_PREFERRED", dimensions: ["SEMANTIC", "OPERATIONAL", "COMMERCIAL", "TRUTH"] }),
  p({ predicate: "commercial.market_position", family: "COMMERCIAL_IDENTITY", label: "Market position", meaning: "Supported objective market-position classification, excluding subjective superiority claims.", kind: "CLASSIFICATION", valueType: "ENUM", mutability: "DYNAMIC", refreshClass: "MEDIUM", evidenceExpectation: "INDEPENDENT_CORROBORATION_PREFERRED", dimensions: ["COMMERCIAL", "STRATEGIC", "TRUTH"] }),
  p({ predicate: "commercial.pricing_model", family: "COMMERCIAL_IDENTITY", label: "Pricing model", meaning: "Observable pricing structure used for products or services.", kind: "BEHAVIOUR", valueType: "ENUM", mutability: "DYNAMIC", refreshClass: "MEDIUM", evidenceExpectation: "ONE_CREDIBLE_SOURCE", dimensions: ["COMMERCIAL", "TRUTH"] }),

  // C — Operations
  p({ predicate: "operations.has_physical_sites", family: "OPERATIONS", label: "Physical sites", meaning: "Organisation operates one or more physical business sites.", kind: "STATE", valueType: "BOOLEAN", mutability: "DYNAMIC", refreshClass: "MEDIUM", evidenceExpectation: "MULTI_SOURCE_PREFERRED", dimensions: ["OPERATIONAL", "STRUCTURAL", "TRUTH"] }),
  p({ predicate: "operations.site_count", family: "OPERATIONS", label: "Site count", meaning: "Number of supported operational sites.", kind: "QUANTITY", valueType: "INTEGER", mutability: "DYNAMIC", refreshClass: "MEDIUM", evidenceExpectation: "MULTI_SOURCE_PREFERRED", dimensions: ["OPERATIONAL", "STRUCTURAL", "TEMPORAL", "TRUTH"] }),
  p({ predicate: "operations.has_warehouse", family: "OPERATIONS", label: "Warehouse operations", meaning: "Organisation operates warehouse or fulfilment facilities.", kind: "STATE", valueType: "BOOLEAN", mutability: "DYNAMIC", refreshClass: "MEDIUM", evidenceExpectation: "MULTI_SOURCE_PREFERRED", dimensions: ["OPERATIONAL", "STRUCTURAL", "COMMERCIAL", "TRUTH"] }),
  p({ predicate: "operations.warehouse_count", family: "OPERATIONS", label: "Warehouse count", meaning: "Number of supported warehouse or fulfilment facilities.", kind: "QUANTITY", valueType: "INTEGER", mutability: "DYNAMIC", refreshClass: "MEDIUM", evidenceExpectation: "INDEPENDENT_CORROBORATION_PREFERRED", dimensions: ["OPERATIONAL", "STRUCTURAL", "TEMPORAL", "TRUTH"] }),
  p({ predicate: "operations.has_manufacturing", family: "OPERATIONS", label: "Manufacturing operations", meaning: "Organisation performs manufacturing or production activity.", kind: "STATE", valueType: "BOOLEAN", mutability: "DYNAMIC", refreshClass: "MEDIUM", evidenceExpectation: "MULTI_SOURCE_PREFERRED", dimensions: ["OPERATIONAL", "COMMERCIAL", "TRUTH"] }),
  p({ predicate: "operations.has_inventory", family: "OPERATIONS", label: "Inventory operations", meaning: "Organisation holds or controls physical inventory as part of operations.", kind: "STATE", valueType: "BOOLEAN", mutability: "DYNAMIC", refreshClass: "MEDIUM", evidenceExpectation: "MULTI_SOURCE_PREFERRED", dimensions: ["OPERATIONAL", "COMMERCIAL", "TRUTH"] }),
  p({ predicate: "operations.has_distribution", family: "OPERATIONS", label: "Distribution operations", meaning: "Organisation performs material product distribution activity.", kind: "STATE", valueType: "BOOLEAN", mutability: "DYNAMIC", refreshClass: "MEDIUM", evidenceExpectation: "MULTI_SOURCE_PREFERRED", dimensions: ["OPERATIONAL", "COMMERCIAL", "TRUTH"] }),
  p({ predicate: "operations.has_field_service", family: "OPERATIONS", label: "Field service", meaning: "Organisation deploys personnel or assets to customer or remote operational sites.", kind: "STATE", valueType: "BOOLEAN", mutability: "DYNAMIC", refreshClass: "MEDIUM", evidenceExpectation: "MULTI_SOURCE_PREFERRED", dimensions: ["OPERATIONAL", "COMMERCIAL", "TRUTH"] }),
  p({ predicate: "operations.supply_chain_complexity", family: "OPERATIONS", label: "Supply-chain complexity", meaning: "Canonical observable complexity class of the organisation's supply chain.", kind: "CLASSIFICATION", valueType: "ENUM", mutability: "DYNAMIC", refreshClass: "MEDIUM", evidenceExpectation: "INDEPENDENT_CORROBORATION_PREFERRED", dimensions: ["OPERATIONAL", "RELATIONAL", "TRUTH"] }),
  p({ predicate: "operations.automation_level", family: "OPERATIONS", label: "Operational automation level", meaning: "Observed class of automation present in operational processes.", kind: "STATE", valueType: "ENUM", mutability: "DYNAMIC", refreshClass: "MEDIUM", evidenceExpectation: "MULTI_SOURCE_PREFERRED", dimensions: ["OPERATIONAL", "TECHNOLOGICAL", "TRUTH"] }),
  p({ predicate: "operations.seasonality", family: "OPERATIONS", label: "Operational seasonality", meaning: "Recurring seasonal variation materially affecting operations.", kind: "BEHAVIOUR", valueType: "ENUM", mutability: "STABLE", refreshClass: "SLOW", evidenceExpectation: "INDEPENDENT_CORROBORATION_PREFERRED", dimensions: ["OPERATIONAL", "TEMPORAL", "TRUTH"] }),

  // D — Customers and markets
  p({ predicate: "market.customer_type", family: "CUSTOMERS_MARKETS", label: "Customer type", meaning: "Canonical type of customer served by the organisation.", kind: "CLASSIFICATION", valueType: "ENUM", mutability: "STABLE", refreshClass: "SLOW", evidenceExpectation: "MULTI_SOURCE_PREFERRED", dimensions: ["COMMERCIAL", "RELATIONAL", "TRUTH"] }),
  p({ predicate: "market.customer_industry", family: "CUSTOMERS_MARKETS", label: "Customer industry", meaning: "Industry materially served by the organisation.", kind: "CLASSIFICATION", valueType: "ENUM", mutability: "DYNAMIC", refreshClass: "MEDIUM", evidenceExpectation: "MULTI_SOURCE_PREFERRED", dimensions: ["COMMERCIAL", "RELATIONAL", "TRUTH"] }),
  p({ predicate: "market.served_country", family: "CUSTOMERS_MARKETS", label: "Served country", meaning: "Country in which the organisation actively serves customers.", kind: "STATE", valueType: "COUNTRY", mutability: "DYNAMIC", refreshClass: "MEDIUM", evidenceExpectation: "MULTI_SOURCE_PREFERRED", dimensions: ["COMMERCIAL", "STRUCTURAL", "TRUTH"] }),
  p({ predicate: "market.contract_model", family: "CUSTOMERS_MARKETS", label: "Customer contract model", meaning: "Canonical form of commercial commitment used with customers.", kind: "BEHAVIOUR", valueType: "ENUM", mutability: "STABLE", refreshClass: "SLOW", evidenceExpectation: "MULTI_SOURCE_PREFERRED", dimensions: ["COMMERCIAL", "TRUTH"] }),
  p({ predicate: "market.sales_motion", family: "CUSTOMERS_MARKETS", label: "Sales motion", meaning: "Observed dominant go-to-market sales motion.", kind: "BEHAVIOUR", valueType: "ENUM", mutability: "DYNAMIC", refreshClass: "MEDIUM", evidenceExpectation: "MULTI_SOURCE_PREFERRED", dimensions: ["COMMERCIAL", "STRATEGIC", "TRUTH"] }),
  p({ predicate: "market.channel_type", family: "CUSTOMERS_MARKETS", label: "Go-to-market channel", meaning: "Channel through which the organisation reaches its customers.", kind: "BEHAVIOUR", valueType: "ENUM", mutability: "DYNAMIC", refreshClass: "MEDIUM", evidenceExpectation: "MULTI_SOURCE_PREFERRED", dimensions: ["COMMERCIAL", "RELATIONAL", "TRUTH"] }),

  // E — Commercial behaviour
  p({ predicate: "buying.procurement_model", family: "COMMERCIAL_BEHAVIOUR", label: "Procurement model", meaning: "Observable model through which the organisation procures external goods or services.", kind: "BEHAVIOUR", valueType: "ENUM", mutability: "DYNAMIC", refreshClass: "MEDIUM", evidenceExpectation: "INDEPENDENT_CORROBORATION_PREFERRED", dimensions: ["COMMERCIAL", "OPERATIONAL", "TRUTH"] }),
  p({ predicate: "buying.has_formal_procurement", family: "COMMERCIAL_BEHAVIOUR", label: "Formal procurement", meaning: "Organisation has a formal procurement function or process.", kind: "STATE", valueType: "BOOLEAN", mutability: "STABLE", refreshClass: "SLOW", evidenceExpectation: "MULTI_SOURCE_PREFERRED", dimensions: ["COMMERCIAL", "STRUCTURAL", "TRUTH"] }),
  p({ predicate: "buying.vendor_framework", family: "COMMERCIAL_BEHAVIOUR", label: "Vendor framework", meaning: "Known framework, panel, marketplace or approved-vendor mechanism used for purchasing.", kind: "STATE", valueType: "TEXT", mutability: "DYNAMIC", refreshClass: "MEDIUM", evidenceExpectation: "AUTHORITATIVE_SOURCE_PREFERRED", dimensions: ["COMMERCIAL", "RELATIONAL", "TRUTH"] }),
  p({ predicate: "buying.tender_usage", family: "COMMERCIAL_BEHAVIOUR", label: "Tender usage", meaning: "Observed extent to which purchasing occurs through tenders or formal competitions.", kind: "BEHAVIOUR", valueType: "ENUM", mutability: "STABLE", refreshClass: "SLOW", evidenceExpectation: "MULTI_SOURCE_PREFERRED", dimensions: ["COMMERCIAL", "TRUTH"] }),
  p({ predicate: "buying.decision_velocity", family: "COMMERCIAL_BEHAVIOUR", label: "Decision velocity", meaning: "Observed class of purchasing decision-cycle speed, where supported by evidence.", kind: "BEHAVIOUR", valueType: "ENUM", mutability: "DYNAMIC", refreshClass: "MEDIUM", evidenceExpectation: "INDEPENDENT_CORROBORATION_PREFERRED", dimensions: ["COMMERCIAL", "TEMPORAL", "TRUTH"] }),
  p({ predicate: "buying.innovation_posture", family: "COMMERCIAL_BEHAVIOUR", label: "Innovation posture", meaning: "Observable organisational behaviour toward adopting materially new products or methods.", kind: "BEHAVIOUR", valueType: "ENUM", mutability: "DYNAMIC", refreshClass: "MEDIUM", evidenceExpectation: "INDEPENDENT_CORROBORATION_PREFERRED", dimensions: ["COMMERCIAL", "STRATEGIC", "TRUTH"] }),

  // F — Technology
  p({ predicate: "technology.erp", family: "TECHNOLOGY", label: "ERP platform", meaning: "ERP product or platform used by the organisation.", kind: "STATE", valueType: "ENUM", mutability: "DYNAMIC", refreshClass: "MEDIUM", evidenceExpectation: "INDEPENDENT_CORROBORATION_PREFERRED", dimensions: ["TECHNOLOGICAL", "OPERATIONAL", "TRUTH"], aliases: ["enterprise resource planning"] }),
  p({ predicate: "technology.crm", family: "TECHNOLOGY", label: "CRM platform", meaning: "CRM product or platform used by the organisation.", kind: "STATE", valueType: "ENUM", mutability: "DYNAMIC", refreshClass: "MEDIUM", evidenceExpectation: "INDEPENDENT_CORROBORATION_PREFERRED", dimensions: ["TECHNOLOGICAL", "COMMERCIAL", "TRUTH"] }),
  p({ predicate: "technology.wms", family: "TECHNOLOGY", label: "Warehouse management system", meaning: "Warehouse management system used by the organisation.", kind: "STATE", valueType: "ENUM", mutability: "DYNAMIC", refreshClass: "MEDIUM", evidenceExpectation: "INDEPENDENT_CORROBORATION_PREFERRED", dimensions: ["TECHNOLOGICAL", "OPERATIONAL", "TRUTH"] }),
  p({ predicate: "technology.cloud_platform", family: "TECHNOLOGY", label: "Cloud platform", meaning: "Cloud infrastructure platform materially used by the organisation.", kind: "STATE", valueType: "ENUM", mutability: "DYNAMIC", refreshClass: "MEDIUM", evidenceExpectation: "MULTI_SOURCE_PREFERRED", dimensions: ["TECHNOLOGICAL", "TRUTH"] }),
  p({ predicate: "technology.ai_adoption", family: "TECHNOLOGY", label: "AI adoption", meaning: "Observable operational adoption of artificial-intelligence systems.", kind: "STATE", valueType: "ENUM", mutability: "HIGHLY_DYNAMIC", refreshClass: "FAST", evidenceExpectation: "INDEPENDENT_CORROBORATION_PREFERRED", dimensions: ["TECHNOLOGICAL", "STRATEGIC", "TEMPORAL", "TRUTH"] }),
  p({ predicate: "technology.integration_capability", family: "TECHNOLOGY", label: "Integration capability", meaning: "Observable capability to integrate external systems through APIs, middleware or equivalent mechanisms.", kind: "CAPABILITY", valueType: "ENUM", mutability: "DYNAMIC", refreshClass: "MEDIUM", evidenceExpectation: "MULTI_SOURCE_PREFERRED", dimensions: ["TECHNOLOGICAL", "OPERATIONAL", "TRUTH"] }),
  p({ predicate: "technology.legacy_dependency", family: "TECHNOLOGY", label: "Legacy technology dependency", meaning: "Supported presence of material dependence on legacy technology.", kind: "STATE", valueType: "ENUM", mutability: "DYNAMIC", refreshClass: "MEDIUM", evidenceExpectation: "INDEPENDENT_CORROBORATION_PREFERRED", dimensions: ["TECHNOLOGICAL", "OPERATIONAL", "STRATEGIC", "TRUTH"] }),
  p({ predicate: "technology.digital_maturity", family: "TECHNOLOGY", label: "Digital maturity", meaning: "Evidence-backed canonical maturity class for digital operating capability.", kind: "CLASSIFICATION", valueType: "ENUM", mutability: "DYNAMIC", refreshClass: "MEDIUM", evidenceExpectation: "INDEPENDENT_CORROBORATION_PREFERRED", dimensions: ["TECHNOLOGICAL", "STRATEGIC", "TRUTH"] }),

  // G — Financial
  p({ predicate: "financial.revenue", family: "FINANCIAL", label: "Revenue", meaning: "Supported annual revenue value for a stated reporting period.", kind: "QUANTITY", valueType: "MONEY", mutability: "DYNAMIC", refreshClass: "MEDIUM", evidenceExpectation: "AUTHORITATIVE_SOURCE_PREFERRED", dimensions: ["COMMERCIAL", "TEMPORAL", "TRUTH"] }),
  p({ predicate: "financial.revenue_growth", family: "FINANCIAL", label: "Revenue growth", meaning: "Supported revenue growth percentage for a stated period.", kind: "QUANTITY", valueType: "PERCENTAGE", mutability: "DYNAMIC", refreshClass: "MEDIUM", evidenceExpectation: "AUTHORITATIVE_SOURCE_PREFERRED", dimensions: ["COMMERCIAL", "STRATEGIC", "TEMPORAL", "TRUTH"] }),
  p({ predicate: "financial.profitability_state", family: "FINANCIAL", label: "Profitability state", meaning: "Evidence-backed profitability classification for a stated period.", kind: "STATE", valueType: "ENUM", mutability: "DYNAMIC", refreshClass: "MEDIUM", evidenceExpectation: "AUTHORITATIVE_SOURCE_PREFERRED", dimensions: ["COMMERCIAL", "TEMPORAL", "TRUTH"] }),
  p({ predicate: "financial.capex_intensity", family: "FINANCIAL", label: "CapEx intensity", meaning: "Evidence-backed canonical class of capital expenditure intensity.", kind: "CLASSIFICATION", valueType: "ENUM", mutability: "DYNAMIC", refreshClass: "MEDIUM", evidenceExpectation: "AUTHORITATIVE_SOURCE_PREFERRED", dimensions: ["COMMERCIAL", "OPERATIONAL", "STRATEGIC", "TRUTH"] }),
  p({ predicate: "financial.opex_intensity", family: "FINANCIAL", label: "OpEx intensity", meaning: "Evidence-backed canonical class of operating expenditure intensity.", kind: "CLASSIFICATION", valueType: "ENUM", mutability: "DYNAMIC", refreshClass: "MEDIUM", evidenceExpectation: "AUTHORITATIVE_SOURCE_PREFERRED", dimensions: ["COMMERCIAL", "OPERATIONAL", "TRUTH"] }),
  p({ predicate: "financial.funding_event", family: "FINANCIAL", label: "Funding event", meaning: "Externally evidenced financing event involving the organisation.", kind: "EVENT", valueType: "MONEY", mutability: "EVENT_BOUND", refreshClass: "EVENT_DRIVEN", evidenceExpectation: "EVENT_SOURCE_REQUIRED", dimensions: ["COMMERCIAL", "STRATEGIC", "TEMPORAL", "TRUTH"] }),

  // H — Strategy
  p({ predicate: "strategy.priority", family: "STRATEGY", label: "Strategic priority", meaning: "Explicitly evidenced current organisational strategic priority.", kind: "STATE", valueType: "ENUM", mutability: "DYNAMIC", refreshClass: "FAST", evidenceExpectation: "AUTHORITATIVE_SOURCE_PREFERRED", dimensions: ["STRATEGIC", "COMMERCIAL", "TEMPORAL", "TRUTH"] }),
  p({ predicate: "strategy.transformation_programme", family: "STRATEGY", label: "Transformation programme", meaning: "Evidence-backed transformation programme currently undertaken by the organisation.", kind: "STATE", valueType: "TEXT", mutability: "HIGHLY_DYNAMIC", refreshClass: "FAST", evidenceExpectation: "MULTI_SOURCE_PREFERRED", dimensions: ["STRATEGIC", "OPERATIONAL", "TEMPORAL", "TRUTH"] }),
  p({ predicate: "strategy.geographic_expansion", family: "STRATEGY", label: "Geographic expansion", meaning: "Evidence-backed active or announced expansion into a geographic market.", kind: "EVENT", valueType: "COUNTRY", mutability: "EVENT_BOUND", refreshClass: "EVENT_DRIVEN", evidenceExpectation: "EVENT_SOURCE_REQUIRED", dimensions: ["STRATEGIC", "STRUCTURAL", "TEMPORAL", "TRUTH"] }),
  p({ predicate: "strategy.facility_expansion", family: "STRATEGY", label: "Facility expansion", meaning: "Evidence-backed creation or expansion of an operational facility.", kind: "EVENT", valueType: "TEXT", mutability: "EVENT_BOUND", refreshClass: "EVENT_DRIVEN", evidenceExpectation: "EVENT_SOURCE_REQUIRED", dimensions: ["STRATEGIC", "OPERATIONAL", "TEMPORAL", "TRUTH"] }),
  p({ predicate: "strategy.acquisition_event", family: "STRATEGY", label: "Acquisition event", meaning: "Acquisition made or announced by the organisation.", kind: "EVENT", valueType: "ENTITY_REF", mutability: "EVENT_BOUND", refreshClass: "EVENT_DRIVEN", evidenceExpectation: "AUTHORITATIVE_SOURCE_PREFERRED", dimensions: ["STRATEGIC", "STRUCTURAL", "RELATIONAL", "TEMPORAL", "TRUTH"] }),
  p({ predicate: "strategy.restructuring_event", family: "STRATEGY", label: "Restructuring event", meaning: "Material organisational restructuring announced or underway.", kind: "EVENT", valueType: "TEXT", mutability: "EVENT_BOUND", refreshClass: "EVENT_DRIVEN", evidenceExpectation: "MULTI_SOURCE_PREFERRED", dimensions: ["STRATEGIC", "STRUCTURAL", "TEMPORAL", "TRUTH"] }),

  // I — Risk and compliance
  p({ predicate: "risk.regulatory_regime", family: "RISK_COMPLIANCE", label: "Regulatory regime", meaning: "Regulatory regime materially governing the organisation's activities.", kind: "CONSTRAINT", valueType: "ENUM", mutability: "STABLE", refreshClass: "SLOW", evidenceExpectation: "AUTHORITATIVE_SOURCE_PREFERRED", dimensions: ["STRUCTURAL", "OPERATIONAL", "TRUTH"] }),
  p({ predicate: "risk.certification", family: "RISK_COMPLIANCE", label: "Certification", meaning: "Externally evidenced certification held by the organisation.", kind: "STATE", valueType: "ENUM", mutability: "DYNAMIC", refreshClass: "MEDIUM", evidenceExpectation: "AUTHORITATIVE_SOURCE_PREFERRED", dimensions: ["OPERATIONAL", "TECHNOLOGICAL", "TRUTH"] }),
  p({ predicate: "risk.data_residency_constraint", family: "RISK_COMPLIANCE", label: "Data residency constraint", meaning: "Supported constraint governing where organisational data may be stored or processed.", kind: "CONSTRAINT", valueType: "COUNTRY", mutability: "DYNAMIC", refreshClass: "MEDIUM", evidenceExpectation: "AUTHORITATIVE_SOURCE_PREFERRED", dimensions: ["TECHNOLOGICAL", "STRUCTURAL", "TRUTH"] }),
  p({ predicate: "risk.vendor_security_requirement", family: "RISK_COMPLIANCE", label: "Vendor security requirement", meaning: "Supported security requirement imposed on external suppliers.", kind: "CONSTRAINT", valueType: "ENUM", mutability: "DYNAMIC", refreshClass: "MEDIUM", evidenceExpectation: "AUTHORITATIVE_SOURCE_PREFERRED", dimensions: ["TECHNOLOGICAL", "COMMERCIAL", "TRUTH"] }),
  p({ predicate: "risk.supply_chain_exposure", family: "RISK_COMPLIANCE", label: "Supply-chain exposure", meaning: "Evidence-backed class of material supply-chain exposure.", kind: "STATE", valueType: "ENUM", mutability: "DYNAMIC", refreshClass: "MEDIUM", evidenceExpectation: "INDEPENDENT_CORROBORATION_PREFERRED", dimensions: ["OPERATIONAL", "RELATIONAL", "TRUTH"] }),

  // J — Dynamic signals
  p({ predicate: "signal.hiring", family: "DYNAMIC_SIGNALS", label: "Hiring signal", meaning: "Current hiring activity for a canonical role/function relevant to organisational state.", kind: "SIGNAL", valueType: "TEXT", mutability: "HIGHLY_DYNAMIC", refreshClass: "FAST", evidenceExpectation: "EVENT_SOURCE_REQUIRED", dimensions: ["STRATEGIC", "TEMPORAL", "STRUCTURAL", "TRUTH"] }),
  p({ predicate: "signal.executive_appointment", family: "DYNAMIC_SIGNALS", label: "Executive appointment", meaning: "Appointment of an executive or senior functional leader.", kind: "EVENT", valueType: "ENTITY_REF", mutability: "EVENT_BOUND", refreshClass: "EVENT_DRIVEN", evidenceExpectation: "EVENT_SOURCE_REQUIRED", dimensions: ["STRUCTURAL", "STRATEGIC", "TEMPORAL", "RELATIONAL", "TRUTH"] }),
  p({ predicate: "signal.technology_project", family: "DYNAMIC_SIGNALS", label: "Technology project", meaning: "Current or announced technology implementation, replacement or transformation project.", kind: "SIGNAL", valueType: "TEXT", mutability: "HIGHLY_DYNAMIC", refreshClass: "FAST", evidenceExpectation: "INDEPENDENT_CORROBORATION_PREFERRED", dimensions: ["TECHNOLOGICAL", "STRATEGIC", "TEMPORAL", "TRUTH"] }),
  p({ predicate: "signal.tender", family: "DYNAMIC_SIGNALS", label: "Tender signal", meaning: "Published or evidenced procurement tender or request for proposal.", kind: "SIGNAL", valueType: "URL", mutability: "EVENT_BOUND", refreshClass: "EVENT_DRIVEN", evidenceExpectation: "AUTHORITATIVE_SOURCE_REQUIRED", dimensions: ["COMMERCIAL", "TEMPORAL", "RELATIONAL", "TRUTH"] }),
  p({ predicate: "signal.partnership_announcement", family: "DYNAMIC_SIGNALS", label: "Partnership announcement", meaning: "Current announced commercial or strategic partnership.", kind: "EVENT", valueType: "ENTITY_REF", mutability: "EVENT_BOUND", refreshClass: "EVENT_DRIVEN", evidenceExpectation: "EVENT_SOURCE_REQUIRED", dimensions: ["RELATIONAL", "STRATEGIC", "COMMERCIAL", "TEMPORAL", "TRUTH"] }),
  p({ predicate: "signal.facility_opening", family: "DYNAMIC_SIGNALS", label: "Facility opening", meaning: "New operational facility announced or opened.", kind: "EVENT", valueType: "TEXT", mutability: "EVENT_BOUND", refreshClass: "EVENT_DRIVEN", evidenceExpectation: "EVENT_SOURCE_REQUIRED", dimensions: ["OPERATIONAL", "STRUCTURAL", "STRATEGIC", "TEMPORAL", "TRUTH"] }),
  p({ predicate: "signal.public_pain", family: "DYNAMIC_SIGNALS", label: "Publicly evidenced operational pain", meaning: "Specific current operational or commercial problem explicitly evidenced by public material; never inferred solely from fit.", kind: "SIGNAL", valueType: "TEXT", mutability: "HIGHLY_DYNAMIC", refreshClass: "FAST", evidenceExpectation: "INDEPENDENT_CORROBORATION_PREFERRED", dimensions: ["OPERATIONAL", "COMMERCIAL", "TEMPORAL", "TRUTH"] }),

  // K — Ecosystem
  p({ predicate: "ecosystem.supplier", family: "ECOSYSTEM", label: "Supplier relationship", meaning: "Supplier publicly evidenced as serving the organisation.", kind: "STATE", valueType: "ENTITY_REF", mutability: "DYNAMIC", refreshClass: "MEDIUM", evidenceExpectation: "MULTI_SOURCE_PREFERRED", dimensions: ["RELATIONAL", "OPERATIONAL", "COMMERCIAL", "TRUTH"] }),
  p({ predicate: "ecosystem.strategic_partner", family: "ECOSYSTEM", label: "Strategic partner", meaning: "Organisation with an evidenced strategic partnership relationship.", kind: "STATE", valueType: "ENTITY_REF", mutability: "DYNAMIC", refreshClass: "MEDIUM", evidenceExpectation: "MULTI_SOURCE_PREFERRED", dimensions: ["RELATIONAL", "STRATEGIC", "COMMERCIAL", "TRUTH"] }),
  p({ predicate: "ecosystem.technology_vendor", family: "ECOSYSTEM", label: "Technology vendor", meaning: "Vendor whose technology is materially used by the organisation.", kind: "STATE", valueType: "ENTITY_REF", mutability: "DYNAMIC", refreshClass: "MEDIUM", evidenceExpectation: "INDEPENDENT_CORROBORATION_PREFERRED", dimensions: ["RELATIONAL", "TECHNOLOGICAL", "TRUTH"] }),
  p({ predicate: "ecosystem.industry_membership", family: "ECOSYSTEM", label: "Industry membership", meaning: "Membership of an industry body, association or consortium.", kind: "STATE", valueType: "ENTITY_REF", mutability: "DYNAMIC", refreshClass: "SLOW", evidenceExpectation: "AUTHORITATIVE_SOURCE_PREFERRED", dimensions: ["RELATIONAL", "COMMERCIAL", "TRUTH"] }),
  p({ predicate: "ecosystem.procurement_framework", family: "ECOSYSTEM", label: "Procurement framework membership", meaning: "Framework through which the organisation can buy or be bought from.", kind: "STATE", valueType: "TEXT", mutability: "DYNAMIC", refreshClass: "MEDIUM", evidenceExpectation: "AUTHORITATIVE_SOURCE_REQUIRED", dimensions: ["RELATIONAL", "COMMERCIAL", "TRUTH"] }),
  p({ predicate: "ecosystem.major_customer", family: "ECOSYSTEM", label: "Major customer", meaning: "Customer relationship that is explicitly and credibly public.", kind: "STATE", valueType: "ENTITY_REF", mutability: "DYNAMIC", refreshClass: "MEDIUM", evidenceExpectation: "INDEPENDENT_CORROBORATION_PREFERRED", dimensions: ["RELATIONAL", "COMMERCIAL", "TRUTH"] }),


  // Build 5 completeness extensions — objective facts proven necessary by adversarial archetype tests.
  // Corporate structure / jurisdiction
  p({ predicate: "identity.legal_form", family: "CORPORATE_IDENTITY", label: "Legal form", meaning: "Canonical legal structure under which the organisation is constituted.", kind: "CLASSIFICATION", valueType: "ENUM", mutability: "STABLE", refreshClass: "SLOW", evidenceExpectation: "AUTHORITATIVE_SOURCE_PREFERRED", dimensions: ["STRUCTURAL", "COMMERCIAL", "TRUTH"] }),
  p({ predicate: "identity.ownership_type", family: "CORPORATE_IDENTITY", label: "Ownership type", meaning: "Canonical ownership classification such as private, public, state-owned, cooperative or nonprofit.", kind: "CLASSIFICATION", valueType: "ENUM", mutability: "DYNAMIC", refreshClass: "MEDIUM", evidenceExpectation: "AUTHORITATIVE_SOURCE_PREFERRED", dimensions: ["STRUCTURAL", "COMMERCIAL", "TRUTH"] }),
  p({ predicate: "identity.public_listing", family: "CORPORATE_IDENTITY", label: "Public listing", meaning: "Whether the organisation is publicly listed on a recognised securities market.", kind: "STATE", valueType: "BOOLEAN", mutability: "DYNAMIC", refreshClass: "MEDIUM", evidenceExpectation: "AUTHORITATIVE_SOURCE_REQUIRED", dimensions: ["STRUCTURAL", "COMMERCIAL", "TRUTH"] }),
  p({ predicate: "identity.headquarters_region", family: "CORPORATE_IDENTITY", label: "Headquarters region", meaning: "Canonical region containing the organisation's principal headquarters.", kind: "STATE", valueType: "REGION", mutability: "STABLE", refreshClass: "SLOW", evidenceExpectation: "MULTI_SOURCE_PREFERRED", dimensions: ["STRUCTURAL", "OPERATIONAL", "TRUTH"] }),
  p({ predicate: "identity.primary_business_language", family: "CORPORATE_IDENTITY", label: "Primary business language", meaning: "Primary language publicly used for the organisation's commercial operations.", kind: "STATE", valueType: "ENUM", mutability: "STABLE", refreshClass: "SLOW", evidenceExpectation: "MULTI_SOURCE_PREFERRED", dimensions: ["SEMANTIC", "OPERATIONAL", "COMMERCIAL", "TRUTH"] }),

  // Commercial delivery mechanics
  p({ predicate: "commercial.delivery_model", family: "COMMERCIAL_IDENTITY", label: "Delivery model", meaning: "Canonical model through which the organisation delivers its products or services to customers.", kind: "BEHAVIOUR", valueType: "ENUM", mutability: "DYNAMIC", refreshClass: "MEDIUM", evidenceExpectation: "MULTI_SOURCE_PREFERRED", dimensions: ["COMMERCIAL", "OPERATIONAL", "TRUTH"] }),
  p({ predicate: "commercial.product_delivery_mode", family: "COMMERCIAL_IDENTITY", label: "Product delivery mode", meaning: "Physical, digital, embedded, licensed or other canonical mode through which products are delivered.", kind: "BEHAVIOUR", valueType: "ENUM", mutability: "DYNAMIC", refreshClass: "MEDIUM", evidenceExpectation: "ONE_CREDIBLE_SOURCE", dimensions: ["COMMERCIAL", "OPERATIONAL", "TECHNOLOGICAL", "TRUTH"] }),
  p({ predicate: "commercial.service_delivery_mode", family: "COMMERCIAL_IDENTITY", label: "Service delivery mode", meaning: "On-site, remote, hybrid, managed or other canonical mode through which services are delivered.", kind: "BEHAVIOUR", valueType: "ENUM", mutability: "DYNAMIC", refreshClass: "MEDIUM", evidenceExpectation: "ONE_CREDIBLE_SOURCE", dimensions: ["COMMERCIAL", "OPERATIONAL", "TRUTH"] }),
  p({ predicate: "commercial.minimum_contract_value", family: "COMMERCIAL_IDENTITY", label: "Minimum contract value", meaning: "Publicly evidenced minimum monetary value at which the organisation offers a contract or engagement.", kind: "CONSTRAINT", valueType: "MONEY", mutability: "DYNAMIC", refreshClass: "MEDIUM", evidenceExpectation: "ONE_CREDIBLE_SOURCE", dimensions: ["COMMERCIAL", "STRUCTURAL", "TRUTH"] }),
  p({ predicate: "commercial.route_to_market", family: "COMMERCIAL_IDENTITY", label: "Route to market", meaning: "Canonical route through which the organisation primarily reaches and transacts with customers.", kind: "BEHAVIOUR", valueType: "ENUM", mutability: "DYNAMIC", refreshClass: "MEDIUM", evidenceExpectation: "MULTI_SOURCE_PREFERRED", dimensions: ["COMMERCIAL", "RELATIONAL", "TRUTH"] }),

  // Operating scale and mechanics
  p({ predicate: "operations.facility_type", family: "OPERATIONS", label: "Facility type", meaning: "Canonical type of physical facility materially operated by the organisation.", kind: "CLASSIFICATION", valueType: "ENUM", mutability: "DYNAMIC", refreshClass: "MEDIUM", evidenceExpectation: "MULTI_SOURCE_PREFERRED", dimensions: ["OPERATIONAL", "STRUCTURAL", "TRUTH"] }),
  p({ predicate: "operations.operating_scale", family: "OPERATIONS", label: "Operating scale", meaning: "Canonical band describing the scale of the organisation's material operating activity without expressing commercial attractiveness.", kind: "CLASSIFICATION", valueType: "ENUM", mutability: "DYNAMIC", refreshClass: "MEDIUM", evidenceExpectation: "MULTI_SOURCE_PREFERRED", dimensions: ["OPERATIONAL", "STRUCTURAL", "TRUTH"] }),
  p({ predicate: "operations.asset_intensity", family: "OPERATIONS", label: "Asset intensity", meaning: "Canonical band describing dependence on material physical assets in normal operations.", kind: "CLASSIFICATION", valueType: "ENUM", mutability: "STABLE", refreshClass: "SLOW", evidenceExpectation: "MULTI_SOURCE_PREFERRED", dimensions: ["OPERATIONAL", "COMMERCIAL", "TRUTH"] }),
  p({ predicate: "operations.inventory_complexity", family: "OPERATIONS", label: "Inventory complexity", meaning: "Canonical complexity classification for inventory breadth, locations, handling or control requirements.", kind: "CLASSIFICATION", valueType: "ENUM", mutability: "DYNAMIC", refreshClass: "MEDIUM", evidenceExpectation: "INDEPENDENT_CORROBORATION_PREFERRED", dimensions: ["OPERATIONAL", "COMMERCIAL", "TRUTH"] }),
  p({ predicate: "operations.logistics_mode", family: "OPERATIONS", label: "Logistics mode", meaning: "Canonical transport or logistics mode materially used in the organisation's operations.", kind: "BEHAVIOUR", valueType: "ENUM", mutability: "DYNAMIC", refreshClass: "MEDIUM", evidenceExpectation: "MULTI_SOURCE_PREFERRED", dimensions: ["OPERATIONAL", "RELATIONAL", "TRUTH"] }),
  p({ predicate: "operations.manufacturing_process", family: "OPERATIONS", label: "Manufacturing process", meaning: "Canonical manufacturing process materially used by the organisation.", kind: "BEHAVIOUR", valueType: "ENUM", mutability: "DYNAMIC", refreshClass: "MEDIUM", evidenceExpectation: "MULTI_SOURCE_PREFERRED", dimensions: ["OPERATIONAL", "TECHNOLOGICAL", "TRUTH"] }),
  p({ predicate: "operations.order_volume_band", family: "OPERATIONS", label: "Order volume band", meaning: "Supported canonical band for the volume of orders, transactions or service jobs handled in normal operations.", kind: "CLASSIFICATION", valueType: "ENUM", mutability: "DYNAMIC", refreshClass: "MEDIUM", evidenceExpectation: "MULTI_SOURCE_PREFERRED", dimensions: ["OPERATIONAL", "COMMERCIAL", "TEMPORAL", "TRUTH"] }),
  p({ predicate: "operations.workforce_model", family: "OPERATIONS", label: "Workforce model", meaning: "Canonical operating workforce model such as site-based, field-based, remote, hybrid or distributed.", kind: "BEHAVIOUR", valueType: "ENUM", mutability: "DYNAMIC", refreshClass: "MEDIUM", evidenceExpectation: "MULTI_SOURCE_PREFERRED", dimensions: ["OPERATIONAL", "STRUCTURAL", "TRUTH"] }),

  // Customer economics and demand shape
  p({ predicate: "market.customer_size_segment", family: "CUSTOMERS_MARKETS", label: "Customer size segment", meaning: "Canonical customer size segment materially served by the organisation.", kind: "CLASSIFICATION", valueType: "ENUM", mutability: "DYNAMIC", refreshClass: "MEDIUM", evidenceExpectation: "MULTI_SOURCE_PREFERRED", dimensions: ["COMMERCIAL", "STRUCTURAL", "TRUTH"] }),
  p({ predicate: "market.customer_channel", family: "CUSTOMERS_MARKETS", label: "Customer channel", meaning: "Canonical channel through which customers engage or transact with the organisation.", kind: "BEHAVIOUR", valueType: "ENUM", mutability: "DYNAMIC", refreshClass: "MEDIUM", evidenceExpectation: "MULTI_SOURCE_PREFERRED", dimensions: ["COMMERCIAL", "RELATIONAL", "TRUTH"] }),
  p({ predicate: "market.purchase_frequency", family: "CUSTOMERS_MARKETS", label: "Purchase frequency", meaning: "Canonical frequency pattern with which customers purchase or renew the organisation's offering.", kind: "BEHAVIOUR", valueType: "ENUM", mutability: "DYNAMIC", refreshClass: "MEDIUM", evidenceExpectation: "MULTI_SOURCE_PREFERRED", dimensions: ["COMMERCIAL", "TEMPORAL", "TRUTH"] }),
  p({ predicate: "market.average_contract_value", family: "CUSTOMERS_MARKETS", label: "Average contract value", meaning: "Publicly supportable average or representative customer contract value.", kind: "QUANTITY", valueType: "MONEY", mutability: "DYNAMIC", refreshClass: "MEDIUM", evidenceExpectation: "INDEPENDENT_CORROBORATION_PREFERRED", dimensions: ["COMMERCIAL", "TEMPORAL", "TRUTH"] }),

  // Purchasing constraints
  p({ predicate: "buying.budget_cycle", family: "COMMERCIAL_BEHAVIOUR", label: "Budget cycle", meaning: "Canonical recurring cycle through which material purchasing budgets are planned or released.", kind: "BEHAVIOUR", valueType: "ENUM", mutability: "STABLE", refreshClass: "SLOW", evidenceExpectation: "INDEPENDENT_CORROBORATION_PREFERRED", dimensions: ["COMMERCIAL", "TEMPORAL", "TRUTH"] }),
  p({ predicate: "buying.payment_terms", family: "COMMERCIAL_BEHAVIOUR", label: "Payment terms", meaning: "Publicly evidenced standard or material payment terms applied to suppliers.", kind: "CONSTRAINT", valueType: "DURATION", mutability: "DYNAMIC", refreshClass: "MEDIUM", evidenceExpectation: "AUTHORITATIVE_SOURCE_PREFERRED", dimensions: ["COMMERCIAL", "TEMPORAL", "TRUTH"] }),
  p({ predicate: "buying.purchase_authority_model", family: "COMMERCIAL_BEHAVIOUR", label: "Purchase authority model", meaning: "Canonical structure by which purchasing authority is centralised, delegated or distributed.", kind: "BEHAVIOUR", valueType: "ENUM", mutability: "DYNAMIC", refreshClass: "MEDIUM", evidenceExpectation: "INDEPENDENT_CORROBORATION_PREFERRED", dimensions: ["COMMERCIAL", "STRUCTURAL", "TRUTH"] }),
  p({ predicate: "buying.incumbent_vendor_dependency", family: "COMMERCIAL_BEHAVIOUR", label: "Incumbent vendor dependency", meaning: "Canonical degree to which a material purchasing area depends on an incumbent vendor or long-lived contract.", kind: "CONSTRAINT", valueType: "ENUM", mutability: "DYNAMIC", refreshClass: "MEDIUM", evidenceExpectation: "INDEPENDENT_CORROBORATION_PREFERRED", dimensions: ["COMMERCIAL", "RELATIONAL", "TRUTH"] }),
  p({ predicate: "buying.vendor_onboarding_duration", family: "COMMERCIAL_BEHAVIOUR", label: "Vendor onboarding duration", meaning: "Supported typical duration required to onboard a new supplier or vendor.", kind: "QUANTITY", valueType: "DURATION", mutability: "DYNAMIC", refreshClass: "MEDIUM", evidenceExpectation: "INDEPENDENT_CORROBORATION_PREFERRED", dimensions: ["COMMERCIAL", "TEMPORAL", "TRUTH"] }),
  p({ predicate: "buying.purchase_currency", family: "COMMERCIAL_BEHAVIOUR", label: "Purchase currency", meaning: "Currency materially used by the organisation when purchasing goods or services.", kind: "STATE", valueType: "ENUM", mutability: "STABLE", refreshClass: "SLOW", evidenceExpectation: "ONE_CREDIBLE_SOURCE", dimensions: ["COMMERCIAL", "STRUCTURAL", "TRUTH"] }),

  // Organisation — business structure without person/contact reasoning
  p({ predicate: "organisation.business_function", family: "ORGANISATION", label: "Business function", meaning: "Canonical business function materially present within the organisation.", kind: "CAPABILITY", valueType: "ENUM", mutability: "DYNAMIC", refreshClass: "MEDIUM", evidenceExpectation: "MULTI_SOURCE_PREFERRED", dimensions: ["STRUCTURAL", "OPERATIONAL", "TRUTH"] }),
  p({ predicate: "organisation.department", family: "ORGANISATION", label: "Department", meaning: "Canonical organisational department or equivalent operating unit materially present.", kind: "STATE", valueType: "ENUM", mutability: "DYNAMIC", refreshClass: "MEDIUM", evidenceExpectation: "MULTI_SOURCE_PREFERRED", dimensions: ["STRUCTURAL", "OPERATIONAL", "TRUTH"] }),
  p({ predicate: "organisation.decision_centralisation", family: "ORGANISATION", label: "Decision centralisation", meaning: "Canonical degree to which material business decisions are centralised or distributed across the organisation.", kind: "BEHAVIOUR", valueType: "ENUM", mutability: "DYNAMIC", refreshClass: "MEDIUM", evidenceExpectation: "INDEPENDENT_CORROBORATION_PREFERRED", dimensions: ["STRUCTURAL", "COMMERCIAL", "TRUTH"] }),
  p({ predicate: "organisation.procurement_owner_function", family: "ORGANISATION", label: "Procurement owner function", meaning: "Business function that owns or materially governs procurement activity, without identifying a person.", kind: "STATE", valueType: "ENUM", mutability: "DYNAMIC", refreshClass: "MEDIUM", evidenceExpectation: "INDEPENDENT_CORROBORATION_PREFERRED", dimensions: ["STRUCTURAL", "COMMERCIAL", "TRUTH"] }),
  p({ predicate: "organisation.technology_owner_function", family: "ORGANISATION", label: "Technology owner function", meaning: "Business function that owns or materially governs technology decisions, without identifying a person.", kind: "STATE", valueType: "ENUM", mutability: "DYNAMIC", refreshClass: "MEDIUM", evidenceExpectation: "INDEPENDENT_CORROBORATION_PREFERRED", dimensions: ["STRUCTURAL", "TECHNOLOGICAL", "TRUTH"] }),
  p({ predicate: "organisation.operations_owner_function", family: "ORGANISATION", label: "Operations owner function", meaning: "Business function that owns or materially governs operations, without identifying a person.", kind: "STATE", valueType: "ENUM", mutability: "DYNAMIC", refreshClass: "MEDIUM", evidenceExpectation: "INDEPENDENT_CORROBORATION_PREFERRED", dimensions: ["STRUCTURAL", "OPERATIONAL", "TRUTH"] }),

  // Technology compatibility surface
  p({ predicate: "technology.api_capability", family: "TECHNOLOGY", label: "API capability", meaning: "Whether the organisation exposes or materially consumes supported application programming interfaces.", kind: "CAPABILITY", valueType: "BOOLEAN", mutability: "DYNAMIC", refreshClass: "MEDIUM", evidenceExpectation: "MULTI_SOURCE_PREFERRED", dimensions: ["TECHNOLOGICAL", "OPERATIONAL", "TRUTH"] }),
  p({ predicate: "technology.deployment_model", family: "TECHNOLOGY", label: "Deployment model", meaning: "Canonical deployment model materially used for technology workloads, such as cloud, on-premise or hybrid.", kind: "BEHAVIOUR", valueType: "ENUM", mutability: "DYNAMIC", refreshClass: "MEDIUM", evidenceExpectation: "MULTI_SOURCE_PREFERRED", dimensions: ["TECHNOLOGICAL", "OPERATIONAL", "TRUTH"] }),
  p({ predicate: "technology.data_integration_method", family: "TECHNOLOGY", label: "Data integration method", meaning: "Canonical integration method materially used to exchange data between systems.", kind: "CAPABILITY", valueType: "ENUM", mutability: "DYNAMIC", refreshClass: "MEDIUM", evidenceExpectation: "MULTI_SOURCE_PREFERRED", dimensions: ["TECHNOLOGICAL", "OPERATIONAL", "TRUTH"] }),
  p({ predicate: "technology.identity_provider", family: "TECHNOLOGY", label: "Identity provider", meaning: "Canonical identity or access-management platform materially used by the organisation.", kind: "STATE", valueType: "ENUM", mutability: "DYNAMIC", refreshClass: "MEDIUM", evidenceExpectation: "INDEPENDENT_CORROBORATION_PREFERRED", dimensions: ["TECHNOLOGICAL", "STRATEGIC", "TRUTH"] }),
  p({ predicate: "technology.ecommerce_platform", family: "TECHNOLOGY", label: "Ecommerce platform", meaning: "Canonical ecommerce platform materially used by the organisation.", kind: "STATE", valueType: "ENUM", mutability: "DYNAMIC", refreshClass: "MEDIUM", evidenceExpectation: "INDEPENDENT_CORROBORATION_PREFERRED", dimensions: ["TECHNOLOGICAL", "COMMERCIAL", "TRUTH"] }),
  p({ predicate: "technology.data_platform", family: "TECHNOLOGY", label: "Data platform", meaning: "Canonical data warehouse, lake, analytics or equivalent data platform materially used by the organisation.", kind: "STATE", valueType: "ENUM", mutability: "DYNAMIC", refreshClass: "MEDIUM", evidenceExpectation: "INDEPENDENT_CORROBORATION_PREFERRED", dimensions: ["TECHNOLOGICAL", "OPERATIONAL", "TRUTH"] }),

  // Financial operating context
  p({ predicate: "financial.reporting_currency", family: "FINANCIAL", label: "Reporting currency", meaning: "Currency in which the organisation principally reports financial results.", kind: "STATE", valueType: "ENUM", mutability: "STABLE", refreshClass: "SLOW", evidenceExpectation: "AUTHORITATIVE_SOURCE_PREFERRED", dimensions: ["COMMERCIAL", "STRUCTURAL", "TRUTH"] }),
  p({ predicate: "financial.fiscal_year_end", family: "FINANCIAL", label: "Fiscal year end", meaning: "Canonical month or period in which the organisation's fiscal year closes.", kind: "STATE", valueType: "ENUM", mutability: "VERY_STABLE", refreshClass: "VERY_SLOW", evidenceExpectation: "AUTHORITATIVE_SOURCE_PREFERRED", dimensions: ["COMMERCIAL", "TEMPORAL", "TRUTH"] }),
  p({ predicate: "financial.market_cap", family: "FINANCIAL", label: "Market capitalisation", meaning: "Supported market capitalisation for a publicly listed organisation at an observed time.", kind: "QUANTITY", valueType: "MONEY", mutability: "HIGHLY_DYNAMIC", refreshClass: "FAST", evidenceExpectation: "AUTHORITATIVE_SOURCE_PREFERRED", dimensions: ["COMMERCIAL", "TEMPORAL", "TRUTH"] }),

  // Additional strategy/risk constraints
  p({ predicate: "strategy.outsourcing_posture", family: "STRATEGY", label: "Outsourcing posture", meaning: "Supported strategic posture toward outsourcing or insourcing material capabilities.", kind: "BEHAVIOUR", valueType: "ENUM", mutability: "DYNAMIC", refreshClass: "MEDIUM", evidenceExpectation: "INDEPENDENT_CORROBORATION_PREFERRED", dimensions: ["STRATEGIC", "COMMERCIAL", "OPERATIONAL", "TRUTH"] }),
  p({ predicate: "strategy.sustainability_priority", family: "STRATEGY", label: "Sustainability priority", meaning: "Explicitly stated sustainability or environmental strategic priority.", kind: "STATE", valueType: "ENUM", mutability: "DYNAMIC", refreshClass: "MEDIUM", evidenceExpectation: "MULTI_SOURCE_PREFERRED", dimensions: ["STRATEGIC", "COMMERCIAL", "TRUTH"] }),
  p({ predicate: "risk.export_control_regime", family: "RISK_COMPLIANCE", label: "Export control regime", meaning: "Export-control regime materially applicable to the organisation or its commercial activity.", kind: "CONSTRAINT", valueType: "ENUM", mutability: "DYNAMIC", refreshClass: "EVENT_DRIVEN", evidenceExpectation: "AUTHORITATIVE_SOURCE_REQUIRED", dimensions: ["STRATEGIC", "COMMERCIAL", "TRUTH"] }),
  p({ predicate: "risk.insurance_requirement", family: "RISK_COMPLIANCE", label: "Supplier insurance requirement", meaning: "Publicly evidenced insurance requirement imposed on suppliers or commercial counterparties.", kind: "CONSTRAINT", valueType: "TEXT", mutability: "DYNAMIC", refreshClass: "MEDIUM", evidenceExpectation: "AUTHORITATIVE_SOURCE_PREFERRED", dimensions: ["STRATEGIC", "COMMERCIAL", "TRUTH"] }),
  p({ predicate: "risk.health_safety_regime", family: "RISK_COMPLIANCE", label: "Health and safety regime", meaning: "Health and safety regulatory or assurance regime materially applicable to operations.", kind: "CONSTRAINT", valueType: "ENUM", mutability: "DYNAMIC", refreshClass: "EVENT_DRIVEN", evidenceExpectation: "AUTHORITATIVE_SOURCE_REQUIRED", dimensions: ["STRATEGIC", "OPERATIONAL", "TRUTH"] }),

  // Dynamic commercial events
  p({ predicate: "signal.product_launch", family: "DYNAMIC_SIGNALS", label: "Product launch", meaning: "Observed launch or announced launch of a material product or service.", kind: "EVENT", valueType: "TEXT", mutability: "EVENT_BOUND", refreshClass: "EVENT_DRIVEN", evidenceExpectation: "EVENT_SOURCE_REQUIRED", dimensions: ["TEMPORAL", "COMMERCIAL", "STRATEGIC", "TRUTH"] }),
  p({ predicate: "signal.contract_award", family: "DYNAMIC_SIGNALS", label: "Contract award", meaning: "Observed award of a material commercial or public-sector contract.", kind: "EVENT", valueType: "TEXT", mutability: "EVENT_BOUND", refreshClass: "EVENT_DRIVEN", evidenceExpectation: "EVENT_SOURCE_REQUIRED", dimensions: ["TEMPORAL", "COMMERCIAL", "RELATIONAL", "TRUTH"] }),
  p({ predicate: "signal.site_closure", family: "DYNAMIC_SIGNALS", label: "Site closure", meaning: "Observed closure or announced closure of a material operating site.", kind: "EVENT", valueType: "TEXT", mutability: "EVENT_BOUND", refreshClass: "EVENT_DRIVEN", evidenceExpectation: "EVENT_SOURCE_REQUIRED", dimensions: ["TEMPORAL", "OPERATIONAL", "STRATEGIC", "TRUTH"] }),
  p({ predicate: "signal.supply_chain_disruption", family: "DYNAMIC_SIGNALS", label: "Supply-chain disruption", meaning: "Observed material disruption affecting the organisation's supply chain.", kind: "EVENT", valueType: "TEXT", mutability: "EVENT_BOUND", refreshClass: "EVENT_DRIVEN", evidenceExpectation: "EVENT_SOURCE_REQUIRED", dimensions: ["TEMPORAL", "OPERATIONAL", "STRATEGIC", "TRUTH"] }),
  p({ predicate: "signal.regulatory_change", family: "DYNAMIC_SIGNALS", label: "Regulatory change", meaning: "Observed regulatory change materially affecting the organisation or its market.", kind: "EVENT", valueType: "TEXT", mutability: "EVENT_BOUND", refreshClass: "EVENT_DRIVEN", evidenceExpectation: "AUTHORITATIVE_SOURCE_REQUIRED", dimensions: ["TEMPORAL", "STRATEGIC", "COMMERCIAL", "TRUTH"] }),

  // Wider ecosystem routes
  p({ predicate: "ecosystem.distributor", family: "ECOSYSTEM", label: "Distributor", meaning: "Distributor materially connected to the organisation's commercial activity.", kind: "STATE", valueType: "ENTITY_REF", mutability: "DYNAMIC", refreshClass: "MEDIUM", evidenceExpectation: "MULTI_SOURCE_PREFERRED", dimensions: ["RELATIONAL", "COMMERCIAL", "TRUTH"] }),
  p({ predicate: "ecosystem.reseller", family: "ECOSYSTEM", label: "Reseller", meaning: "Reseller materially connected to the organisation's commercial activity.", kind: "STATE", valueType: "ENTITY_REF", mutability: "DYNAMIC", refreshClass: "MEDIUM", evidenceExpectation: "MULTI_SOURCE_PREFERRED", dimensions: ["RELATIONAL", "COMMERCIAL", "TRUTH"] }),
  p({ predicate: "ecosystem.systems_integrator", family: "ECOSYSTEM", label: "Systems integrator", meaning: "Systems integrator materially connected to the organisation's technology or transformation estate.", kind: "STATE", valueType: "ENTITY_REF", mutability: "DYNAMIC", refreshClass: "MEDIUM", evidenceExpectation: "INDEPENDENT_CORROBORATION_PREFERRED", dimensions: ["RELATIONAL", "TECHNOLOGICAL", "COMMERCIAL", "TRUTH"] }),
  p({ predicate: "ecosystem.regulator", family: "ECOSYSTEM", label: "Regulator", meaning: "Regulatory body materially governing the organisation or a material part of its activity.", kind: "STATE", valueType: "ENTITY_REF", mutability: "STABLE", refreshClass: "SLOW", evidenceExpectation: "AUTHORITATIVE_SOURCE_REQUIRED", dimensions: ["RELATIONAL", "STRATEGIC", "TRUTH"] }),
  p({ predicate: "ecosystem.logistics_provider", family: "ECOSYSTEM", label: "Logistics provider", meaning: "Third-party logistics provider materially used by the organisation.", kind: "STATE", valueType: "ENTITY_REF", mutability: "DYNAMIC", refreshClass: "MEDIUM", evidenceExpectation: "INDEPENDENT_CORROBORATION_PREFERRED", dimensions: ["RELATIONAL", "OPERATIONAL", "COMMERCIAL", "TRUTH"] }),
  p({ predicate: "ecosystem.outsourcing_partner", family: "ECOSYSTEM", label: "Outsourcing partner", meaning: "External organisation performing a materially outsourced business capability.", kind: "STATE", valueType: "ENTITY_REF", mutability: "DYNAMIC", refreshClass: "MEDIUM", evidenceExpectation: "INDEPENDENT_CORROBORATION_PREFERRED", dimensions: ["RELATIONAL", "OPERATIONAL", "COMMERCIAL", "TRUTH"] }),

] as const);

export type GenesisT8CommercialGenomePredicate =
  (typeof GENESIS_T8_COMMERCIAL_GENOME_PREDICATES)[number]["predicate"];

export const GENESIS_T8_COMMERCIAL_GENOME_LAWS = Object.freeze([
  "ONTOLOGY_STORES_OBJECTIVE_COMMERCIAL_VOCABULARY_ONLY",
  "PREDICATE_IDS_ARE_STABLE_AND_VERSIONED",
  "PREDICATE_MEANING_MUST_NOT_DEPEND_ON_MARKETROUTE",
  "NO_PREDICATE_MAY_ENCODE_MATCH_STRENGTH_OR_OPPORTUNITY_PRIORITY",
  "NO_PREDICATE_MAY_ENCODE_AI_OPINION_AS_FACT",
  "UNKNOWN_IS_ABSENCE_NOT_FALSE",
  "TEMPORAL_FACTS_USE_VALIDITY_AND_HISTORY_NOT_OVERWRITE",
  "MUTABILITY_IS_INTRINSIC_REALITY_NOT_REFRESH_INTERVAL",
  "REFRESH_CLASS_IS_POLICY_HINT_NOT_TRUTH_DECAY",
  "EVIDENCE_EXPECTATION_DOES_NOT_OVERRIDE_TI_2_1_8",
  "EVERY_PREDICATE_PROJECTS_TO_AT_LEAST_ONE_NON_TRUTH_DIMENSION_AND_TRUTH",
  "TRUTH_DIMENSION_REMAINS_TI_2_1_8_OWNED",
  "APPLICATIONS_MAY_ALIAS_LABELS_BUT_NOT_REDEFINE_PREDICATE_MEANING",
  "NEW_PREDICATES_EXTEND_THE_ONTOLOGY_WITHOUT_REPURPOSING_EXISTING_IDS",
] as const);

const FORBIDDEN_PREDICATE_TERMS = Object.freeze([
  "match",
  "opportunity_score",
  "fit_score",
  "priority_score",
  "recommendation",
  "attractiveness",
] as const);

export function getGenomePredicateDefinition(
  predicate: string,
): GenesisT8GenomePredicateDefinition | undefined {
  return GENESIS_T8_COMMERCIAL_GENOME_PREDICATES.find((definition) => definition.predicate === predicate);
}

export function assertGenomePredicateDefinitionInvariant(
  definition: GenesisT8GenomePredicateDefinition,
): void {
  if (!/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/.test(definition.predicate)) {
    throw new Error("GENESIS_T8_GENOME_VIOLATION:PREDICATE_FORMAT");
  }
  if (!definition.label.trim() || !definition.meaning.trim()) {
    throw new Error("GENESIS_T8_GENOME_VIOLATION:DEFINITION_REQUIRED");
  }
  if (FORBIDDEN_PREDICATE_TERMS.some((term) => definition.predicate.includes(term))) {
    throw new Error("GENESIS_T8_GENOME_VIOLATION:DERIVED_REASONING_PREDICATE");
  }
  if (!definition.dimensions.length || !definition.dimensions.includes("TRUTH")) {
    throw new Error("GENESIS_T8_GENOME_VIOLATION:TRUTH_DIMENSION_REQUIRED");
  }
  if (!definition.dimensions.some((dimension) => dimension !== "TRUTH")) {
    throw new Error("GENESIS_T8_GENOME_VIOLATION:NON_TRUTH_DIMENSION_REQUIRED");
  }
  if (new Set(definition.dimensions).size !== definition.dimensions.length) {
    throw new Error("GENESIS_T8_GENOME_VIOLATION:DUPLICATE_DIMENSION");
  }
}

export function assertCommercialGenomeOntologyInvariant(): void {
  const predicates = new Set<string>();
  for (const definition of GENESIS_T8_COMMERCIAL_GENOME_PREDICATES) {
    assertGenomePredicateDefinitionInvariant(definition);
    if (predicates.has(definition.predicate)) {
      throw new Error("GENESIS_T8_GENOME_VIOLATION:DUPLICATE_PREDICATE");
    }
    predicates.add(definition.predicate);
  }

  for (const family of GENESIS_T8_GENOME_FAMILIES) {
    if (!GENESIS_T8_COMMERCIAL_GENOME_PREDICATES.some((definition) => definition.family === family)) {
      throw new Error(`GENESIS_T8_GENOME_VIOLATION:EMPTY_FAMILY:${family}`);
    }
  }
}
