import fs from "node:fs";
const sql=fs.readFileSync("supabase/migrations/0148_genesis_g82_ai_capacity_backpressure_hardening.sql","utf8");
const ops=fs.readFileSync("lib/genesis-g8/autonomous-operations.ts","utf8");
const checks=[
 ["bounded org cap 12",/v_org_in_flight>=12/.test(sql)&&/12::integer/.test(sql)],
 ["capacity deferral preserves expansion retry budget",/AI_PARALLEL_CAPACITY:%/.test(sql)&&/greatest\(attempt_count-1,0\)/.test(sql)],
 ["governance deferral preserves retry budget",/AI_GOVERNANCE_BLOCKED:%/.test(sql)],
 ["background pending preserves retry budget",/OPENAI_BACKGROUND_PENDING:%/.test(sql)],
 ["capacity failures requeued",/update public\.genesis_g82_expansion_jobs[\s\S]*status='QUEUED'/.test(sql)],
 ["repair capacity failures requeued",/update public\.genesis_g8_discovery_repair_queue[\s\S]*status='QUEUED'/.test(sql)],
 ["no-credit failures excluded",/not ilike '%no credits remaining%'/.test(sql)],
 ["expansion worker claims two",/runGenesisG82AutonomousExpansionWorker\(2\)/.test(ops)],
 ["depth worker claims two",/runGenesisG82DepthWorker\(2\)/.test(ops)],
 ["operator version bumped",/CAPACITY-BACKPRESSURE-OPERATIONS-1\.2/.test(ops)],
];
let passed=0;
for(const [name,ok] of checks){console.log(`${ok?"PASS":"FAIL"} ${name}`); if(ok)passed++;}
console.log(`${passed}/${checks.length} checks passed`);
if(passed!==checks.length)process.exit(1);
