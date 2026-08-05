import fs from "node:fs";

const checks = [
  ["lib/pipeline/scheduler.ts", ["acquirePipelineSchedulerLease", "preparePipelineWork", "runNextCompanyDiscovery", "runNextContactDiscovery", "releasePipelineSchedulerLease"]],
  ["lib/pipeline/repository.ts", ["acquire_pipeline_scheduler_lease", "prepare_pipeline_work", "release_pipeline_scheduler_lease"]],
  ["app/api/autonomy/pipeline/run/route.ts", ["runPipelineScheduler", "SCHEDULER_ALREADY_RUNNING"]],
  ["supabase/migrations/0021_genesis_stabilisation_s2_single_scheduler.sql", ["pipeline_scheduler_lease", "pipeline_scheduler_runs", "acquire_pipeline_scheduler_lease", "prepare_pipeline_work", "release_pipeline_scheduler_lease"]],
  ["docs/genesis-stabilisation/s2-single-scheduler.md", ["Single Pipeline Scheduler", "Concurrent cron"]],
];

for (const [file, required] of checks) {
  if (!fs.existsSync(file)) throw new Error(`Missing ${file}`);
  const text = fs.readFileSync(file, "utf8");
  for (const token of required) {
    if (!text.includes(token)) throw new Error(`${file} missing ${token}`);
  }
}

const route = fs.readFileSync("app/api/autonomy/pipeline/run/route.ts", "utf8");
if (route.includes("ensure_active_company_review_queues")) {
  throw new Error("Pipeline route still performs the legacy broad queue sweep");
}
if (route.includes("Promise.all")) {
  throw new Error("Pipeline route still dispatches workers concurrently");
}

const scheduler = fs.readFileSync("lib/pipeline/scheduler.ts", "utf8");
const companyPosition = scheduler.indexOf("runNextCompanyDiscovery(context)");
const contactPosition = scheduler.indexOf("runNextContactDiscovery(context)");
if (companyPosition < 0 || contactPosition < 0 || companyPosition >= contactPosition) {
  throw new Error("Workers are not dispatched sequentially in the intended order");
}

console.log("Genesis stabilisation S2 validation passed.");
