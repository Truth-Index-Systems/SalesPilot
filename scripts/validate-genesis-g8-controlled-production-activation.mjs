import fs from 'node:fs';
const read=p=>fs.readFileSync(p,'utf8');
const activation=read('lib/genesis-g8/activation-controller.ts');
const merge=read('lib/genesis-g8/knowledge-discovery-merge.ts');
const migration=read('supabase/migrations/0121_genesis_g81_release19_controlled_production_activation.sql');
const dashboard=read('app/dashboard/page.tsx');
const route=read('app/dashboard/genesis-g8/activation/route.ts');
const index=read('lib/genesis-g8/index.ts');
const checks=[
 ['R19 version',activation.includes('G8.1-R19-CONTROLLED-ACTIVATION-1.0')],
 ['levels 0 through 5',activation.includes('0:{mode:"OFF"')&&activation.includes('5:{mode:"DEFAULT"')],
 ['level 1 allowlist',activation.includes('mode:"ALLOWLIST"')&&activation.includes('allowlist.includes')],
 ['level 2 canary 10 percent',activation.includes('cohortPercent:10')&&activation.includes('candidateLimit:5')],
 ['level 3 controlled 25 percent',activation.includes('cohortPercent:25')&&activation.includes('candidateLimit:25')],
 ['level 4 knowledge first 50 percent',activation.includes('cohortPercent:50')],
 ['level 5 default 100 percent',activation.includes('cohortPercent:100')],
 ['deterministic cohort hashing',activation.includes('createHash("sha256")')&&activation.includes('genesisG8RolloutBucket')],
 ['hard candidate quality gate',activation.includes('candidateTruth')&&activation.includes('candidateConfidence')&&activation.includes('candidateCoverage')&&activation.includes('candidateBlocking')],
 ['automatic rollback exists',activation.includes('Automatic safety rollback')&&activation.includes('failureRate>=0.15')&&activation.includes('fallbackRate>=0.35')],
 ['repair burden rollback signal',activation.includes('burden>=15')],
 ['human rejection rollback signal',activation.includes('rejected>=3')],
 ['runtime fails closed',activation.includes('return {configured_level:0}')],
 ['R15 merge now consumes activation decision',merge.includes('decideGenesisG8Activation')&&merge.includes('readGenesisG8ActivationRuntime')],
 ['non activated cohort falls back',merge.includes('decision:"FALLBACK"')&&merge.includes('skipped:true')],
 ['activation limits candidate count',merge.includes('.slice(0,activation.candidateLimit)')],
 ['production merge remains fail open',merge.includes('controlled activation failed open')&&merge.includes('fallbackUsed:true')],
 ['append only activation telemetry',migration.includes('create table if not exists public.genesis_g8_activation_events')],
 ['activation default off',migration.includes('activation_level integer not null default 0')],
 ['founder level setter',migration.includes('set_genesis_g8_activation_level')],
 ['runtime snapshot derives recent safety signals',migration.includes('genesis_g8_activation_runtime_snapshot')&&migration.includes("interval '24 hours'")],
 ['activation tables are RLS protected',migration.match(/enable row level security/g)?.length>=2],
 ['service role only mutation',migration.includes('grant execute on function public.set_genesis_g8_activation_level(integer) to service_role')],
 ['founder dashboard controls activation',dashboard.includes('Controlled production activation')&&dashboard.includes('/dashboard/genesis-g8/activation')],
 ['dashboard shows auto rollback',dashboard.includes('rollbackApplied')],
 ['founder activation route protected',route.includes('hasFounderDashboardSession')],
 ['founder route validates 0 to 5',route.includes('level<0||level>5')],
 ['public G8 root exports activation controller',index.includes('./activation-controller')],
 ['no R19 cron silently activated',!read('vercel.json').includes('activation')],
];
let passed=0;for(const [name,ok] of checks){console.log(`${ok?'✓':'✗'} ${name}`);if(ok)passed++;}
if(passed!==checks.length){console.error(`\nGenesis G8.1 R19 validation failed: ${passed}/${checks.length}`);process.exit(1)}
console.log(`\nGenesis G8.1 R19 validation: ${passed}/${checks.length} passed`);
