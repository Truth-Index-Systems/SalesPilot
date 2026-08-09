import fs from 'node:fs';
const read=p=>fs.readFileSync(p,'utf8');
const activation=read('lib/genesis-g8/activation-controller.ts');
const merge=read('lib/genesis-g8/knowledge-discovery-merge.ts');
const migration=read('supabase/migrations/0122_genesis_g81_release20_adaptive_default_v1_freeze.sql');
const dashboard=read('app/dashboard/page.tsx');
const route=read('app/dashboard/genesis-g8/activation/route.ts');
const docs=read('GENESIS-G8.1-RELEASE20-ADAPTIVE-DEFAULT-V1-FREEZE.md');
const vercel=read('vercel.json');
const checks=[
 ['R20 activation version',activation.includes('G8.1-R20-ADAPTIVE-DEFAULT-1.0')],
 ['adaptive default operating model constant',activation.includes('GENESIS_G8_OPERATING_MODEL = "ADAPTIVE_DEFAULT"')],
 ['level 5 is adaptive default',activation.includes('5:{mode:"ADAPTIVE_DEFAULT",cohortPercent:100')],
 ['runtime failure closes to Discovery',activation.includes('configured_level:0')&&activation.includes('FAIL_CLOSED')],
 ['ordinary rollback one level',activation.includes('degraded?1:0')],
 ['severe rollback two levels',activation.includes('severe?2')],
 ['severe failure signal',activation.includes('failureRate>=0.30')],
 ['severe fallback signal',activation.includes('fallbackRate>=0.60')],
 ['R5 R13 eligibility remains primary authority',merge.includes('existing R5/R13 eligibility decision as the primary authority')],
 ['merge only takes usable nonblocking candidates',merge.includes('c.mayUseKnowledgeImmediately&&!c.blocking')],
 ['merge remains fail open to Discovery',merge.includes('adaptive default failed open to Discovery')&&merge.includes('fallbackUsed:true')],
 ['R20 merge version',merge.includes('G8.1-R20-ADAPTIVE-KNOWLEDGE-DISCOVERY-MERGE-1.0')],
 ['system default level five',migration.includes('system_default_level integer not null default 5')],
 ['R19 untouched off promotes to five',migration.includes('when activation_level = 0 then 5')],
 ['nonzero R19 settings preserved as overrides',migration.includes('when activation_level between 1 and 5 then activation_level')],
 ['founder override is nullable',migration.includes('founder_override_level integer')],
 ['founder override setter',migration.includes('set_genesis_g8_activation_override')],
 ['restore default RPC',migration.includes('clear_genesis_g8_activation_override')],
 ['runtime resolves override before system default',migration.includes("coalesce((select founder_override_level from cfg),(select system_default_level from cfg)")],
 ['operating model persisted',migration.includes("operating_model = 'ADAPTIVE_DEFAULT'")],
 ['V1 freeze timestamp persisted',migration.includes('g8_v1_frozen_at')],
 ['dashboard exposes adaptive default',dashboard.includes('Adaptive default')&&dashboard.includes('Discovery remains the universal fallback')],
 ['dashboard founder overrides still available',dashboard.includes('Founder override level')],
 ['activation route can clear override',route.includes('clearGenesisG8ActivationOverride')&&route.includes('raw==="default"')],
 ['freeze docs preserve two channels',docs.includes('Knowledge Intelligence')&&docs.includes('Discovery Intelligence')],
 ['freeze docs forbid casual redesign',docs.includes('Do not redesign G8 V1 after R20')],
 ['no new R20 cron',!vercel.includes('adaptive-default')&&!vercel.includes('release20')],
];
let failed=0;for(const [name,ok] of checks){console.log(`${ok?'✓':'✗'} ${name}`);if(!ok)failed++;}
console.log(`\nGenesis G8.1 R20 validation: ${checks.length-failed}/${checks.length} passed`);if(failed)process.exit(1);
