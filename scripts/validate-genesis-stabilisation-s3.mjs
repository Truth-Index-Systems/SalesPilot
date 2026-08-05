import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const company = read("features/discovery/company-discovery.service.ts");
const contact = read("features/contacts/contact-discovery.service.ts");
const scheduler = read("lib/pipeline/scheduler.ts");
const executor = read("lib/pipeline/executor.ts");
const companyRoute = read("app/api/autonomy/company-discovery/run/route.ts");
const contactRoute = read("app/api/autonomy/contact-discovery/run/route.ts");
const vercel = JSON.parse(read("vercel.json"));

const forbidden = [
  "ensure_company_review_queue",
  "ensure_active_company_review_queues",
  "queue_contact_discovery_for_company",
  "prepare_pipeline_work",
  "CampaignContactsReadyForOutreach",
  "CONTACTS_READY_FOR_OUTREACH",
];

for (const token of forbidden) {
  if (company.includes(token) || contact.includes(token)) {
    throw new Error(`Worker contains forbidden orchestration token: ${token}`);
  }
}

if (!scheduler.includes("runNextCompanyDiscovery") || !scheduler.includes("runNextContactDiscovery")) {
  throw new Error("Scheduler does not own both worker dispatches");
}
if (!executor.includes("COMPLETED_NO_RESULTS") || !executor.includes("WorkerExecutionResult")) {
  throw new Error("Shared worker result contract missing");
}
if (!companyRoute.includes("PIPELINE_SCHEDULER_REQUIRED") || !contactRoute.includes("PIPELINE_SCHEDULER_REQUIRED")) {
  throw new Error("Standalone worker routes are not tombstoned");
}
const crons = vercel.crons ?? [];
if (crons.length !== 1 || crons[0]?.path !== "/api/autonomy/pipeline/run") {
  throw new Error("Only the pipeline scheduler may be configured as a cron");
}

console.log("Genesis Stabilisation S3 validation passed");
