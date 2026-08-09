import fs from 'node:fs';
const read=p=>fs.readFileSync(p,'utf8');
const ai=read('lib/genesis-g8/autonomous-expansion-openai.ts');
const worker=read('lib/genesis-g8/autonomous-expansion-worker.ts');
const ui=read('components/genesis-g8-review-workspace.tsx');
const page=read('app/dashboard/page.tsx');
const route=read('app/dashboard/genesis-g8/reviews/[id]/resolve/route.ts');
const migration=read('supabase/migrations/0125_genesis_g82_r3_review_resolver_and_expansion_throughput.sql');
const checks=[
 ['post-R5 expansion ceiling remains schema-bound', ai.includes('GENESIS_G82_EXPANSION_COMPANIES_PER_CALL = 3') && ai.includes('max(GENESIS_G82_EXPANSION_COMPANIES_PER_CALL)')],
 ['prompt asks model to use batch efficiently', ai.includes('Use the web-search context efficiently across the whole batch')],
 ['weak companies must not pad batch', ai.includes('Never pad the batch with weak or duplicate companies')],
 ['post-R5 output ceiling remains bounded', ai.includes('Math.max(profile.maxOutputTokens,6000)')],
 ['existing canonical domain dedupe retained', worker.includes('seenDomains.has(canonicalDomain)') && worker.includes('loadKnownCompanyDomains')],
 ['Truth rehydration still owns scoring', worker.includes('hydrateGenesisG8EntityTruth')],
 ['hydration-safe relative clock', ui.includes('relative=(iso:string,referenceMs:number)') && !ui.includes('Date.now()')],
 ['deterministic London activity time', ui.includes('timeZone:"Europe/London"') && ui.includes('activityTime(item.occurredAt)')],
 ['server render timestamp passed to client', page.includes('renderedAt={data.generatedAt}') && ui.includes('renderedAt:string')],
 ['review action remains JSON POST', ui.includes('method:"POST"') && route.includes('application/json')],
 ['review migration repairs historical schema idempotently', migration.includes('add column if not exists resolution_action') && migration.includes('add column if not exists review_task_id')],
 ['resolver SQL qualifies queue aliases', migration.includes('from public.genesis_g8_founder_review_queue q') && migration.includes('where q.id=p_review_task_id')],
 ['resolver avoids ambiguous conflict target', migration.includes('on conflict do nothing') && migration.includes('where r.review_task_id=v_task.id')],
 ['review receipt persistence is mandatory', migration.includes('GENESIS_G8_REVIEW_RECEIPT_NOT_PERSISTED')],
 ['Truth snapshots remain immutable', !migration.includes('update public.genesis_g8_truth_snapshots')],
 ['PostgREST schema reload included', migration.includes("notify pgrst, 'reload schema'")],
];
let failed=0;
for(const [label,ok] of checks){console.log(`${ok?'PASS':'FAIL'} ${label}`);if(!ok)failed++;}
console.log(`\nGenesis G8.2 R3 throughput/review hardening: ${checks.length-failed}/${checks.length}`);
if(failed)process.exit(1);
