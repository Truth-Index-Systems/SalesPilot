import fs from "node:fs";
const wizard=fs.readFileSync("components/campaign-wizard.tsx","utf8");
const sql=fs.readFileSync("supabase/migrations/0097_marketroute_g512_business_analysis_first_attempt_recovery.sql","utf8");
const checks=[
 [!wizard.includes("Analysis retry scheduled"),"retry scheduling is not exposed to visitors"],
 [!wizard.includes("Analysis queued"),"queue state is not exposed as a stalled first run"],
 [wizard.includes("MarketRoute is learning your business"),"continuous analysis wording remains"],
 [sql.includes("interval '5 seconds'"),"first transient retry is fast"],
 [sql.includes("interval '15 seconds'"),"second transient retry remains fast"],
 [sql.includes("v_attempt<5"),"existing terminal attempt ceiling is preserved"],
 [sql.includes("worker_token=null"),"failed worker lease is explicitly released"]
];
let failed=false;
for(const [ok,label] of checks){console.log(`${ok?"PASS":"FAIL"} ${label}`);if(!ok)failed=true;}
if(failed)process.exit(1);
