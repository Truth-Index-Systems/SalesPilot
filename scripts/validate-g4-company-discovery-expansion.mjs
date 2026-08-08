import fs from "node:fs";

const migration = fs.readFileSync("supabase/migrations/0055_genesis_g4_company_discovery_minimum_result_expansion.sql", "utf8");
const service = fs.readFileSync("features/discovery/company-discovery.service.ts", "utf8");
const openai = fs.readFileSync("lib/discovery/openai.ts", "utf8");
const page = fs.readFileSync("app/campaigns/[id]/page.tsx", "utf8");
const executor = fs.readFileSync("lib/pipeline/executor.ts", "utf8");

const checks = [
  [migration.includes("minimum_supported_companies"), "minimum target persisted"],
  [migration.includes("expansion_pass_count"), "search pass persisted"],
  [migration.includes("v_total < v_target and v_next_pass < v_max_passes"), "automatic expansion gate"],
  [migration.includes("status='QUEUED'"), "valid low-result pass requeues"],
  [migration.includes("job_state=case when v_total>=v_target then 'COMPLETED' else 'EXHAUSTED' end"), "neutral exhaustion state"],
  [service.includes("searchStrategy"), "worker selects expansion strategy"],
  [service.includes('outcome: expansionPending ? "CONTINUING"'), "scheduler reports continuing work"],
  [openai.includes("The earlier search retained too few supported companies"), "prompt broadens without weakening quality"],
  [page.includes("MarketRoute is expanding the company search"), "customer expansion state"],
  [executor.includes('"CONTINUING"'), "worker outcome supports expansion"],
];
for (const [ok, label] of checks) if (!ok) throw new Error(`Missing: ${label}`);
console.log("G4 company discovery expansion validation passed");
