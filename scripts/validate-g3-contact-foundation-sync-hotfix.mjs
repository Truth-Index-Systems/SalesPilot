import fs from "node:fs";

function read(path) {
  return fs.readFileSync(path, "utf8");
}

function requireText(content, text, message) {
  if (!content.includes(text)) throw new Error(message);
}

const migration = read("supabase/migrations/0034_genesis_g3_contact_foundation_sync_hotfix.sql");
const repository = read("lib/pipeline/repository.ts");
const scheduler = read("lib/pipeline/scheduler.ts");

requireText(migration, "sync_contact_discovery_foundations", "Missing Contact Foundation Sync RPC");
requireText(migration, "co.review_status='APPROVED'", "Sync must require approved companies");
requireText(migration, "on conflict (organisation_id,campaign_id,company_id) do nothing", "Sync must be idempotent");
requireText(migration, "ca.status not in ('PAUSED','FAILED','ARCHIVED')", "Sync must cover all live campaign states");
requireText(migration, "PIPELINE_SCHEDULER_LEASE_NOT_HELD", "Sync must remain scheduler-owned");
requireText(migration, "COMPANY_NO_LONGER_APPROVED", "Sync must cancel stale unclaimed work");
requireText(repository, "syncContactDiscoveryFoundations", "Missing repository adapter");
requireText(scheduler, "const contactFoundation = await syncContactDiscoveryFoundations(runId);", "Scheduler must sync foundations before contact dispatch");

const syncIndex = scheduler.indexOf("const contactFoundation = await syncContactDiscoveryFoundations(runId);");
const dispatchIndex = scheduler.indexOf("const contactPlan = await planContactDiscoveryDispatch(runId);");
if (syncIndex < 0 || dispatchIndex < 0 || syncIndex > dispatchIndex) {
  throw new Error("Contact Foundation Sync must execute before contact dispatch planning");
}

console.log("Genesis G3 Contact Foundation Sync hotfix passed");
