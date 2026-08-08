import fs from 'node:fs';

const read = p => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const policy = read('lib/ai/request-policy.ts');
const discovery = read('lib/discovery/openai.ts');
const contacts = read('lib/contacts/openai.ts');
const scheduler = read('lib/pipeline/scheduler.ts');
const errors = read('lib/pipeline/errors.ts');
const migration = read('supabase/migrations/0091_genesis_post_freeze_gpt5_transport_timeout_retry_hardening.sql');
const checks = [
  ['central timeout policy exists', policy.includes('aiRequestTimeoutMs')],
  ['company discovery has task timeout', discovery.includes('aiRequestTimeoutMs("COMPANY_DISCOVERY")')],
  ['company discovery classifies transport timeout', discovery.includes('classifyOpenAITransportError(error, "COMPANY_DISCOVERY"')],
  ['route intelligence has task timeout', contacts.includes('ROUTE_INTELLIGENCE_FIRST_PASS') && contacts.includes('ROUTE_INTELLIGENCE_EXPANSION')],
  ['G4 heavyweight attempt blocks G5 chaining', scheduler.includes('g4HeavyweightAttempted') && scheduler.includes('!g4HeavyweightAttempted')],
  ['transient service HTTP failures are retryable', errors.includes('408|425|500|502|503|504|529')],
  ['company timeout retry 30 seconds', migration.includes("interval '30 seconds'")],
  ['company timeout retry 1 minute', migration.includes("interval '1 minute'")],
  ['company timeout retry 2 minutes', migration.includes("interval '2 minutes'")],
  ['retry remains same persisted session', migration.includes('update public.discovery_sessions')],
  ['failure releases scheduler ownership', migration.includes('scheduler_run_id=null')],
  ['no prompt changes required by migration', !migration.includes('promptVersion')],
];
let passed=0;
for(const [label, ok] of checks){console.log(`${ok?'PASS':'FAIL'} ${label}`); if(ok) passed++;}
console.log(`\n${passed}/${checks.length} checks passed`);
if(passed!==checks.length) process.exit(1);
