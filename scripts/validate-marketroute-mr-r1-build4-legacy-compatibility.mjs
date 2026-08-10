import fs from "node:fs";

const checks = [];
const check = (name, ok) => { checks.push([name, Boolean(ok)]); };
const projection = fs.readFileSync("lib/integrations/genesis-t8/legacy-seller-projection.ts", "utf8");
const repo = fs.readFileSync("lib/campaigns/repository.ts", "utf8");
const migration = fs.readFileSync("supabase/migrations/0139_marketroute_mr_r1_build4_genesis_legacy_compatibility.sql", "utf8");
const build3 = fs.readFileSync("lib/integrations/genesis-t8/genesis-seller-context.ts", "utf8");

check("projection derives business identity from Genesis Business DNA", projection.includes("businessName: dna.company.name") && projection.includes("businessSummary: dna.company.summary"));
check("projection derives ICP without AI reinterpretation", projection.includes("icp: dna.idealCustomers") && !projection.includes("openai"));
check("projection derives industries, buyer roles and pains", projection.includes("industries: unique") && projection.includes("buyerRoles: unique") && projection.includes("painPoints: unique"));
check("campaign repository loads immutable Genesis seller context", repo.includes("loadGenesisSellerContext(id, context.organisationId)") && repo.includes("projectLegacySellerFields(genesisSellerContext)"));
check("campaign repository uses row seller fields only inside explicit historical fallback", repo.includes("GENESIS_SELLER_CONTEXT_NOT_FOUND") && repo.includes("businessName: row.business_name ?? null") && repo.includes("Execution stages remain strict"));
check("campaign execution strategy remains separate", repo.includes("buyerRoles: row.buyer_roles") && repo.includes("messageAngle: row.message_angle") && repo.includes("why: row.why"));
check("database compatibility view prefers Genesis seller context", migration.includes("campaign_genesis_t8_seller_contexts") && migration.includes("sellerUnderstanding,legacyBusinessDna,company,name"));
check("historical fallback is explicit and limited", migration.includes("bp.company_name") && migration.includes("historical fallback only"));
check("campaign_detail does not expose new Build 4 projection columns", !migration.includes("as genesis_legacy_icp") && !migration.includes("as genesis_legacy_industries") && !migration.includes("as genesis_legacy_pain_points") && !migration.includes("as genesis_legacy_buyer_roles") && !migration.includes("as genesis_seller_source_fingerprint"));
check("campaign_detail preserves legacy tail column ordering", migration.indexOf("as business_name") < migration.indexOf("as business_summary") && migration.indexOf("as business_summary") < migration.indexOf("as website_url") && migration.indexOf("as website_url") < migration.indexOf("as timeline"));
check("rich compatibility projections remain in application layer", projection.includes("icp: dna.idealCustomers") && projection.includes("geographies: unique") && projection.includes("unknowns:"));
check("Build 3 immutable fingerprint boundary remains present", build3.includes("GENESIS_SELLER_CONTEXT_FINGERPRINT_MISMATCH") && build3.includes("deepFreeze"));

const failed = checks.filter(([, ok]) => !ok);
for (const [name, ok] of checks) console.log(`${ok ? "PASS" : "FAIL"} ${name}`);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
if (failed.length) process.exit(1);
