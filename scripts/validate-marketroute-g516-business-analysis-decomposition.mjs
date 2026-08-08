import fs from "node:fs";
const read=p=>fs.readFileSync(new URL(`../${p}`,import.meta.url),"utf8");
const worker=read("lib/intelligence/business-analysis-worker.ts");
const openai=read("lib/intelligence/openai.ts");
const jobs=read("lib/intelligence/business-analysis-jobs.ts");
const sql=read("supabase/migrations/0100_marketroute_g516_business_analysis_workload_decomposition.sql");
const ui=read("components/campaign-wizard.tsx");
const checks=[
 [worker.includes("analyseBusinessCore")&&worker.includes("analyseBusinessGrowth"),"worker uses decomposed AI phases"],
 [worker.includes("job.core_analysis_json")&&worker.includes("persistBusinessAnalysisCore"),"Core DNA is resumable/persisted"],
 [openai.includes('phase:"core"')&&openai.includes('reasoningEffort:"low"'),"Core phase is bounded for latency"],
 [openai.includes('phase:"growth"')&&openai.includes('reasoningEffort:"medium"'),"Growth phase is independently bounded"],
 [sql.includes("core_analysis_json jsonb")&&sql.includes("persist_business_analysis_core_owned"),"migration persists Core DNA"],
 [sql.includes("stage='BUSINESS_DNA_READY'")&&sql.includes("progress=greatest(coalesce(baj.progress,0),70)"),"Core completion advances durable progress"],
 [sql.includes("defer_business_analysis_background_owned")&&!sql.includes("stage='ANALYSING_BUSINESS'"),"background handoff preserves decomposed stage"],
 [jobs.includes("core_analysis_json")&&jobs.includes("persist_business_analysis_core_owned"),"repository exposes Core checkpoint"],
 [ui.includes("GROWTH_STRATEGY_RUNNING")&&ui.includes("Finding ideal customers and growth angles"),"UI reflects real decomposed stages"],
];
for(const [ok,label] of checks){if(!ok){console.error(`FAIL: ${label}`);process.exit(1)}console.log(`PASS: ${label}`)}
console.log("MarketRoute G5.1.6 decomposition checks passed.");
