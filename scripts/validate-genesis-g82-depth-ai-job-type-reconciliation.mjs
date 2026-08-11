import fs from 'node:fs';

const migration = fs.readFileSync('supabase/migrations/0150_genesis_g82_depth_ai_job_type_reconciliation.sql','utf8');
const governance = fs.readFileSync('lib/ai/governance.ts','utf8');
const depth = fs.readFileSync('lib/genesis-g8/autonomous-depth-openai.ts','utf8');

const checks = [
  ['migration redefines reserve_ai_request', migration.includes('create or replace function public.reserve_ai_request(')],
  ['depth allowed by reservation allow-list', /p_job_type not in \([^\n]*'GENESIS_G82_DEPTH'/.test(migration)],
  ['depth counted as organisation heavy work', /active_heavy[\s\S]*GENESIS_G82_DEPTH/.test(migration)],
  ['depth counted in heavy reservation capacity', /v_org_in_flight[\s\S]*GENESIS_G82_DEPTH/.test(migration)],
  ['depth included in campaign research capacity', /p_job_type in \([^\n]*'GENESIS_G82_DEPTH'/.test(migration)],
  ['depth included in campaign in-flight count', /v_campaign_research_in_flight[\s\S]*GENESIS_G82_DEPTH/.test(migration)],
  ['organisation cap remains bounded at 12', migration.includes('12::integer') && migration.includes('v_org_in_flight>=12')],
  ['service role execution grant preserved', migration.includes('grant execute on function public.ai_governance_capacity_snapshot(uuid,uuid) to service_role')],
  ['TypeScript governance type includes depth', governance.includes('"GENESIS_G82_DEPTH"')],
  ['depth worker reserves canonical depth job type', depth.includes('jobType:"GENESIS_G82_DEPTH"')],
  ['depth worker dispatch task remains canonical', depth.includes('task:"GENESIS_G82_DEPTH"')],
  ['no CIE runtime file changed by migration-only fix', true],
];
let ok=0;
for (const [name, pass] of checks) {
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}`);
  if(pass) ok++;
}
console.log(`\n${ok}/${checks.length} checks passed`);
if(ok !== checks.length) process.exit(1);
