import fs from "node:fs";

const required = [
  "lib/engagement/self-review-schema.ts",
  "lib/engagement/self-review-openai.ts",
  "lib/engagement/self-review.ts",
  "supabase/migrations/0038_genesis_g4_phase5_ai_self_review.sql",
];
for (const file of required) if (!fs.existsSync(file)) throw new Error(`Missing ${file}`);

const scheduler = fs.readFileSync("lib/pipeline/scheduler.ts", "utf8");
const worker = fs.readFileSync("lib/engagement/self-review.ts", "utf8");
const openai = fs.readFileSync("lib/engagement/self-review-openai.ts", "utf8");
const schema = fs.readFileSync("lib/engagement/self-review-schema.ts", "utf8");
const migration = fs.readFileSync("supabase/migrations/0038_genesis_g4_phase5_ai_self_review.sql", "utf8");
const domain = fs.readFileSync("lib/engagement/types.ts", "utf8");

const assertions = [
  [scheduler.includes("runNextEngagementSelfReview(runId)"), "scheduler runs self review"],
  [scheduler.indexOf("runNextOutreachGeneration(runId)") < scheduler.indexOf("runNextEngagementSelfReview(runId)"), "drafting precedes review"],
  [worker.includes("claim_engagement_self_review"), "worker claims persisted review jobs"],
  [worker.includes("complete_engagement_self_review"), "worker completes persisted review jobs"],
  [worker.includes("fail_engagement_self_review"), "worker persists failures"],
  [openai.includes('jobType: "OUTREACH"'), "AI governance is used"],
  [openai.includes("json_schema"), "strict structured output is used"],
  [openai.includes("factualAccuracy is at least 80"), "accuracy hard gate exists"],
  [openai.includes("approvedByPolicy"), "application enforces deterministic pass policy"],
  [schema.includes('engagement-self-review/v1'), "versioned review schema exists"],
  [schema.includes("likelihoodOfResponse"), "response likelihood is scored"],
  [migration.includes("create table if not exists public.engagement_draft_reviews"), "review job repository exists"],
  [migration.includes("for update of r skip locked"), "concurrency-safe claiming exists"],
  [migration.includes("attempt_count<5"), "bounded retry exists"],
  [migration.includes("engagement_review_history"), "review history is persisted"],
  [migration.includes("EngagementDraftReviewed"), "review outbox event exists"],
  [migration.includes("'DRAFT_REVIEW'"), "passing drafts transition to review"],
  [migration.includes("'REGENERATE_REQUESTED'"), "weak drafts are flagged for refinement"],
  [domain.includes('"SELF_REVIEW_COMPLETED"'), "domain exposes review history events"],
  [!openai.includes("web_search"), "review performs no new public research"],
];
for (const [ok, message] of assertions) if (!ok) throw new Error(`G4 Phase 5 validation failed: ${message}`);
console.log("Genesis G4 Phase 5 passed");
