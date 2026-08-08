import fs from 'node:fs';
const read=p=>fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8');
const collector=read('lib/ai/background-collector.ts');
const background=read('lib/ai/background-response.ts');
const analysis=read('lib/intelligence/openai.ts');
const migration=read('supabase/migrations/0103_marketroute_g5110_background_incomplete_recovery.sql');
const checks=[];
function check(name,ok){checks.push([name,!!ok]);if(!ok)console.error('FAIL',name);}
check('collector captures incomplete_details.reason',collector.includes('incomplete_details')&&collector.includes('terminalDiagnostic'));
check('collector passes terminal provider json for diagnostics',collector.includes('status === "completed" || TERMINAL_FAILURES.has(status) ? json : null'));
check('terminal checkpoints are immutable',background.includes('Terminal checkpoints are immutable evidence')&&!background.includes('await clearCheckpoint(key);\n      return syntheticResponse({ error: { message: `Background response ended'));
check('terminal response has typed error',background.includes('OpenAIBackgroundTerminalError')&&background.includes('collector_last_error'));
check('business analysis derives fresh retry scope',analysis.includes(':retry:${stableFingerprint({previousScope:requestScope,responseId:error.responseId})}'));
check('growth token ceiling raised',analysis.includes('MARKETROUTE_BUSINESS_ANALYSIS_GROWTH_MAX_OUTPUT_TOKENS')&&analysis.includes('"6500"'));
check('terminal ledger is closed',migration.includes("status='FAILED'")&&migration.includes("OPENAI_BACKGROUND_'||upper(p_status)"));
check('terminal provider reason persisted',migration.includes('collector_last_error=case'));
check('webhook terminal rows can be recovery-collected',migration.includes("b.status in ('failed','cancelled','incomplete') and b.collector_last_error is null"));
if(checks.some(([,ok])=>!ok))process.exit(1);
console.log(`MarketRoute G5.1.10 validation passed (${checks.length} checks)`);
