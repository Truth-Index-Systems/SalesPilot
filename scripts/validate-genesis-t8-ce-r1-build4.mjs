import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const ontologyPath = path.join(root, "lib/genesis-t8/commercial-genome-ontology.ts");
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
const index = fs.readFileSync(indexPath, "utf8");
const constitution = fs.readFileSync(constitutionPath, "utf8");
const token = fs.readFileSync(tokenPath, "utf8");
const graph = fs.readFileSync(graphPath, "utf8");

check(ontology.includes('GENESIS_T8_COMMERCIAL_GENOME_VERSION = "1.0.0"'), "ontology version fenced");
check(ontology.includes('GENESIS_T8_CE_COMMERCIAL_GENOME_BUILD = "BUILD4"'), "build id unique");
check(index.includes('export * from "./commercial-genome-ontology"'), "ontology exported");
check(ontology.includes('"CORPORATE_IDENTITY"') && ontology.includes('"ECOSYSTEM"'), "family bounds present");
check((ontology.match(/family: "/g) || []).length >= 60, "substantial canonical predicate catalogue");
check(ontology.includes('predicate: "identity.legal_name"'), "identity predicate present");
check(ontology.includes('predicate: "commercial.industry"'), "industry predicate present");
check(ontology.includes('predicate: "operations.has_warehouse"'), "operations predicate present");
check(ontology.includes('predicate: "market.customer_type"'), "market predicate present");
check(ontology.includes('predicate: "buying.procurement_model"'), "buying predicate present");
check(ontology.includes('predicate: "technology.erp"'), "technology predicate present");
check(ontology.includes('predicate: "financial.revenue"'), "financial predicate present");
check(ontology.includes('predicate: "strategy.priority"'), "strategy predicate present");
check(ontology.includes('predicate: "risk.regulatory_regime"'), "risk predicate present");
check(ontology.includes('predicate: "signal.hiring"'), "dynamic signal predicate present");
check(ontology.includes('predicate: "ecosystem.supplier"'), "ecosystem predicate present");
check(ontology.includes('UNKNOWN_IS_ABSENCE_NOT_FALSE'), "unknown is not false");
check(ontology.includes('NO_PREDICATE_MAY_ENCODE_MATCH_STRENGTH_OR_OPPORTUNITY_PRIORITY'), "reasoning excluded from ontology");
check(ontology.includes('EVIDENCE_EXPECTATION_DOES_NOT_OVERRIDE_TI_2_1_8'), "TI authority preserved");
check(ontology.includes('TRUTH_DIMENSION_REMAINS_TI_2_1_8_OWNED'), "truth dimension ownership preserved");
check(ontology.includes('PREDICATE_IDS_ARE_STABLE_AND_VERSIONED'), "stable predicate ids required");
check(ontology.includes('NEW_PREDICATES_EXTEND_THE_ONTOLOGY_WITHOUT_REPURPOSING_EXISTING_IDS'), "ontology extension invariant");
check(ontology.includes('GenesisT8RefreshClass'), "refresh classes formalised");
check(ontology.includes('GenesisT8EvidenceExpectation'), "evidence expectations formalised");
check(ontology.includes('GenesisT8TokenMutability'), "token mutability reused");
check(ontology.includes('GenesisT8CommercialDimension'), "9D projection vocabulary reused");
check(ontology.includes('assertGenomePredicateDefinitionInvariant'), "predicate invariant implemented");
check(ontology.includes('assertCommercialGenomeOntologyInvariant'), "ontology invariant implemented");
check(ontology.includes('DUPLICATE_PREDICATE'), "duplicate predicate guard present");
check(ontology.includes('EMPTY_FAMILY'), "empty family guard present");
check(ontology.includes('TRUTH_DIMENSION_REQUIRED'), "truth projection requirement present");
check(ontology.includes('NON_TRUTH_DIMENSION_REQUIRED'), "non-truth projection requirement present");
check(!ontology.includes('marketroute.'), "ontology remains application-independent");
check(!ontology.includes('matchStrength') && !ontology.includes('opportunityScore'), "no derived score fields introduced");
check(constitution.includes('TRUTH_QUALIFIED_KNOWLEDGE'), "Build 1 constitution retained");
check(token.includes('TI_2_1_8_IS_SOLE_TRUTH_QUALIFIER'), "Build 2 TI boundary retained");
check(graph.includes('EXACTLY_NINE_CANONICAL_DIMENSIONS'), "Build 3 nine dimensions retained");
check(graph.includes('TI_2_1_8_ALONE_OWNS_TRUTH_DIMENSION_OUTPUTS'), "Build 3 truth ownership retained");

console.log(`\nGenesis T8 CE-R1 Build 4: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
