import fs from 'node:fs';
const read=p=>fs.readFileSync(p,'utf8');
const expansion=read('lib/genesis-g8/autonomous-expansion-openai.ts');
const repair=read('lib/genesis-g8/discovery-repair-openai-v2.ts');
const canon=read('lib/genesis-g8/ai-canonicalisation.ts');
const worker=read('lib/genesis-g8/autonomous-expansion-worker.ts');
const repairWorker=read('lib/genesis-g8/discovery-repair-worker.ts');
const contract=read('lib/genesis-g8/truth-v2/ai/repair-contract.ts');
const checks=[
  ['expansion no generic parser',!expansion.includes('parseStructuredAiResponse')&&!expansion.includes('safeStructuredAiError')],
  ['repair no generic parser',!repair.includes('parseStructuredAiResponse')&&!repair.includes('safeStructuredAiError')],
  ['expansion no zod semantic parser',!expansion.includes('from "zod"')&&!expansion.includes('.parse(')],
  ['repair contract no zod parser',!contract.includes('from "zod"')&&!contract.includes('.parse(')],
  ['AI canonicalisation exists',canon.includes('canonicaliseWithAi')&&canon.includes('ROLE: Canonical data editor')],
  ['canonicaliser does no hidden web research',!canon.includes('web_search_preview')],
  ['canonicaliser forbids invention',canon.includes('Do not browse and do not invent facts')],
  ['canonicaliser uses strict provider schema',canon.includes('type: "json_schema"')&&canon.includes('strict: true')],
  ['local layer is hard gate only',expansion.includes('hardAcceptGenesisG82Expansion')&&contract.includes('hardAcceptMrTi2ClaimRepairResult')],
  ['no deterministic JSON repair in G8 path',!expansion.includes('closeTruncatedJson')&&!repair.includes('closeTruncatedJson')&&!canon.includes('closeTruncatedJson')],
  ['research completion recorded before canonicalisation',expansion.indexOf('completeAiRequest({ledgerId:reservation.ledgerId,ok:true')<expansion.indexOf('canonicaliseWithAi({apiKey,model,organisationId')],
  ['expansion request scope fenced v4',expansion.includes('genesis-g82-expansion-v4:')&&expansion.includes('request_scope=like.genesis-g82-expansion-v4:*')],
  ['repair version bumped',repair.includes('B8.3.4-AI-CANONICALISATION')],
  ['granular expansion evidence persistence',worker.includes('Expansion evidence skipped at hard persistence boundary')],
  ['granular expansion company persistence',worker.includes('Expansion company skipped at hard persistence boundary')],
  ['batch only fails if nothing safe persists',worker.includes('GENESIS_G82_EXPANSION_NOTHING_SAFE_TO_PERSIST')],
  ['granular repair evidence persistence',repairWorker.includes('Repair evidence skipped at hard persistence boundary')],
  ['MR-TI-2 maths remains deterministic downstream',worker.includes('hydrateGenesisG8EntityTruth')&&repairWorker.includes('calculateAndPersistMrTi2Truth')],
  ['canonicalisation itself governed',canon.includes('reserveAiRequest')&&canon.includes('completeAiRequest')],
  ['canonicalisation resumable',canon.includes('fetchResumableOpenAIResponse')&&canon.includes('AI_CANONICALISATION')],
];
let ok=0;for(const [name,pass] of checks){console.log(`${pass?'PASS':'FAIL'} ${name}`);if(pass)ok++;}
console.log(`\n${ok}/${checks.length} checks passed`);if(ok!==checks.length)process.exit(1);
