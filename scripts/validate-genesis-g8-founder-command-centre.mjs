import fs from 'node:fs'; import path from 'node:path';
const root=process.cwd(); const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const mod=read('lib/genesis-g8/founder-command-centre.ts');
const repo=read('lib/founder-dashboard/repository.ts');
const page=read('app/dashboard/page.tsx');
const css=read('app/globals.css');
const mig=read('supabase/migrations/0120_genesis_g81_release18_founder_intelligence_command_centre.sql');
const docs=read('GENESIS-G8.1-RELEASE18-FOUNDER-INTELLIGENCE-COMMAND-CENTRE.md');
const index=read('lib/genesis-g8/index.ts');
const vercel=fs.existsSync(path.join(root,'vercel.json'))?read('vercel.json'):'';
const checks=[
 ['R18 version',mod.includes('G8.1-R18-FOUNDER-COMMAND-CENTRE-1.0')],
 ['read only command module',!/responses\.create|generateStructured|insert_genesis_g8_truth_snapshot/i.test(mod)],
 ['compact aggregate RPC',mod.includes('genesis_g8_founder_intelligence_snapshot')&&mig.includes('returns jsonb')],
 ['latest immutable Truth used',mig.includes('distinct on (s.entity_id)')&&mig.includes('order by s.entity_id,s.calculated_at desc')],
 ['active rejected filtering',mig.includes("e.status='ACTIVE'")&&mig.includes("HUMAN_REJECTED")],
 ['entity type health',mig.includes('entity_type_health')&&page.includes('Intelligence by entity')],
 ['overall Truth displayed',page.includes('Overall Truth Index')&&page.includes('averageTruthIndex')],
 ['confidence displayed',page.includes('Confidence')&&page.includes('averageConfidence')],
 ['coverage displayed',page.includes('Coverage')&&page.includes('averageCoverage')],
 ['evidence provenance mix',mig.includes('KNOWLEDGE_INTELLIGENCE')&&mig.includes('DISCOVERY_INTELLIGENCE')&&page.includes('Knowledge + Discovery')],
 ['retrieval metrics',mig.includes('genesis_g8_knowledge_retrieval_events')&&page.includes('Knowledge hit rate')],
 ['campaign reuse metrics',mig.includes('genesis_g8_campaign_knowledge_links')&&page.includes('Knowledge reuse')],
 ['repair pressure',mig.includes('genesis_g8_discovery_repair_queue')&&page.includes('Blocking repairs')],
 ['background refresh metrics',mig.includes('genesis_g8_background_refresh_events')&&page.includes('refreshes scheduled')],
 ['capacity reads R17 decision',mod.includes('decideGenesisG8Capacity')&&mod.includes('readGenesisG8CapacitySnapshot')],
 ['Truth gain efficiency shown',page.includes('Truth gain today')&&page.includes('truthGainPerRepairCall')],
 ['attention human review',mig.includes("'HUMAN_REVIEW'")&&page.includes('Where your judgement matters')],
 ['attention blocking repair',mig.includes("'BLOCKING_REPAIR'")],
 ['attention demand low truth',mig.includes("'HIGH_DEMAND_LOW_TRUTH'")],
 ['industry truth cards',mig.includes("entity_type='industry'")&&page.includes('Industry Truth Index')],
 ['founder dashboard fails open',repo.includes('getGenesisG8FounderCommandCentre(rangeDays).catch')],
 ['existing review controls retained',page.includes('value="APPROVE"')&&page.includes('value="CORRECT"')&&page.includes('value="MORE_RESEARCH"')&&page.includes('value="REJECT"')],
 ['service role only RPC',mig.includes('revoke all on function')&&mig.includes('grant execute on function')&&mig.includes('to service_role')],
 ['public index exports R18',index.includes('export * from "./founder-command-centre"')],
 ['responsive command centre styling',css.includes('founder-intelligence-hero')&&css.includes('founder-industry-grid')],
 ['docs forbid mutation',docs.includes('never mutate Truth Index')||docs.includes('never mutate Truth Index'.replace('never','never'))],
 ['no R18 cron',!vercel.includes('founder_intelligence_snapshot')&&!vercel.includes('founder-command-centre')],
];
let failed=0; for(const [name,ok] of checks){console.log(`${ok?'✓':'✗'} ${name}`);if(!ok)failed++;}
console.log(`\nGenesis G8.1 R18 validation: ${checks.length-failed}/${checks.length} passed`); if(failed)process.exit(1);
