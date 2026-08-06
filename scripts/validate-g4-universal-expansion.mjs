import fs from "node:fs";

const migration = fs.readFileSync("supabase/migrations/0056_genesis_g4_universal_company_discovery_expansion.sql", "utf8");
const priorMigration = fs.readFileSync("supabase/migrations/0055_genesis_g4_company_discovery_minimum_result_expansion.sql", "utf8");
const service = fs.readFileSync("features/discovery/company-discovery.service.ts", "utf8");

const checks = [
  [migration.includes("universalExpansionPolicy"), "universal policy marker persisted"],
  [migration.includes("Deliberately no recency"), "historical active campaigns covered"],
  [!migration.includes("now()-interval '24 hours'"), "no first-day or recent-only restriction"],
  [migration.includes("coalesce(s.expansion_pass_count, 0) < coalesce(s.max_expansion_passes, 4)"), "pass cap preserved"],
  [migration.includes("c.status not in ('PAUSED', 'CANCELLED', 'ARCHIVED')"), "inactive campaigns protected"],
  [priorMigration.includes("if v_total < v_target and v_next_pass < v_max_passes then"), "every finalised pass uses minimum-result gate"],
  [service.includes("const searchPass = expansionPassCount + 1"), "every claimed cycle chooses a pass"],
  [service.includes("minimumSupportedCompanies"), "worker receives universal target"],
];

for (const [ok, label] of checks) {
  if (!ok) throw new Error(`Universal expansion validation failed: ${label}`);
}
console.log("G4 universal Company Discovery expansion validation passed");
