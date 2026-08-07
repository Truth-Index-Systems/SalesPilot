import fs from 'node:fs';
const sql=fs.readFileSync('supabase/migrations/0083_genesis_g5_release11_engagement_event_instrumentation.sql','utf8');
const checks=[
 ['ledger table',/create table if not exists public\.engagement_events/],
 ['stable generated event',/'MESSAGE_GENERATED'/],
 ['stable rewritten event',/'MESSAGE_REWRITTEN'/],
 ['route selected',/'ROUTE_SELECTED'/],
 ['route changed',/'ROUTE_CHANGED'/],
 ['edited',/'MESSAGE_EDITED'/],
 ['approved',/'APPROVED'/],
 ['rejected',/'REJECTED'/],
 ['queued',/'QUEUED'/],
 ['sent',/'SENT'/],
 ['delivered',/'DELIVERED'/],
 ['bounced',/'BOUNCED'/],
 ['reply received',/'REPLY_RECEIVED'/],
 ['idempotent event key',/unique \(organisation_id,event_key\)/],
 ['source event unique',/engagement_events_source_strategy_event_uidx/],
 ['projection trigger',/create trigger engagement_strategy_events_project_learning/],
 ['external ingestion',/record_g5_engagement_external_event/],
 ['sent gate',/G5_EXTERNAL_EVENT_REQUIRES_SENT_ENGAGEMENT/],
 ['service role only',/grant execute on function public\.record_g5_engagement_external_event[^;]+to service_role/],
 ['append only',/revoke update,delete,truncate on table public\.engagement_events/],
 ['no reply interpretation',/'replyInterpretation',false/],
 ['no learning applied',/'learningApplied',false/],
 ['historical conservative tag',/'historicalProjection',true/],
];
let failed=0;
for (const [name,re] of checks){ const ok=re.test(sql); console.log(`${ok?'PASS':'FAIL'} ${name}`); if(!ok) failed++; }
if(failed){ console.error(`G5 R11 validation failed: ${failed}/${checks.length}`); process.exit(1); }
console.log(`G5 R11 validation passed: ${checks.length}/${checks.length}`);
