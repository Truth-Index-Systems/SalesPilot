import fs from "node:fs";

const checks = [
  ["lib/pipeline/scheduler.ts", "planContactDiscoveryDispatch"],
  ["lib/pipeline/scheduler.ts", "Promise.all"],
  ["features/contacts/contact-discovery.service.ts", "freshOnly"],
  ["components/ai-governance-controls.tsx", "Initial contact research burst"],
  ["supabase/migrations/0028_genesis_stabilisation_s101_initial_contact_burst.sql", "initial_contact_burst_completed_at"],
  ["supabase/migrations/0028_genesis_stabilisation_s101_initial_contact_burst.sql", "p_fresh_only"],
  ["supabase/migrations/0028_genesis_stabilisation_s101_initial_contact_burst.sql", "BUDGET_FALLBACK"],
];
for (const [file, needle] of checks) {
  const text = fs.readFileSync(file, "utf8");
  if (!text.includes(needle)) throw new Error(`${file} is missing ${needle}`);
}
console.log("Genesis Stabilisation S10.1 initial contact burst contract passed.");
