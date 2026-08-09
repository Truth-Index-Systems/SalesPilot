import fs from "node:fs";
import path from "node:path";
const root=process.cwd();
const p=(x)=>fs.readFileSync(path.join(root,x),"utf8");
const m130=p("supabase/migrations/0130_genesis_g82_mrti2_build8_2_cold_start_bootstrap.sql");
const m131=p("supabase/migrations/0131_genesis_g82_mrti2_build8_2_1_industry_key_ambiguity_hotfix.sql");
const checks=[
 ["0130 ambiguity-safe conflict", m130.includes("on conflict on constraint genesis_g82_expansion_targets_industry_key_key do nothing")],
 ["0131 exists", m131.includes("create or replace function public.ensure_genesis_g82_expansion_backlog")],
 ["0131 ambiguity-safe conflict", m131.includes("on conflict on constraint genesis_g82_expansion_targets_industry_key_key do nothing")],
 ["0131 no unqualified industry conflict", !m131.includes("on conflict(industry_key)")],
 ["function still returns industry key", m131.includes("returns table(job_id uuid, industry_key text, industry_name text)")],
 ["canonical targets retained", m131.includes("('software','Software & SaaS'") && m131.includes("('construction','Construction & PropTech'")],
 ["exhaustion recovery retained", m131.includes("GENESIS_G82_EXPANSION_ATTEMPTS_EXHAUSTED")],
 ["service role grant retained", m131.includes("grant execute on function public.ensure_genesis_g82_expansion_backlog(integer) to service_role")],
];
let failed=0;
for(const [name,ok] of checks){console.log(`${ok?"PASS":"FAIL"} ${name}`);if(!ok) failed++;}
console.log(`${checks.length-failed}/${checks.length} checks passed`);
if(failed) process.exit(1);
