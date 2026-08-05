import fs from "node:fs";

const migration = fs.readFileSync("supabase/migrations/0022_genesis_stabilisation_s4_orchestration_consolidation.sql", "utf8");
const scheduler = fs.readFileSync("lib/pipeline/scheduler.ts", "utf8");
const route = fs.readFileSync("app/api/autonomy/pipeline/run/route.ts", "utf8");

const requiredDrops = [
  "domain_outbox_queue_company_discovery",
  "companies_queue_contact_discovery",
  "companies_keep_review_queue_healthy",
  "contacts_refresh_campaign_readiness",
  "contact_sessions_refresh_campaign_readiness",
  "ensure_active_company_review_queues",
  "ensure_company_review_queue(uuid,uuid)",
  "queue_contact_discovery_for_company(uuid,uuid,uuid)",
  "refresh_campaign_contact_readiness(uuid,uuid)",
];
for (const token of requiredDrops) {
  if (!migration.includes(token)) throw new Error(`S4 missing removal: ${token}`);
}

for (const token of [
  "create or replace function public.prepare_pipeline_work",
  "v_session.status='COMPLETED'",
  "v_session.top_up_not_before",
  "contactJobsCreated",
  "CONTACTS_READY_FOR_OUTREACH",
  "PIPELINE_SCHEDULER_LEASE_NOT_HELD",
]) {
  if (!migration.includes(token)) throw new Error(`S4 scheduler ownership missing: ${token}`);
}

if (migration.includes("perform public.ensure_company_review_queue")) {
  throw new Error("S4 prepare function still delegates top-up ownership");
}
if (!scheduler.includes("preparePipelineWork")) throw new Error("scheduler no longer prepares work");
if (!route.includes("runPipelineScheduler")) throw new Error("pipeline route no longer uses scheduler");

console.log("Genesis stabilisation S4 orchestration consolidation validation passed.");
