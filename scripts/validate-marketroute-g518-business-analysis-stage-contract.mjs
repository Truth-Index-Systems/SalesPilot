import fs from 'node:fs';
const migration=fs.readFileSync(new URL('../supabase/migrations/0101_marketroute_g518_business_analysis_stage_contract_fix.sql',import.meta.url),'utf8');
const worker=fs.readFileSync(new URL('../lib/intelligence/business-analysis-worker.ts',import.meta.url),'utf8');
const coreMigration=fs.readFileSync(new URL('../supabase/migrations/0100_marketroute_g516_business_analysis_workload_decomposition.sql',import.meta.url),'utf8');
const checks=[
  [migration.includes('drop constraint if exists business_analysis_jobs_stage_check'),'legacy stage constraint replaced'],
  [migration.includes("'WEBSITE_CONNECTED'")&&migration.includes("'BUILDING_BUSINESS_DNA'")&&migration.includes("'BUSINESS_DNA_READY'")&&migration.includes("'GROWTH_STRATEGY_RUNNING'"),'all decomposed stages allowed'],
  [migration.includes("'ANALYSING_BUSINESS'")&&migration.includes("'PREPARING_RECOMMENDATIONS'")&&migration.includes("'COMPLETE'")&&migration.includes("'FAILED'"),'legacy stages retained'],
  [worker.includes('"WEBSITE_CONNECTED",14')&&worker.includes('"BUILDING_BUSINESS_DNA",20')&&worker.includes('"GROWTH_STRATEGY_RUNNING",72')&&worker.includes('"PREPARING_RECOMMENDATIONS",92'),'worker stage vocabulary covered'],
  [coreMigration.includes("stage='BUSINESS_DNA_READY'")&&coreMigration.includes('progress=greatest(coalesce(baj.progress,0),70)'),'persisted core checkpoint covered'],
];
let failed=0;
for(const [ok,label] of checks){console.log(`${ok?'PASS':'FAIL'} ${label}`);if(!ok)failed++;}
if(failed)process.exit(1);
