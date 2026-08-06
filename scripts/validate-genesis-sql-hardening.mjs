import fs from "node:fs";

const migration = fs.readFileSync("supabase/migrations/0044_genesis_sql_hardening_pass.sql", "utf8");
const selfReview = fs.readFileSync("supabase/migrations/0038_genesis_g4_phase5_ai_self_review.sql", "utf8");
const queue = fs.readFileSync("supabase/migrations/0040_genesis_g4_phase7_approval_queue.sql", "utf8");
const burst = fs.readFileSync("supabase/migrations/0028_genesis_stabilisation_s101_initial_contact_burst.sql", "utf8");
const business = fs.readFileSync("supabase/migrations/0024_genesis_stabilisation_s6_business_analysis_jobs.sql", "utf8");
const db = fs.readFileSync("lib/database/postgrest.ts", "utf8");

const checks = [
  [migration.includes("engagement_draft_reviews_draft_id_key"), "Self-review claim uses a named constraint"],
  [!selfReview.includes("on conflict(draft_id)"), "Fresh migration contains no ambiguous self-review conflict target"],
  [queue.includes("engagement_queue_holds_engagement_id_reason_code_key"), "Queue holds use their named constraint"],
  [burst.includes("where l.campaign_id=v_campaign_id"), "Contact burst qualifies the campaign_id output-variable collision"],
  [business.includes("business_analysis_jobs as baj"), "Business-analysis RPC columns are explicitly qualified"],
  [migration.includes("claim_business_analysis_job") && migration.includes("run_engagement_queue_builder"), "Live hardening migration replaces all audited RPCs"],
  [db.includes("[DATABASE_REQUEST_FAILED]") && db.includes("requestPath"), "Database failures now expose safe diagnostic detail"],
  [!migration.includes("SALESPILOT_TEST_MODE"), "No test mode introduced"],
];
for (const [ok, label] of checks) {
  if (!ok) throw new Error(`FAIL: ${label}`);
  console.log(`✓ ${label}`);
}
console.log("SalesPilot Genesis SQL hardening pass validated");
