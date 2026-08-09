import fs from 'node:fs';
const ai=fs.readFileSync(new URL('../lib/genesis-g8/autonomous-expansion-openai.ts',import.meta.url),'utf8');
const worker=fs.readFileSync(new URL('../lib/genesis-g8/autonomous-expansion-worker.ts',import.meta.url),'utf8');
const checks=[
 ['R4 version',ai.includes('G8.2-R4-BREADTH-RECOVERY-1.2')],
 ['six-company batch retained',ai.includes('GENESIS_G82_EXPANSION_COMPANIES_PER_CALL = 6')],
 ['recovery pass exists',ai.includes('RECOVERY PASS')],
 ['empty result checked',ai.includes('gateway.value.companies.length===0')],
 ['empty first pass changes scope',ai.includes(':breadth-recovery:')],
 ['empty recovery errors',ai.includes('GENESIS_G82_EXPANSION_EMPTY_AFTER_RECOVERY')],
 ['search angles rotate',ai.includes('searchAngles') && ai.includes('attemptNumber%searchAngles.length')],
 ['recovery company-first',ai.includes('contacts and routes are optional')],
 ['recovery asks 3-6',ai.includes('Return 3-6 distinct companies')],
 ['excluded domains retained',ai.includes('excludedDomains')],
 ['worker passes attempt number',worker.includes('attemptNumber:job.attempt_count')],
 ['worker version',worker.includes('G8.2-R4-AUTONOMOUS-EXPANSION-1.2')],
];
let failed=0;for(const [name,ok] of checks){console.log(`${ok?'PASS':'FAIL'} ${name}`);if(!ok)failed++;}
console.log(`${checks.length-failed}/${checks.length} passed`);if(failed)process.exit(1);
