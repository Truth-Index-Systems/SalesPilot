import fs from "node:fs";

const required = [
  "lib/engagement/outreach-generation-schema.ts",
  "lib/engagement/outreach-generation-openai.ts",
  "lib/engagement/outreach-generation.ts",
  "supabase/migrations/0037_genesis_g4_phase4_outreach_generation.sql",
];
for (const file of required) if (!fs.existsSync(file)) throw new Error(`Missing ${file}`);

const scheduler = fs.readFileSync("lib/pipeline/scheduler.ts", "utf8");
const worker = fs.readFileSync("lib/engagement/outreach-generation.ts", "utf8");
const openai = fs.readFileSync("lib/engagement/outreach-generation-openai.ts", "utf8");
const schema = fs.readFileSync("lib/engagement/outreach-generation-schema.ts", "utf8");
const migration = fs.readFileSync("supabase/migrations/0037_genesis_g4_phase4_outreach_generation.sql", "utf8");
const domain = fs.readFileSync("lib/engagement/types.ts", "utf8");

const assertions = [
  [scheduler.includes("runNextOutreachGeneration(runId)"), "scheduler runs outreach generation"],
  [scheduler.indexOf("runNextCommercialReasoning(runId)") < scheduler.indexOf("runNextOutreachGeneration(runId)"), "reasoning precedes drafting"],
  [worker.includes("claim_engagement_outreach_generation"), "worker claims persisted draft jobs"],
  [worker.includes("complete_engagement_outreach_generation"), "worker completes persisted draft jobs"],
  [worker.includes("fail_engagement_outreach_generation"), "worker persists failure"],
  [openai.includes('jobType: "OUTREACH"'), "AI governance is used"],
  [openai.includes("json_schema"), "Responses API structured JSON is used"],
  [openai.includes("Never invent company facts"), "hallucination protection exists"],
  [schema.includes('engagement-outreach-generation/v1'), "versioned deterministic schema exists"],
  [migration.includes("create table if not exists public.engagement_drafts"), "draft repository exists"],
  [migration.includes("for update of d skip locked"), "concurrency-safe claiming exists"],
  [migration.includes("attempt_count<5"), "bounded retry exists"],
  [migration.includes("EngagementDraftGenerated"), "outbox event exists"],
  [migration.includes("engagement_generation_history"), "generation history is persisted"],
  [migration.includes("'DRAFT_READY'"), "draft-ready transition exists"],
  [domain.includes('"DRAFT_READY"'), "domain exposes draft-ready state"],
  [!openai.includes("web_search"), "no public web research is added in drafting"],
];
for (const [ok, message] of assertions) if (!ok) throw new Error(`G4 Phase 4 validation failed: ${message}`);
console.log("Genesis G4 Phase 4 passed");
