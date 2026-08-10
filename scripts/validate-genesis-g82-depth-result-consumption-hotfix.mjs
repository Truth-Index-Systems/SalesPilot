import fs from 'node:fs';
const worker=fs.readFileSync(new URL('../lib/genesis-g8/autonomous-depth-worker.ts',import.meta.url),'utf8');
const openai=fs.readFileSync(new URL('../lib/genesis-g8/autonomous-depth-openai.ts',import.meta.url),'utf8');
const checks=[
 ['version bumped',worker.includes('G8.2-DEPTH-WORKER-1.1-ZERO-RESULT-HARDENING')],
 ['decision telemetry',worker.includes('GENESIS_G82_DEPTH_DECISION')],
 ['zero-result hard boundary',worker.includes('GENESIS_G82_DEPTH_NOTHING_SAFE_TO_PERSIST')],
 ['contact persistence telemetry',worker.includes('CONTACT_PERSIST_DONE')],
 ['route persistence telemetry',worker.includes('ROUTE_PERSIST_DONE')],
 ['bounded zero-result retry remains',worker.includes('job.attempt_count<5')],
 ['settle carries real counts',worker.includes('contactsPersisted:contacts,routesPersisted:routes')],
 ['official route recovery instruction',openai.includes('Actively search the official company site')],
];
let failed=0;for(const [name,ok] of checks){console.log(`${ok?'PASS':'FAIL'} ${name}`);if(!ok)failed++;}
if(failed)process.exit(1);console.log(`PASS ${checks.length}/${checks.length}`);
