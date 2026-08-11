import fs from "node:fs";
const cap=fs.readFileSync("lib/genesis-g8/capacity-budget.ts","utf8");
const ops=fs.readFileSync("lib/genesis-g8/autonomous-operations.ts","utf8");
const sql=fs.readFileSync("supabase/migrations/0149_genesis_g82_idle_capacity_spillover.sql","utf8");
const checks=[
  ["capacity version bumped",/G8\.2-IDLE-SPILLOVER-CAPACITY-1\.1/.test(cap)],
  ["operations version bumped",/G8\.2-IDLE-SPILLOVER-OPERATIONS-1\.3/.test(ops)],
  ["customer-only requires real live customer work",/else if \(snapshot\.liveCustomerWorkPending\)/.test(cap)],
  ["90 percent no longer forces customer-only",!/snapshot\.liveCustomerWorkPending \|\| capacityUsedRatio >= 0\.9/.test(cap)],
  ["90 percent idle spillover explicitly documented",/no live customer work is pending; remaining hard-budget capacity is available to background intelligence as governed spillover/.test(cap)],
  ["hard workspace remainder still bounds background",/workspaceRemainingUsd = Math\.max\(0, snapshot\.dailyCostLimitUsd - snapshot\.costTodayUsd\)/.test(cap)],
  ["background repair count remains bounded",/Math\.min\(20/.test(cap)],
  ["G8-specific cost env supported",/MARKETROUTE_G8_AI_DAILY_COST_LIMIT_USD/.test(cap)],
  ["public cost env remains compatibility fallback",/MARKETROUTE_PUBLIC_AI_DAILY_COST_LIMIT_USD/.test(cap)],
  ["G8-specific request env supported",/MARKETROUTE_G8_AI_DAILY_REQUEST_LIMIT/.test(cap)],
  ["system governance sync called before snapshot",/await syncGenesisG8SystemGovernanceLimits\(organisationId\)[\s\S]*genesis_g8_capacity_budget_snapshot/.test(cap)],
  ["sync RPC preserves autonomy state",!/autonomy_enabled\s*=/.test(sql)],
  ["sync RPC changes only governed request and cost limits",/daily_request_limit =/.test(sql)&&/daily_cost_limit_usd =/.test(sql)],
  ["sync RPC service-role only",/grant execute[\s\S]*to service_role/.test(sql)&&/revoke all[\s\S]*from public,anon,authenticated/.test(sql)],
  ["depth and breadth remain gated by background repair capacity",/maximumBackgroundRepairs>0/.test(ops)],
];
let pass=0;for(const [name,ok] of checks){console.log(`${ok?"PASS":"FAIL"} ${name}`);if(ok)pass++;}
console.log(`${pass}/${checks.length} checks passed`);if(pass!==checks.length)process.exit(1);
