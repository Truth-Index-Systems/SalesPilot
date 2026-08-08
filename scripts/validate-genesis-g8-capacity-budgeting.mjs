import fs from 'node:fs'; import path from 'node:path';
const root=process.cwd(); const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const mod=read('lib/genesis-g8/capacity-budget.ts');
const mig=read('supabase/migrations/0119_genesis_g81_release17_knowledge_scheduler_capacity_budgeting.sql');
const route=read('app/api/autonomy/genesis-g8/capacity/run/route.ts');
const refreshRoute=read('app/api/autonomy/genesis-g8/refresh/run/route.ts');
const docs=read('GENESIS-G8.1-RELEASE17-KNOWLEDGE-SCHEDULER-CAPACITY-BUDGETING.md');
const index=read('lib/genesis-g8/index.ts'); const vercel=fs.existsSync(path.join(root,'vercel.json'))?read('vercel.json'):'';
const checks=[
['R17 version',mod.includes('G8.1-R17-CAPACITY-BUDGET-1.0')],
['no OpenAI in budget module',!/openai|responses\.create|generateStructured/i.test(mod)],
['uses governance snapshot RPC',mod.includes('genesis_g8_capacity_budget_snapshot')],
['normal allocation 60/20/15/5',mod.includes('customerLivePercent: 60')&&mod.includes('customerRepairPercent: 20')&&mod.includes('backgroundGrowthPercent: 15')&&mod.includes('experimentPercent: 5')],
['conservative allocation 5 background',mod.includes('backgroundGrowthPercent: 5')],
['customer only has zero background',mod.includes('CUSTOMER_ONLY_ALLOCATION')&&mod.includes('backgroundGrowthPercent: 0')],
['customer demand wins',mod.includes('snapshot.liveCustomerWorkPending')],
['75 percent conservative threshold',mod.includes('capacityUsedRatio >= 0.75')],
['90 percent customer-only threshold',mod.includes('capacityUsedRatio >= 0.9')],
['fails closed paused',mod.includes('mode = "PAUSED"')],
['uses existing repair cost estimate',mod.includes('MARKETROUTE_G8_REPAIR_ESTIMATED_COST_USD')],
['caps background repairs',mod.includes('Math.min(20')],
['calls R16 scheduler not AI',mod.includes('runGenesisG8IntelligentBackgroundRefresh')],
['migration audit table',mig.includes('genesis_g8_capacity_budget_events')],
['snapshot reads governance policy',mig.includes('ai_governance_policies')],
['snapshot reads ledger',mig.includes('ai_usage_ledger')],
['snapshot identifies background repair by private identity null',mig.includes('q.organisation_id is null')&&mig.includes('q.campaign_id is null')],
['truth gain metric from snapshots',mig.includes('genesis_g8_truth_snapshots')&&mig.includes('truth_gain_per_repair_call')],
['capacity endpoint protected',route.includes('process.env.CRON_SECRET')],
['capacity endpoint records audit',route.includes('record_genesis_g8_capacity_budget_event')],
['old refresh endpoint cannot bypass R17',refreshRoute.includes('runGenesisG8CapacityBudgetCycle')&&!refreshRoute.includes('runGenesisG8IntelligentBackgroundRefresh')],
['public index exports R17',index.includes('export * from "./capacity-budget"')],
['docs preserve governance authority',docs.includes('hard authority')],
['docs keep R9 executor',docs.includes('R9 remains the only exact-repair model executor')],
['no capacity cron silently activated',!vercel.includes('/api/autonomy/genesis-g8/capacity/run')],
];
let failed=0; for(const [name,ok] of checks){console.log(`${ok?'✓':'✗'} ${name}`);if(!ok)failed++;}
console.log(`\nGenesis G8.1 R17 validation: ${checks.length-failed}/${checks.length} passed`); if(failed)process.exit(1);
