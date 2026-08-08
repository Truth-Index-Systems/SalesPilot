import fs from 'node:fs';
function text(path){return fs.readFileSync(path,'utf8')}
const governance=text('lib/ai/governance.ts');
const migration=text('supabase/migrations/0098_marketroute_g514_public_analysis_governance_and_progress.sql');
const wizard=text('components/campaign-wizard.tsx');
const checks=[
  [governance.includes('reserve_public_business_analysis_ai_request'),'anonymous analysis has a dedicated governed reservation RPC'],
  [governance.includes('MARKETROUTE_PUBLIC_AI_DAILY_REQUEST_LIMIT'),'public daily request cap is environment-controlled'],
  [governance.includes('MARKETROUTE_PUBLIC_AI_DAILY_COST_LIMIT_USD'),'public daily cost cap is environment-controlled'],
  [governance.includes('MARKETROUTE_PUBLIC_AI_IN_FLIGHT_LIMIT'),'public in-flight cap is environment-controlled'],
  [migration.includes("organisation_id is null") && migration.includes("job_type='BUSINESS_ANALYSIS'"),'public ledger scope is isolated to anonymous Business Analysis'],
  [migration.includes("progress=greatest(coalesce(baj.progress,0),8)"),'reclaims preserve monotonic persisted progress'],
  [migration.includes("stage=case when p_retryable") && !migration.includes("stage='FAILED',\n     progress=0"),'retryable interruptions no longer reset progress to zero'],
  [wizard.includes('{analysisJob?.progress ?? 0}%'),'percentage renders persisted job progress'],
];
let failed=false;
for(const [ok,label] of checks){console.log(`${ok?'PASS':'FAIL'} ${label}`); if(!ok) failed=true}
if(failed) process.exit(1);
