import { readFileSync } from "node:fs";

const migration = readFileSync("supabase/migrations/0011_genesis_g3_contact_foundation.sql", "utf8");
const schemas = readFileSync("lib/contacts/schemas.ts", "utf8");
const repository = readFileSync("lib/contacts/repository.ts", "utf8");
const events = readFileSync("lib/events/domain-events.ts", "utf8");

const requiredMigrationTokens = [
  "contact_discovery_sessions",
  "create table if not exists public.contacts",
  "contact_versions",
  "contact_evidence",
  "contact_review_events",
  "enable row level security",
  "contact_overview",
  "contact_detail",
  "enqueue_contact_domain_event",
  "unique (campaign_id,company_id,normalised_name,normalised_role)",
];

const requiredSchemaTokens = [
  "ContactReviewStatusSchema",
  '"HOLD"',
  "ContactConfidenceSchema",
  "ContactEvidenceSchema",
  'z.literal("contact-discovery/v3")',
];

const requiredRepositoryTokens = [
  "listContacts",
  "getContact",
  "getContactDiscoveryForCompany",
  "listContactDiscoveryForCampaign",
  "contactCounts",
];

const requiredEventTokens = [
  '"ContactDiscoveryQueued"',
  '"ContactsDiscovered"',
  '"ContactApproved"',
  '"ContactRejected"',
  '"ContactHeld"',
  '"ContactDiscoveryCompleted"',
];

for (const token of requiredMigrationTokens) {
  if (!migration.includes(token)) throw new Error(`Missing migration contract: ${token}`);
}
for (const token of requiredSchemaTokens) {
  if (!schemas.includes(token)) throw new Error(`Missing schema contract: ${token}`);
}
for (const token of requiredRepositoryTokens) {
  if (!repository.includes(token)) throw new Error(`Missing repository contract: ${token}`);
}
for (const token of requiredEventTokens) {
  if (!events.includes(token)) throw new Error(`Missing event contract: ${token}`);
}

console.log("G3 Phase 1 contact foundation contract verified.");
