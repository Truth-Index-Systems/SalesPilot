import fs from "node:fs";

const read = (p) => fs.readFileSync(p, "utf8");
let passed = 0;
function check(name, value) {
  if (!value) { console.error(`FAIL ${name}`); process.exitCode = 1; return; }
  passed += 1; console.log(`PASS ${name}`);
}
const contracts = read("lib/integrations/genesis-t8/seller-constraint-contracts.ts");
const context = read("lib/integrations/genesis-t8/genesis-seller-context.ts");
const launch = read("features/campaigns/campaign-launch.service.ts");
const company = read("features/discovery/company-discovery.service.ts");
const contact = read("features/contacts/contact-discovery.service.ts");
const discoveryAi = read("lib/discovery/openai.ts");
const contactAi = read("lib/contacts/openai.ts");
const migration = read("supabase/migrations/0140_marketroute_mr_r1_build5_constraint_extraction.sql");
const ceR2Constraints = read("lib/genesis-t8/mathematics/constraints.ts");

check("four Build 5 seller constraint classes", contracts.includes('"BOUNDARY"') && contracts.includes('"SUPPORTING"') && contracts.includes('"LIMITING"') && contracts.includes('"UNKNOWN"'));
check("unknown remains unresolved", contracts.includes('constraintClass: "UNKNOWN"') && contracts.includes('applicability: "UNRESOLVED"'));
check("ICP is limiting not boundary", contracts.includes('constraintClass: "LIMITING"') && contracts.includes('preferred customer industries') && !contracts.includes('constraintClass: "BOUNDARY",\n        applicability: "APPLICABLE",\n        scope: "TARGETING"'));
check("immutable persisted constraint table", migration.includes("campaign_genesis_t8_constraint_sets") && migration.includes("GENESIS_T8_CONSTRAINT_SET_IMMUTABILITY_VIOLATION"));
check("constraint set tied to seller fingerprint", migration.includes("seller_context_fingerprint") && migration.includes("GENESIS_T8_CONSTRAINT_SET_SOURCE_MISMATCH"));
check("new campaign persists constraint set", launch.includes("buildMarketRouteGenesisSellerConstraintSet") && launch.includes("persistMarketRouteGenesisSellerConstraintSet"));
check("historical campaigns deterministically materialise", context.includes("loadOrMaterialiseMarketRouteGenesisSellerConstraintSet"));
check("canonical seller context exposes constraints", context.includes("constraintSet: MarketRouteGenesisSellerConstraintSet"));
check("company discovery consumes stored constraints", company.includes("genesisConstraintContracts: sellerContext.constraintSet"));
check("route intelligence consumes stored constraints", contact.includes("genesisConstraintContracts:sellerContext.constraintSet"));
check("AI stages forbidden from reclassifying", discoveryAi.includes("Never reclassify or invent a seller constraint") && contactAi.includes("Never reclassify or invent seller constraints"));
check("frozen CE-R2 language still contains constitutional classes", ceR2Constraints.includes('"BOUNDARY"') && ceR2Constraints.includes('"CONTRADICTORY"'));
check("migration refreshes PostgREST", migration.includes("notify pgrst, 'reload schema'"));
check("dedicated constraints API exists", fs.existsSync("app/api/genesis-t8/campaigns/[id]/constraints/route.ts"));

if (!process.exitCode) console.log(`MR-R1 Build 5 validation: ${passed}/14 passed`);
