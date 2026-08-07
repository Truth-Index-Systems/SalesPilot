import fs from "node:fs";
const sql=fs.readFileSync("supabase/migrations/0082_genesis_g5_release9_queue_and_execution_engine.sql","utf8");
const scheduler=fs.readFileSync("lib/pipeline/scheduler.ts","utf8");
const exec=fs.readFileSync("lib/engagement/g5-execution.ts","utf8");
const smtp=fs.readFileSync("lib/engagement/smtp-transport.ts","utf8");
const checks=[
 [sql.includes("g5_engagement_execution_queue"),"canonical R9 queue"],
 [sql.includes("unique(strategy_id)"),"duplicate-send structural guard"],
 [sql.includes("TIMEZONE_UNCERTAIN"),"timezone hold"],
 [sql.includes("08:00")&&sql.includes("18:00"),"recipient local send window"],
 [sql.includes("MANUAL_ACTION_REQUIRED"),"manual channels not fake-sent"],
 [sql.includes("claim_next_g5_email_execution_owned"),"execution lease claim"],
 [sql.includes("complete_g5_email_execution_owned"),"send completion"],
 [sql.includes("fail_g5_email_execution_owned"),"transport failure isolation"],
 [sql.includes("Strategy remains QUEUED"),"transport failure preserves intelligence"],
 [sql.includes("o.status<>'APPROVED'"),"G4 opportunity revalidation"],
 [sql.includes("not r.is_viable"),"G4 route viability revalidation"],
 [scheduler.includes("runG5ExecutionCycle"),"scheduler wiring"],
 [exec.includes("OUTBOUND_EMAIL_TRANSPORT"),"transport configuration gate"],
 [smtp.includes("AUTH LOGIN"),"SMTP auth"],
 [smtp.includes("implicit TLS"),"TLS-only transport"],
 [!sql.match(/update public\.commercial_routes|update public\.opportunities|update public\.contacts|update public\.companies/i),"no G4 mutation"],
];
let pass=0; for(const [ok,label] of checks){console.log(`${ok?"PASS":"FAIL"} ${label}`); if(ok)pass++;}
console.log(`${pass}/${checks.length} passed`); if(pass!==checks.length)process.exit(1);
