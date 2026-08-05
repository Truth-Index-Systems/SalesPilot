import fs from "node:fs";
const p="supabase/migrations/0017_genesis_g3_company_topup_loop_guard.sql";
const s=fs.readFileSync(p,"utf8");
for (const token of [
  "top_up_not_before",
  "consecutive_empty_cycles",
  "cycle_baseline_company_count",
  "last_cycle_new_companies",
  "interval '30 minutes'",
  "interval '2 hours'",
  "interval '12 hours'",
  "DISCOVERY_TOP_UP_PAUSED",
  "create or replace function public.ensure_company_review_queue",
  "create or replace function public.finalize_company_discovery"
]) {
  if (!s.includes(token)) throw new Error(`Missing ${token}`);
}
console.log("G3 top-up loop guard contract passed");
