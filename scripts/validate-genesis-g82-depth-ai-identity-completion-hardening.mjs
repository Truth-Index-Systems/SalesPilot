import fs from 'node:fs';
const read=(p)=>fs.readFileSync(new URL(`../${p}`, import.meta.url),'utf8');
const files={
  gov:read('lib/ai/governance.ts'),
  policy:read('lib/ai/request-policy.ts'),
  profile:read('lib/ai/workload-profile.ts'),
  depth:read('lib/genesis-g8/autonomous-depth-openai.ts'),
  worker:read('lib/genesis-g8/autonomous-depth-worker.ts'),
  sql:read('supabase/migrations/0138_genesis_g82_depth_ai_identity_completion_hardening.sql'),
};
const checks=[
 ['governance type includes dedicated depth',files.gov.includes('"GENESIS_G82_DEPTH"')],
 ['request policy includes depth timeout',files.policy.includes('GENESIS_G82_DEPTH: 120_000')&&files.policy.includes('MARKETROUTE_AI_TIMEOUT_G82_DEPTH_MS')],
 ['workload profile isolates depth',files.profile.includes('GENESIS_G82_DEPTH: {')&&files.profile.includes('genesis-g82-depth/v1.1-dedicated-ai-identity')],
 ['depth reserves dedicated job type',files.depth.includes('jobType:"GENESIS_G82_DEPTH"')&&files.depth.includes('task:"GENESIS_G82_DEPTH"')],
 ['depth reads completed legacy paid work',files.depth.includes('LEGACY_BACKGROUND_COMPLETED_REUSED')&&files.depth.includes('status=eq.completed&response_json=not.is.null')],
 ['legacy reuse is job-scoped',files.depth.includes('job_id=eq.${encodeURIComponent(input.jobId)}')],
 ['zero safe result cannot settle completed',files.worker.includes('GENESIS_G82_DEPTH_NOTHING_SAFE_TO_PERSIST')],
 ['database check constraint accepts depth',files.sql.includes("'GENESIS_G82_DEPTH'" )&&files.sql.includes('ai_usage_ledger_job_type_check')],
 ['parallel governor counts depth',files.sql.includes("'GENESIS_G82_EXPANSION','GENESIS_G82_DEPTH'" )],
 ['legacy completed zero jobs reconcile',files.sql.includes('GENESIS_G82_DEPTH_COMPLETED_RESPONSE_RECONCILIATION')&&files.sql.includes("j.status='COMPLETED'")&&files.sql.includes("b.request_scope like 'genesis-g82-depth:%'")],
 ['reconciliation does not touch enriched jobs',files.sql.includes("m.entity_type in ('contact','route')")],
];
let ok=0;for(const [name,pass] of checks){console.log(`${pass?'PASS':'FAIL'} ${name}`);if(pass)ok++;}
console.log(`\n${ok}/${checks.length} checks passed`);if(ok!==checks.length)process.exit(1);
