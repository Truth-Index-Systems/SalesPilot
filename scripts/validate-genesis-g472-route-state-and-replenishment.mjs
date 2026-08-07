import fs from 'node:fs';
const migration=fs.readFileSync(new URL('../supabase/migrations/0067_genesis_g472_route_state_and_company_replenishment_freeze.sql',import.meta.url),'utf8');
const checks=[
  ['route stage constraint replaced',migration.includes('drop constraint if exists contact_discovery_sessions_stage_check')&&migration.includes("'EXPANDING','COMPLETE'" )],
  ['readiness expansion state supported',migration.includes("stage=case when coalesce(route_expansion_pass,0)>0 then 'EXPANDING' else 'PREPARING' end")],
  ['schema-contract failures recovered',migration.includes("job_state='FAILED_RETRYABLE'")&&migration.includes('contact_discovery_sessions_stage_check')],
  ['company discovery waits for cleared review batch',migration.includes('if v_pending_companies=0')&&!migration.includes('if v_pending_companies<v_queue_floor')],
  ['company top-up still requires completed session',migration.includes("and v_session.status='COMPLETED'" )],
  ['company top-up still respects cooldown',migration.includes('v_session.top_up_not_before is null or v_session.top_up_not_before<=now()')],
  ['route/company work remains scheduler-owned',migration.includes('create or replace function public.prepare_pipeline_work')],
  ['restart semantics auditable',migration.includes("'restartTrigger','REVIEW_BATCH_CLEARED'")],
];
let failed=0;
for(const [name,ok] of checks){console.log(`${ok?'PASS':'FAIL'} ${name}`);if(!ok)failed++;}
if(failed) process.exit(1);
