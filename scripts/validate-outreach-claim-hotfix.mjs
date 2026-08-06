import fs from "node:fs";

const migration = fs.readFileSync("supabase/migrations/0043_fix_outreach_generation_claim_ambiguity.sql", "utf8");
const original = fs.readFileSync("supabase/migrations/0037_genesis_g4_phase4_outreach_generation.sql", "utf8");
const checks = [
  [migration.includes("create or replace function public.claim_engagement_outreach_generation"), "claim function replaced"],
  [migration.includes("on conflict on constraint engagement_drafts_engagement_id_key do nothing"), "named constraint removes ambiguity"],
  [!migration.includes("on conflict(engagement_id)"), "ambiguous target absent from hotfix"],
  [original.includes("on conflict on constraint engagement_drafts_engagement_id_key do nothing"), "fresh migration corrected"],
  [migration.includes("grant execute on function public.claim_engagement_outreach_generation(uuid) to service_role"), "service role grant preserved"],
];
for (const [ok, label] of checks) {
  if (!ok) throw new Error(`FAILED: ${label}`);
  console.log(`✓ ${label}`);
}
console.log("SalesPilot Outreach Generation claim hotfix passed");
