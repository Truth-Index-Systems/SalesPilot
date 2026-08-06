import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const required = [
  "lib/engagement/builder.ts",
  "supabase/migrations/0035_genesis_g4_phase2_engagement_builder.sql",
];
for (const file of required) {
  if (!fs.existsSync(path.join(root, file))) throw new Error(`Missing G4 Phase 2 file: ${file}`);
}

const builder = read("lib/engagement/builder.ts");
const scheduler = read("lib/pipeline/scheduler.ts");
const migration = read("supabase/migrations/0035_genesis_g4_phase2_engagement_builder.sql");
const bridge = read("supabase/migrations/0032_genesis_g35_phase5_engagement_bridge.sql");
const contactHotfix = read("supabase/migrations/0034_genesis_g3_contact_foundation_sync_hotfix.sql");

const expectations = [
  [builder.includes('"rpc/run_engagement_builder"'), "builder RPC"],
  [builder.includes("ENGAGEMENT_BUILDER_REQUIRES_SCHEDULER_RUN"), "scheduler ownership guard"],
  [scheduler.includes('import { buildEngagements } from "@/lib/engagement/builder"'), "scheduler builder integration"],
  [scheduler.includes("await buildEngagements(runId)"), "single scheduler execution"],
  [migration.includes("engagement_builder_runs"), "auditable builder runs"],
  [migration.includes("unique (scheduler_run_id)"), "one builder execution per scheduler run"],
  [migration.includes("pg_advisory_xact_lock"), "concurrent ownership protection"],
  [migration.includes("sync_opportunity_engagement_bridge"), "frozen bridge reuse"],
  [migration.includes("status='FAILED'"), "failure recording"],
  [bridge.includes("where o.status='APPROVED'"), "approved opportunity discovery"],
  [bridge.includes("unique (organisation_id,campaign_id,opportunity_id)"), "engagement idempotency"],
  [scheduler.includes("await syncContactDiscoveryFoundations(runId)"), "G3 contact foundation retained"],
  [contactHotfix.includes("sync_contact_discovery_foundations"), "G3 hotfix migration retained"],
  [!migration.match(/openai|responses api|draft generated|send email/i), "no AI generation or sending"],
];
for (const [ok,label] of expectations) {
  if (!ok) throw new Error(`G4 Phase 2 validation failed: ${label}`);
}
console.log("Genesis G4 Phase 2 Engagement Builder validation passed.");
