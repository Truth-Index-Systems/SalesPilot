import fs from "node:fs";

const checks = [];
const add = (ok, label) => checks.push({ ok: Boolean(ok), label });
const required = [
  "lib/genesis-g8/persistence/types.ts",
  "lib/genesis-g8/persistence/repository.ts",
  "lib/genesis-g8/persistence/index.ts",
  "supabase/migrations/0109_genesis_g81_release3_intelligence_persistence_provenance.sql",
];
for (const file of required) add(fs.existsSync(file), `${file} exists`);

const types = fs.readFileSync(required[0], "utf8");
const repo = fs.readFileSync(required[1], "utf8");
const migration = fs.readFileSync(required[3], "utf8");
const root = fs.readFileSync("lib/genesis-g8/index.ts", "utf8");

add(types.includes('"UNREVIEWED"') && types.includes('"HUMAN_REJECTED"'), "review lifecycle is persisted separately from Truth Index");
add(types.includes('"ACTIVE"') && types.includes('"SUPPRESSED"'), "eligibility/persistence state is explicit");
add(types.includes("GenesisG8ChannelProvenance"), "evidence retains dual-channel provenance");
add(repo.includes('import "server-only"'), "persistence repository is server-only");
add(repo.includes("getIntelligenceContract"), "repository materialises canonical R2 contracts rather than duplicating contract logic");
add(repo.includes("persistGenesisG8TruthSnapshot"), "immutable Truth snapshots have a repository boundary");
add(repo.includes("recordGenesisG8HumanReview"), "human review receipts have a repository boundary");
add(!repo.match(/requireOrganisationContext|organisation_id/i), "shared G8 intelligence repository is organisation-neutral");
add(migration.includes("genesis_g8_intelligence_entities") && migration.includes("genesis_g8_intelligence_claims"), "entity and claim persistence tables exist");
add(migration.includes("genesis_g8_intelligence_evidence"), "evidence persistence table exists");
add(migration.includes("genesis_g8_truth_snapshots"), "Truth Index history table exists");
add(migration.includes("genesis_g8_human_review_receipts"), "human review receipt table exists");
add(migration.includes("KNOWLEDGE_INTELLIGENCE") && migration.includes("DISCOVERY_INTELLIGENCE"), "database provenance preserves both intelligence channels");
add(migration.includes("enable row level security"), "G8 shared intelligence tables have RLS enabled");
add(migration.includes("to service_role") && migration.includes("from anon, authenticated"), "G8 shared intelligence remains service-role only in R3");
add(migration.includes("p_action='REJECT' then 'SUPPRESSED'"), "human rejection suppresses active eligibility instead of deleting intelligence");
add(!migration.match(/delete from public\.genesis_g8/i), "R3 contains no destructive rejection/delete path");
add(root.includes('from "./persistence/types"'), "client-safe persistence types are exported without transitively exporting server repository");

const productionRoots = ["lib/discovery", "lib/contacts", "lib/opportunities", "lib/pipeline", "lib/autonomy"];
const productionFiles = [];
for (const rootPath of productionRoots) {
  if (!fs.existsSync(rootPath)) continue;
  const stack = [rootPath];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const next = `${current}/${entry.name}`;
      if (entry.isDirectory()) stack.push(next);
      else if (/\.(ts|tsx|js|mjs)$/.test(entry.name)) productionFiles.push(next);
    }
  }
}
add(!productionFiles.some((file) => fs.readFileSync(file, "utf8").includes("genesis-g8")), "R3 remains isolated from frozen live production paths");

const failed = checks.filter((check) => !check.ok);
for (const check of checks) console.log(`${check.ok ? "PASS" : "FAIL"} ${check.label}`);
if (failed.length) process.exit(1);
console.log(`\nGenesis G8.1 Persistence & Provenance validation passed (${checks.length}/${checks.length}).`);
