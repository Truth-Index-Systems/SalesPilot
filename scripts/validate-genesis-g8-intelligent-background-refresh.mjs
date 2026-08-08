import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root,p),'utf8');
const moduleText = read('lib/genesis-g8/background-refresh.ts');
const migration = read('supabase/migrations/0118_genesis_g81_release16_intelligent_background_refresh.sql');
const route = read('app/api/autonomy/genesis-g8/refresh/run/route.ts');
const docs = read('GENESIS-G8.1-RELEASE16-INTELLIGENT-BACKGROUND-REFRESH.md');
const index = read('lib/genesis-g8/index.ts');
const vercel = fs.existsSync(path.join(root,'vercel.json')) ? read('vercel.json') : '';

const checks = [
  ['R16 version declared', moduleText.includes('G8.1-R16-BACKGROUND-REFRESH-1.0')],
  ['background module never imports OpenAI', !/openai|responses\.create|generateStructured/i.test(moduleText)],
  ['uses database candidate RPC', moduleText.includes('list_genesis_g8_background_refresh_candidates')],
  ['checks live customer demand first', moduleText.includes('genesis_g8_background_refresh_live_demand')],
  ['defers on live customer work', moduleText.includes('deferredForLiveDemand: true')],
  ['bounded scheduler limit', moduleText.includes('Math.min(max') || moduleText.includes('clamp(options.limit')],
  ['stable SHA256 dispatch identity', moduleText.includes('createHash("sha256")')],
  ['dispatch identity includes latest evidence', moduleText.includes('latestEvidenceAt')],
  ['daily refresh bucket prevents hot-loop', moduleText.includes('slice(0, 10)')],
  ['queues through exact background refresh RPC', moduleText.includes('enqueue_genesis_g8_background_refresh')],
  ['migration creates refresh audit table', migration.includes('create table if not exists public.genesis_g8_background_refresh_events')],
  ['migration candidate priority includes freshness debt', migration.includes('(1 - case')],
  ['migration priority includes criticality', migration.includes("when 'CRITICAL' then 4.0")],
  ['migration priority includes recent campaign reuse', migration.includes('recent_campaign_uses')],
  ['candidate selection excludes rejected entities', migration.includes("review_state<>'HUMAN_REJECTED'")],
  ['candidate selection avoids existing repair ownership', migration.includes("q.status in ('QUEUED','CLAIMED')")],
  ['live demand recognises tenant scoped repair', migration.includes('q.organisation_id is not null') && migration.includes('q.campaign_id is not null')],
  ['refresh creates DISCOVERY_REPAIR not full discovery', migration.includes("'DISCOVERY_REPAIR'") && !migration.includes("'DISCOVERY_FULL'")],
  ['refresh mode is stale evidence only', migration.includes("'REFRESH_STALE_EVIDENCE'")],
  ['refresh objective demands only current evidence', migration.includes('do not repeat unrelated known facts')],
  ['background queue has no tenant workflow identity', migration.includes("'{}'::jsonb,'COMPLETED','REPAIR_QUEUED'")],
  ['endpoint protected with CRON_SECRET', route.includes('process.env.CRON_SECRET') && route.includes('Bearer ${secret}')],
  ['endpoint is capacity-governed after R17', route.includes('runGenesisG8CapacityBudgetCycle') && !route.includes('runGenesisG8IntelligentBackgroundRefresh')],
  ['endpoint has bounded max duration', route.includes('maxDuration = 60')],
  ['R16 exported from public G8 index', index.includes('export * from "./background-refresh"')],
  ['docs state live customer priority', docs.includes('Live customer-scoped repair work always outranks background refresh')],
  ['docs state R9 remains executor', docs.includes('R9 remains the only exact-repair model executor')],
  ['no R16 refresh cron silently activated', !vercel.includes('/api/autonomy/genesis-g8/refresh/run')],
];

let failed = 0;
for (const [name, ok] of checks) {
  console.log(`${ok ? '✓' : '✗'} ${name}`);
  if (!ok) failed++;
}
console.log(`\nGenesis G8.1 R16 validation: ${checks.length-failed}/${checks.length} passed`);
if (failed) process.exit(1);
