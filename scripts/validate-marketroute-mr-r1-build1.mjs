import fs from 'node:fs';

const entry=fs.readFileSync('lib/integrations/genesis-t8/marketroute-seller-entry.ts','utf8');
const worker=fs.readFileSync('lib/intelligence/business-analysis-worker.ts','utf8');
let pass=0;
const check=(condition,name)=>{if(!condition){console.error(`FAIL: ${name}`);process.exitCode=1;}else{pass++;}};

check(entry.includes('MARKETROUTE_GENESIS_T8_SELLER_ENTRY_VERSION = "MR-R1-BUILD1-1.0.0"'),'version');
check(entry.includes('marketroute_genesis_t8_seller_entry/v1'),'schema');
check(entry.includes('GENESIS_T8_CE_R1_FREEZE_VERSION'),'CKR provenance');
check(entry.includes('GENESIS_T8_MATHEMATICAL_CONSTITUTION_VERSION'),'UDOSIB provenance');
check(entry.includes('GENESIS_T8_AI_RESEARCH_CONTRACT_VERSION'),'AI research contract provenance');
check(entry.includes('buildAIResearchDirectives'),'ontology-governed research surface');
check(entry.includes('assertEntityIdentityInvariant'),'Genesis entity invariant');
check(entry.includes('resolvedBy: "AI"'),'AI semantic ownership');
check(entry.includes('legacyBusinessDna: envelope.payload'),'compatibility pass-through');
check(!entry.includes('fitScore'),'no fit score in entry');
check(!entry.includes('opportunityScore'),'no opportunity score in entry');
check(!entry.includes('routeScore'),'no route score in entry');
check(!entry.includes('contactScore'),'no contact score in entry');
check(worker.includes('enterMarketRouteSellerUnderstanding'),'worker wired to Genesis entry');
check(worker.indexOf('enterMarketRouteSellerUnderstanding(analysis)') < worker.indexOf('matchBusinessDnaAgainstGenesisG8(genesisAnalysis.payload)'),'Genesis entry precedes G8 matching');
check(worker.includes('completeBusinessAnalysisJob(id,token,workerToken,finalUrl,pagesRead,genesisAnalysis'),'persistence consumes Genesis-gated payload');
check(!entry.includes('from "@/lib/intelligence/fit-score"'),'Genesis adapter does not depend on legacy fit math');
check(!entry.includes('from "@/lib/genesis-g8/'),'Genesis T8 entry does not depend on G8 reasoning');
check(entry.includes('Semantic canonicalisation remains AI-owned'),'semantic sovereignty documented');
check(entry.includes('No deterministic semantic translation is performed here'),'no semantic leakage documented');

if(process.exitCode) process.exit(process.exitCode);
console.log(`MarketRoute MR-R1 Build 1 static: ${pass}/20 PASS`);
