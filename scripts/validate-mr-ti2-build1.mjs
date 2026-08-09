import fs from "node:fs";

const migrationPath = "supabase/migrations/0128_genesis_g82_mrti2_build1_foundation.sql";
const auditPath = "MR-TI-2-BUILD1-LEGACY-AUDIT.md";
const checks = [];
const add = (ok, label) => checks.push({ ok: Boolean(ok), label });

add(fs.existsSync(migrationPath), `${migrationPath} exists`);
add(fs.existsSync(auditPath), `${auditPath} exists`);

const sql = fs.readFileSync(migrationPath, "utf8");
const audit = fs.readFileSync(auditPath, "utf8");
const legacyEquation = fs.readFileSync("lib/genesis-g8/truth/equation.ts", "utf8");
const legacySnapshotMigration = fs.readFileSync("supabase/migrations/0109_genesis_g81_release3_intelligence_persistence_provenance.sql", "utf8");

for (const table of [
  "genesis_g8_truth_v2_claim_profiles",
  "genesis_g8_truth_v2_evidence_assessments",
  "genesis_g8_truth_v2_claim_relationships",
  "genesis_g8_truth_v2_snapshots",
]) add(sql.includes(`create table if not exists public.${table}`), `${table} is additive`);

add(!/\bdrop\s+(table|column|function|view|type)\b/i.test(sql), "migration contains no destructive DROP");
add(!/\balter\s+table\s+public\.genesis_g8_(intelligence_entities|intelligence_claims|intelligence_evidence|truth_snapshots|human_review_receipts)\s+(add|drop|rename|alter)/i.test(sql), "legacy G8 base tables are not structurally altered");
add(!/\bupdate\s+public\.genesis_g8_/i.test(sql), "migration does not rewrite existing G8 rows");
add(sql.includes("truth_index between 0 and 99.9"), "MR-TI-2 snapshot enforces 99.9 Truth cap");
add(sql.includes("FOUNDATIONAL") && sql.includes("COMMERCIAL") && sql.includes("SUPPORTING") && sql.includes("OPTIONAL"), "MR-TI-2 impact classes are explicit");
add(sql.includes("DEPENDS_ON") && sql.includes("CONTRADICTS"), "Matrix 2 initial relationship types are explicit");
add(sql.includes("derivative_depth") && sql.includes("source_lineage_key"), "evidence lineage foundation exists");
add(sql.includes("authority") && sql.includes("directness") && sql.includes("traceability"), "AI evidence primitive fields exist");
add(sql.includes("represented_confidence") && sql.includes("foundational_integrity") && sql.includes("max_contradiction_severity"), "MR-TI-2 state vector persistence exists");
add(sql.includes("grant select,insert on public.genesis_g8_truth_v2_snapshots to service_role"), "MR-TI-2 snapshots are append-only for service role");

add(legacyEquation.includes("Math.min(calculated01, criticalCeiling01)"), "legacy TI-1 equation remains intact for rollback in Build 1");
add(legacySnapshotMigration.includes("critical_claim_ceiling"), "legacy TI-1 snapshot contract remains intact");
add(audit.includes("RETIRE FROM ACTIVE PATH") && audit.includes("lib/genesis-g8/read-model.ts"), "legacy active-path audit records TI-1 runtime call site");

const failed = checks.filter((x) => !x.ok);
for (const check of checks) console.log(`${check.ok ? "PASS" : "FAIL"} ${check.label}`);
if (failed.length) process.exit(1);
console.log(`\nMR-TI-2 Build 1 validation passed (${checks.length}/${checks.length}).`);
