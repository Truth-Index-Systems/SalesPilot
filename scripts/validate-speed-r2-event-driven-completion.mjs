import fs from 'node:fs';

const read = p => fs.readFileSync(p,'utf8');
const checks=[];
const check=(name,ok)=>{checks.push({name,ok}); if(!ok) console.error(`FAIL: ${name}`); else console.log(`PASS: ${name}`);};

const bg=read('lib/ai/background-response.ts');
const collector=read('lib/ai/background-collector.ts');
const webhook=read('lib/ai/openai-webhook.ts');
const route=read('app/api/openai/webhook/route.ts');
const collectorRoute=read('app/api/autonomy/ai/collect/route.ts');
const migration=read('supabase/migrations/0094_genesis_speed_r2_event_driven_ai_completion.sql');
const vercel=read('vercel.json');

check('dispatcher submits background provider work',bg.includes('background: true')&&bg.includes('store: true'));
check('workers no longer GET/poll existing provider responses',!bg.includes('`${ENDPOINT}/${encodeURIComponent(id)}`'));
check('workers defer when a checkpoint is still provider-owned',bg.includes('throw new OpenAIBackgroundPendingError(params.task, id'));
check('collector owns Responses API retrieval',collector.includes('`${ENDPOINT}/${encodeURIComponent(row.response_id)}`'));
check('collector never submits new Responses API work',!collector.includes('method: "POST"') || !collector.includes('fetch(ENDPOINT,'));
check('collector has bounded provider retrieval timeout',collector.includes('SALESPILOT_AI_BACKGROUND_COLLECT_TIMEOUT_MS'));
check('collector claims work with its own lease',collector.includes('claim_ai_background_responses_for_collection')&&collector.includes('collector_lease_token'));
check('webhook verifies signed raw payload',webhook.includes('webhook-signature')&&webhook.includes('webhook-timestamp')&&webhook.includes('webhook-id')&&webhook.includes('createHmac("sha256"'));
check('webhook rejects replay-window violations',webhook.includes('Webhook timestamp is too old')&&webhook.includes('Webhook timestamp is too new'));
check('webhook route accepts response completion/failure terminal events',route.includes('response.completed')&&route.includes('response.failed')&&route.includes('response.cancelled')&&route.includes('response.incomplete'));
check('webhook completion opportunistically collects finished response',route.includes('collectOpenAIBackgroundResponseById'));
check('webhook event persistence is idempotent',migration.includes('openai_webhook_events')&&migration.includes('on conflict(event_id) do nothing'));
check('provider event wakes owning MarketRoute job',migration.includes('wake_ai_background_owner')&&migration.includes('next_attempt_at=now()')&&migration.includes('next_retry_at=now()'));
check('collector polling fallback is separately scheduled',vercel.includes('/api/autonomy/ai/collect'));
check('collector route remains CRON_SECRET protected',collectorRoute.includes('CRON_SECRET')&&collectorRoute.includes('timingSafeEqual'));
check('terminal provider states are represented distinctly',migration.includes("'failed','cancelled','incomplete'"));
check('completed response JSON is cached for worker resumption',migration.includes('p_response_json')&&migration.includes("p_status='completed'"));
check('webhook event table is service-role only',migration.includes('revoke all on table public.openai_webhook_events from public,anon,authenticated'));

const failed=checks.filter(x=>!x.ok);
console.log(`\nSpeed R2: ${checks.length-failed.length}/${checks.length} checks passed.`);
if(failed.length) process.exit(1);
