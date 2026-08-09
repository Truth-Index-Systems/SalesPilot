import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const ontologyPath = path.join(root, "lib/genesis-t8/commercial-genome-ontology.ts");
const completenessPath = path.join(root, "lib/genesis-t8/commercial-genome-completeness.ts");
const indexPath = path.join(root, "lib/genesis-t8/index.ts");
const constitutionPath = path.join(root, "lib/genesis-t8/constitution.ts");
const tokenPath = path.join(root, "lib/genesis-t8/token-theory.ts");
const graphPath = path.join(root, "lib/genesis-t8/commercial-graph-9d.ts");

let pass = 0;
let fail = 0;
const check = (condition, label) => {
  if (condition) { pass++; console.log(`PASS ${label}`); }
  else { fail++; console.error(`FAIL ${label}`); }
};

const ontology = fs.readFileSync(ontologyPath, "utf8");
const completeness = fs.readFileSync(completenessPath, "utf8");
const index = fs.readFileSync(indexPath, "utf8");
const constitution = fs.readFileSync(constitutionPath, "utf8");
const token = fs.readFileSync(tokenPath, "utf8");
const graph = fs.readFileSync(graphPath, "utf8");

const predicates = [...ontology.matchAll(/predicate: "([^"]+)"/g)].map((m) => m[1]);
const uniquePredicates = new Set(predicates);
const requiredByFixtures = [...completeness.matchAll(/"([a-z][a-z0-9_]*\.[a-z][a-z0-9_.]*)"/g)]
  .map((m) => m[1])
  .filter((value) => value.includes("."));
const missingFixturePredicates = [...new Set(requiredByFixtures.filter((predicate) => !uniquePredicates.has(predicate)))];

check(completeness.includes('GENESIS_T8_CE_GENOME_COMPLETENESS_BUILD = "BUILD5"'), "Build 5 id fenced");
check(completeness.includes('GENESIS_T8_COMMERCIAL_GENOME_COMPLETENESS_VERSION = "1.0.0"'), "completeness contract version fenced");
check(index.includes('export * from "./commercial-genome-completeness"'), "Build 5 completeness contract exported");
check(ontology.includes('"ORGANISATION"'), "organisation family added after adversarial sweep");
check(predicates.length >= 130, "ontology expanded materially after completeness attack");
check(predicates.length === uniquePredicates.size, "all predicate IDs remain unique");
check(missingFixturePredicates.length === 0, `all archetype/capability predicates exist${missingFixturePredicates.length ? `: ${missingFixturePredicates.join(",")}` : ""}`);

check(ontology.includes('predicate: "identity.legal_form"'), "legal structure gap closed");
check(ontology.includes('predicate: "identity.ownership_type"'), "ownership gap closed");
check(ontology.includes('predicate: "commercial.delivery_model"'), "commercial delivery gap closed");
check(ontology.includes('predicate: "commercial.minimum_contract_value"'), "minimum contract economics representable");
check(ontology.includes('predicate: "operations.facility_type"'), "facility-type gap closed");
check(ontology.includes('predicate: "operations.operating_scale"'), "operating-scale gap closed without score");
check(ontology.includes('predicate: "operations.inventory_complexity"'), "inventory-complexity fact representable");
check(ontology.includes('predicate: "market.customer_size_segment"'), "customer-size segment gap closed");
check(ontology.includes('predicate: "market.average_contract_value"'), "customer economics gap closed");
check(ontology.includes('predicate: "buying.budget_cycle"'), "budget-cycle gap closed");
check(ontology.includes('predicate: "buying.payment_terms"'), "payment-term constraint representable");
check(ontology.includes('predicate: "buying.vendor_onboarding_duration"'), "vendor onboarding constraint representable");
check(ontology.includes('predicate: "organisation.business_function"'), "business functions represented without contacts");
check(ontology.includes('predicate: "organisation.procurement_owner_function"'), "procurement function ownership represented");
check(ontology.includes('predicate: "organisation.technology_owner_function"'), "technology function ownership represented");
check(ontology.includes('predicate: "organisation.operations_owner_function"'), "operations function ownership represented");
check(ontology.includes('predicate: "technology.api_capability"'), "API compatibility surface represented");
check(ontology.includes('predicate: "technology.deployment_model"'), "deployment compatibility surface represented");
check(ontology.includes('predicate: "technology.data_integration_method"'), "integration compatibility surface represented");
check(ontology.includes('predicate: "financial.reporting_currency"'), "reporting currency represented");
check(ontology.includes('predicate: "financial.fiscal_year_end"'), "fiscal cycle represented");
check(ontology.includes('predicate: "risk.export_control_regime"'), "export-control constraints representable");
check(ontology.includes('predicate: "risk.insurance_requirement"'), "supplier insurance constraints representable");
check(ontology.includes('predicate: "signal.contract_award"'), "contract-award event represented");
check(ontology.includes('predicate: "signal.regulatory_change"'), "regulatory-change event represented");
check(ontology.includes('predicate: "ecosystem.systems_integrator"'), "systems-integrator ecosystem route represented");
check(ontology.includes('predicate: "ecosystem.regulator"'), "regulatory ecosystem relation represented");

