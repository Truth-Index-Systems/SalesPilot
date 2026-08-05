import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const requiredFiles = [
  "docs/genesis-stabilisation/current-orchestration-map.md",
  "docs/genesis-stabilisation/state-machines.md",
  "lib/pipeline/job-state.ts",
  "lib/pipeline/campaign-state.ts",
];

for (const file of requiredFiles) {
  if (!fs.existsSync(path.join(root, file))) throw new Error(`Missing ${file}`);
}

const jobState = read("lib/pipeline/job-state.ts");
for (const state of ["QUEUED", "RUNNING", "COMPLETED", "NO_RESULTS", "EXHAUSTED", "PAUSED", "CANCELLED", "FAILED_RETRYABLE", "FAILED_TERMINAL"]) {
  if (!jobState.includes(`\"${state}\"`)) throw new Error(`Missing job state ${state}`);
}
if (!jobState.includes("INVALID_PIPELINE_JOB_TRANSITION")) throw new Error("Transition guard missing");

const campaignState = read("lib/pipeline/campaign-state.ts");
for (const stage of ["BUSINESS_ANALYSIS", "COMPANY_DISCOVERY", "CONTACT_DISCOVERY", "OUTREACH_READY", "OPPORTUNITIES"]) {
  if (!campaignState.includes(`\"${stage}\"`)) throw new Error(`Missing campaign stage ${stage}`);
}

const audit = read("docs/genesis-stabilisation/current-orchestration-map.md");
for (const finding of ["ensure_active_company_review_queues", "companies_keep_review_queue_healthy", "companies_queue_contact_discovery", "domain_outbox_queue_company_discovery"]) {
  if (!audit.includes(finding)) throw new Error(`Audit does not identify ${finding}`);
}

console.log("Genesis stabilisation S0/S1 contract validation passed.");
