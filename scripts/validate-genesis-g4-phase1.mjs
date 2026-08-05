import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const requiredFiles = [
  "lib/engagement/types.ts",
  "lib/engagement/validators.ts",
  "lib/engagement/mapper.ts",
  "lib/engagement/repository.ts",
  "lib/engagement/service.ts",
  "supabase/migrations/0033_genesis_g4_phase1_engagement_domain.sql",
];
for (const file of requiredFiles) {
  if (!fs.existsSync(path.join(root, file))) throw new Error(`Missing G4 Phase 1 file: ${file}`);
}

const migration = read("supabase/migrations/0033_genesis_g4_phase1_engagement_domain.sql");
const repository = read("lib/engagement/repository.ts");
const service = read("lib/engagement/service.ts");
const scheduler = read("lib/pipeline/scheduler.ts");
const page = read("app/replies/page.tsx");

const expectations = [
  [migration.includes("engagement_generation_history"), "generation history table"],
  [migration.includes("engagement_prompt_versions"), "prompt versions table"],
  [migration.includes("engagement_review_history"), "review history table"],
  [migration.includes("EngagementCreated"), "EngagementCreated outbox event"],
  [migration.includes("ENGAGEMENT_CREATED"), "customer timeline event"],
  [migration.includes("unique (organisation_id,campaign_id,opportunity_id)") || read("supabase/migrations/0032_genesis_g35_phase5_engagement_bridge.sql").includes("unique (organisation_id,campaign_id,opportunity_id)"), "idempotency constraint"],
  [repository.includes("getEngagementByOpportunity"), "opportunity lookup"],
  [repository.includes("listCampaignEngagements"), "campaign listing"],
  [repository.includes("changeEngagementStatus"), "status transition repository"],
  [service.includes("EngagementUpdateSchema.parse"), "service validation"],
  [scheduler.includes("syncOpportunityEngagementBridge(runId)"), "single scheduler ownership"],
  [page.includes("No outreach is generated or sent"), "Phase 1 UI boundary"],
  [!migration.match(/openai|responses api|send email/i), "no AI or sending implementation"],
];
for (const [ok, label] of expectations) {
  if (!ok) throw new Error(`G4 Phase 1 validation failed: ${label}`);
}
console.log("Genesis G4 Phase 1 engagement domain validation passed.");
