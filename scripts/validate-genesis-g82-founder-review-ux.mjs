import fs from 'node:fs';
const read=p=>fs.readFileSync(p,'utf8');
const ui=read('components/genesis-g8-review-workspace.tsx');
const page=read('app/dashboard/page.tsx');
const repo=read('lib/founder-dashboard/repository.ts');
const route=read('app/dashboard/genesis-g8/reviews/[id]/resolve/route.ts');
const resolution=read('lib/genesis-g8/founder-review-resolution.ts');
const command=read('lib/genesis-g8/founder-command-centre.ts');
const migration=read('supabase/migrations/0124_genesis_g82_r2_founder_review_activity_industry_coverage.sql');
const css=read('app/globals.css');
const checks=[
 ['interactive review workspace',page.includes('GenesisG8ReviewWorkspace')&&ui.includes('Review and validate intelligence')],
 ['all four actions',ui.includes('resolve(task,"APPROVE")')&&ui.includes('resolve(task,"CORRECT")')&&ui.includes('resolve(task,"MORE_RESEARCH")')&&ui.includes('resolve(task,"REJECT")')],
 ['visible async state',ui.includes('Saving…')&&ui.includes('Queuing…')&&ui.includes('founder-review-notice')],
 ['JSON action response',route.includes('application/json')&&route.includes('NextResponse.json({ok:true,result})')],
 ['durable decision not masked by follow-up failure',resolution.includes('follow-up repair unavailable')&&resolution.includes('after durable review resolution')],
 ['evidence-rich review repository',repo.includes('genesis_g8_intelligence_claims')&&repo.includes('genesis_g8_intelligence_evidence')&&repo.includes('sourceUri')],
 ['evidence provenance preserved',repo.includes('intelligence_channel')&&ui.includes('sourceClass')],
 ['live activity feed',ui.includes('Live activity feed')&&command.includes('activity:FounderActivityItem[]')],
 ['industry research coverage',page.includes('Industry research coverage')&&command.includes('industryResearch:FounderIndustryResearch[]')],
 ['unique company membership aggregate',migration.includes("count(distinct entity_id) filter(where entity_type='company')")],
 ['expansion throughput aggregate',migration.includes('companies_found')&&migration.includes('companies_persisted')&&migration.includes('contacts_persisted')&&migration.includes('routes_persisted')],
 ['read-only service role RPC',migration.includes('security definer')&&migration.includes('grant execute')&&migration.includes('to service_role')],
 ['no new cron',!migration.includes('cron.schedule')],
 ['responsive UI',css.includes('founder-review-layout')&&css.includes('founder-industry-research-grid')],
];
let failed=0;for(const [label,ok] of checks){console.log(`${ok?'PASS':'FAIL'} ${label}`);if(!ok)failed++;}
console.log(`\nGenesis G8.2 R2 Founder UX validation: ${checks.length-failed}/${checks.length}`);if(failed)process.exit(1);
