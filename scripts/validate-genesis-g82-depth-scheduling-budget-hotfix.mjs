import fs from 'node:fs';
const ops=fs.readFileSync('lib/genesis-g8/autonomous-operations.ts','utf8');
const cap=fs.readFileSync('lib/genesis-g8/capacity-budget.ts','utf8');
const checks=[
 ['depth has independent gate', /const mayDepth=.*maximumBackgroundRepairs>0/.test(ops)],
 ['depth runs before breadth block', ops.indexOf('runGenesisG82DepthWorker(') < ops.indexOf('runGenesisG82AutonomousExpansionWorker(')],
 ['depth blocked outside normal/conservative', /capacity\.mode==="NORMAL"\|\|capacity\.mode==="CONSERVATIVE"/.test(ops)],
 ['breadth still protects customer work', /!capacity\.snapshot\.liveCustomerWorkPending/.test(ops)],
 ['default background target 100', /MARKETROUTE_G8_BACKGROUND_DAILY_BUDGET_USD \?\? "100"/.test(cap)],
 ['budget capped by workspace limit', /Math\.min\(snapshot\.dailyCostLimitUsd, Math\.max\(percentageBudgetUsd, configuredBackgroundBudgetUsd\)\)/.test(cap)],
 ['remaining capped by workspace remaining', /Math\.min\(workspaceRemainingUsd, backgroundEnvelopeRemainingUsd\)/.test(cap)],
 ['global snapshot total cost retained', /snapshot\.dailyCostLimitUsd - snapshot\.costTodayUsd/.test(cap)],
];
let pass=0; for(const [name,ok] of checks){console.log(`${ok?'PASS':'FAIL'} ${name}`);if(ok)pass++;}
console.log(`Genesis G8.2 depth scheduling/budget hotfix: ${pass}/${checks.length}`);
if(pass!==checks.length) process.exit(1);
