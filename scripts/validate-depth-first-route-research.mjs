import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const migration = fs.readFileSync(path.join(root, 'supabase/migrations/0086_genesis_post_freeze_depth_first_route_research.sql'), 'utf8');
const scheduler = fs.readFileSync(path.join(root, 'lib/pipeline/scheduler.ts'), 'utf8');
const service = fs.readFileSync(path.join(root, 'features/contacts/contact-discovery.service.ts'), 'utf8');

const checks = [
  ['immediate expansion eligibility', /next_attempt_at=now\(\)/.test(migration)],
  ['no artificial 15 second expansion delay', !/next_attempt_at=now\(\)\+interval '15 seconds'/.test(migration)],
  ['started sessions outrank fresh', /route_expansion_pass,0\)>0 or s\.started_at is not null/.test(migration)],
  ['deepest expansion pass first', /coalesce\(s\.route_expansion_pass,0\) desc/.test(migration)],
  ['claim function replaced', /create or replace function public\.claim_contact_discovery\(/.test(migration)],
  ['dispatch planner replaced', /create or replace function public\.plan_contact_discovery_dispatch\(/.test(migration)],
  ['readiness function replaced', /create or replace function public\.evaluate_contact_discovery_route_readiness\(/.test(migration)],
  ['service still uses owned claim', /rpc\/claim_contact_discovery_owned/.test(service)],
  ['service still uses owned readiness', /rpc\/evaluate_contact_discovery_route_readiness_owned/.test(service)],
  ['scheduler remains one deep route per cycle', /one deep route investigation per scheduler cycle/.test(scheduler)],
  ['route budget gate preserved', /ROUTE_INTELLIGENCE_START_BUDGET_MS/.test(scheduler)],
  ['direct claim remains revoked from service role', /revoke execute on function public\.claim_contact_discovery\(uuid,uuid,boolean\) from service_role/.test(migration)],
  ['direct planner remains revoked from service role', /revoke execute on function public\.plan_contact_discovery_dispatch\(uuid,numeric\) from service_role/.test(migration)],
  ['four-pass safety cap preserved', /route_expansion_pass,0\)<4/.test(migration)],
  ['expansion source-diversity prompt added', /prioritise genuinely new independent access paths/.test(fs.readFileSync(path.join(root, 'lib/contacts/openai.ts'), 'utf8'))],
  ['prompt fingerprint versioned', /contact-discovery\/v3-depth-first-source-diversity/.test(fs.readFileSync(path.join(root, 'lib/contacts/openai.ts'), 'utf8'))],
];

let failed = 0;
for (const [name, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
  if (!ok) failed++;
}
console.log(`\n${checks.length - failed}/${checks.length} checks passed`);
if (failed) process.exit(1);
