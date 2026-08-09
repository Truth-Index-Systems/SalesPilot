import fs from 'node:fs';
const worker=fs.readFileSync(new URL('../lib/genesis-g8/autonomous-expansion-worker.ts', import.meta.url),'utf8');
const openai=fs.readFileSync(new URL('../lib/genesis-g8/autonomous-expansion-openai.ts', import.meta.url),'utf8');
const checks=[
 ['worker audit version',worker.includes('B8.3.5-DISPATCH-AUDIT')],
 ['research audit version',openai.includes('B8.3.5-DISPATCH-AUDIT')],
 ['shared event name worker',worker.includes('GENESIS_G82_EXPANSION_DECISION')],
 ['shared event name openai',openai.includes('GENESIS_G82_EXPANSION_DECISION')],
 ['job claimed',worker.includes('"JOB_CLAIMED"')],
 ['research dispatch',worker.includes('"RESEARCH_DISPATCH"')],
 ['research accepted',worker.includes('"RESEARCH_ACCEPTED"')],
 ['persist start',worker.includes('"PERSIST_COMPANY_START"')],
 ['persist done',worker.includes('"PERSIST_COMPANY_DONE"')],
 ['settle completed',worker.includes('"SETTLE_COMPLETED"')],
 ['settle queued',worker.includes('"SETTLE_QUEUED"')],
 ['settle retryable',worker.includes('"SETTLE_RETRYABLE_FAILURE"')],
 ['settle final',worker.includes('"SETTLE_FINAL_FAILURE"')],
 ['reservation request',openai.includes('"AI_RESERVATION_REQUEST"')],
 ['reservation granted',openai.includes('"AI_RESERVATION_GRANTED"')],
 ['background fetch submit',openai.includes('"BACKGROUND_FETCH_OR_SUBMIT"')],
 ['background pending',openai.includes('"BACKGROUND_PENDING"')],
 ['background terminal',openai.includes('"BACKGROUND_TERMINAL"')],
 ['background response available',openai.includes('"BACKGROUND_RESPONSE_AVAILABLE"')],
 ['incomplete retry',openai.includes('"PROVIDER_INCOMPLETE_RETRY"')],
 ['hard gate accepted',openai.includes('"HARD_GATE_ACCEPTED"')],
 ['canonicalisation required',openai.includes('"HARD_GATE_CANONICALISATION_REQUIRED"')],
 ['canonicalisation start',openai.includes('"CANONICALISATION_START"')],
 ['canonicalisation pending',openai.includes('"CANONICALISATION_PENDING"')],
 ['canonicalisation accepted',openai.includes('"CANONICALISATION_ACCEPTED"')],
 ['discard checkpoint',openai.includes('"DISCARD_CHECKPOINT"')],
 ['background submit still enabled',openai.includes('fetchResumableOpenAIResponse')],
 ['AI reservation still governed',openai.includes('reserveAiRequest')],
 ['MR-TI hydration still present',worker.includes('hydrateGenesisG8EntityTruth')],
 ['granular persistence still present',worker.includes('Expansion company skipped at hard persistence boundary')],
];
let pass=0; for(const [n,ok] of checks){console.log(`${ok?'PASS':'FAIL'} ${n}`); if(ok)pass++;}
console.log(`\nBuild 8.3.5 dispatch audit: ${pass}/${checks.length}`);
if(pass!==checks.length)process.exit(1);
