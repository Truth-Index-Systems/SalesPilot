import fs from "node:fs";
const required = [
  "app/internal/autonomy/page.tsx",
  "components/autonomy-health-refresh.tsx",
  "lib/pipeline/diagnostics.ts",
  "supabase/migrations/0025_genesis_stabilisation_s7_diagnostics.sql",
  "docs/genesis-stabilisation/s7-diagnostics-worker-health.md",
];
for (const file of required) if (!fs.existsSync(new URL(`../${file}`, import.meta.url))) throw new Error(`Missing ${file}`);
const page = fs.readFileSync(new URL("../app/internal/autonomy/page.tsx", import.meta.url), "utf8");
for (const token of ["requireOrganisationContext", "OWNER", "ADMIN", "AutonomyHealthRefresh", "Expired leases", "Retry queue"]) if (!page.includes(token)) throw new Error(`Missing S7 page contract: ${token}`);
const migration = fs.readFileSync(new URL("../supabase/migrations/0025_genesis_stabilisation_s7_diagnostics.sql", import.meta.url), "utf8");
for (const token of ["pipeline_job_diagnostics", "pipeline_scheduler_health", "pipeline_diagnostic_events", "security_invoker=true"]) if (!migration.includes(token)) throw new Error(`Missing S7 migration contract: ${token}`);
console.log("Genesis Stabilisation S7 diagnostics contract passed.");
