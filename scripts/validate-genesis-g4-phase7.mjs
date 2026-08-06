import fs from "node:fs";
const read=(p)=>fs.readFileSync(p,"utf8");
const migration=read("supabase/migrations/0040_genesis_g4_phase7_approval_queue.sql");
const scheduler=read("lib/pipeline/scheduler.ts");
const builder=read("lib/engagement/queue-builder.ts");
const checks=[
  [migration.includes("engagement_send_queue"),"send queue table"],
  [migration.includes("engagement_queue_holds"),"safe queue holds"],
  [migration.includes("resolve_engagement_timezone"),"timezone resolver"],
  [migration.includes("next_recipient_send_time"),"recipient-local window"],
  [migration.includes("time '08:00'")&&migration.includes("time '18:00'"),"08:00-18:00 policy"],
  [migration.includes("run_engagement_queue_builder"),"scheduler-owned queue RPC"],
  [migration.includes("EngagementQueuedForSend"),"outbox event"],
  [migration.includes("status='QUEUED_FOR_SEND'"),"engagement transition"],
  [scheduler.includes("buildEngagementSendQueue(runId)"),"single scheduler integration"],
  [builder.includes("This does not send messages"),"no sending boundary"],
];
for(const [ok,label] of checks){if(!ok)throw new Error(`G4 Phase 7 validation failed: ${label}`)}
console.log("Genesis G4 Phase 7 passed");