const archetypeIds = [
  "ENTERPRISE_SAAS", "MANUFACTURER", "LOGISTICS_OPERATOR", "RETAIL_ECOMMERCE",
  "REGULATED_HEALTHCARE", "PUBLIC_SECTOR_BUYER", "PROFESSIONAL_SERVICES",
  "FIELD_SERVICE_CONSTRUCTION", "REGULATED_FINTECH", "VENTURE_STARTUP",
  "WHOLESALE_DISTRIBUTOR", "MULTINATIONAL_ENTERPRISE",
];
for (const id of archetypeIds) check(completeness.includes(`id: "${id}"`), `archetype ${id} covered`);

const capabilityIds = [
  "GEOGRAPHIC_SERVICEABILITY", "SCALE_COMPATIBILITY", "TECHNICAL_COMPATIBILITY",
  "PROCUREMENT_COMPATIBILITY", "ECONOMIC_COMPATIBILITY", "ORGANISATIONAL_OWNERSHIP",
  "OPERATING_NEED_CONTEXT", "REGULATORY_COMPATIBILITY", "COMMERCIAL_DELIVERY_COMPATIBILITY",
  "MOMENTUM_CONTEXT", "ECOSYSTEM_CONTEXT",
];
for (const id of capabilityIds) check(completeness.includes(`id: "${id}"`), `decision prerequisite ${id} covered`);

check(completeness.includes("COMPLETENESS_MEANS_REPRESENTABILITY_NOT_EVIDENCE_AVAILABILITY"), "completeness separated from evidence availability");
check(completeness.includes("ARCHETYPE_TESTS_NEVER_CLASSIFY_REAL_COMPANIES"), "synthetic archetypes cannot classify real companies");
check(completeness.includes("NO_ARCHETYPE_MAY_REQUIRE_A_DERIVED_FIT_OR_PRIORITY_SCORE"), "derived reasoning excluded from completeness fixtures");
check(completeness.includes("ORGANISATION_STRUCTURE_STOPS_AT_FUNCTION_OWNERSHIP_BEFORE_CONTACT_REASONING"), "contact-engine boundary preserved");
check(completeness.includes("PASSING_BUILD5_DOES_NOT_FREEZE_THE_ONTOLOGY"), "Build 5 explicitly remains pre-freeze");
check(completeness.includes("auditCommercialGenomeCompleteness"), "deterministic completeness audit implemented");
check(completeness.includes("assertCommercialGenomeCompletenessInvariant"), "completeness invariant implemented");
check(!ontology.includes("marketroute."), "ontology remains application-independent");
check(!predicates.some((predicate) => /match|opportunity|priority_score|fit_score|recommendation|attractiveness/.test(predicate)), "no derived score predicates introduced");
check(constitution.includes("TRUTH_QUALIFIED_KNOWLEDGE"), "Build 1 constitution retained");
check(token.includes("TI_2_1_8_IS_SOLE_TRUTH_QUALIFIER"), "Build 2 TI boundary retained");
check(graph.includes("EXACTLY_NINE_CANONICAL_DIMENSIONS"), "Build 3 nine-dimensional invariant retained");
check(ontology.includes("TRUTH_DIMENSION_REMAINS_TI_2_1_8_OWNED"), "Build 4 truth dimension ownership retained");

console.log(`\nGenesis T8 CE-R1 Build 5: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
