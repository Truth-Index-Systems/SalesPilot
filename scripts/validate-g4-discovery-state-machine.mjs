import fs from "node:fs";
const read=p=>fs.readFileSync(p,"utf8");
const service=read("features/discovery/company-discovery.service.ts");
const migration=read("supabase/migrations/0060_genesis_g4_company_discovery_state_machine_and_refresh.sql");
const ticker=read("components/discovery-activity-ticker.tsx");
const page=read("app/campaigns/[id]/page.tsx");
const checks=[
 [service.includes('failurePhase = "PLANNING"'),"planning phase tracked"],
 [service.includes('failurePhase = "SEARCHING"'),"searching phase tracked"],
 [service.includes('failurePhase = "VERIFYING"'),"verifying phase tracked"],
 [service.includes('record_company_discovery_failure_v2'),"v2 failure RPC used"],
 [migration.includes("stage='TECHNICAL_RETRY'"),"technical retry stage persisted"],
 [migration.includes("stage='EXPANDING'"),"business expansion stage persisted"],
 [migration.includes("stage='READY'"),"ready stage persisted"],
 [ticker.includes('active||retryScheduled'),"retry states remain watched"],
 [ticker.includes('visibilitychange'),"visibility refresh installed"],
 [page.includes('discoveryPreparationRetry'),"preparation retry presented separately"],
];
const failed=checks.filter(([ok])=>!ok);
for(const [ok,label] of checks) console.log(`${ok?'PASS':'FAIL'} ${label}`);
if(failed.length) process.exit(1);
