import fs from 'node:fs';
import path from 'node:path';

const root = new URL('../', import.meta.url).pathname;
const activeRoots = ['app','features','lib'];
const legacyFrozen = new Set([
  'lib/engagement/commercial-reasoning-openai.ts',
  'lib/engagement/outreach-generation-openai.ts',
  'lib/engagement/self-review-openai.ts',
]);
const allowedProviderOwner = 'lib/ai/background-response.ts';
const files=[];
function walk(dir){
  for(const ent of fs.readdirSync(path.join(root,dir),{withFileTypes:true})){
    const rel=path.join(dir,ent.name).replaceAll('\\','/');
    if(ent.isDirectory()) walk(rel);
    else if(/\.(ts|tsx|js|mjs)$/.test(ent.name)) files.push(rel);
  }
}
for(const dir of activeRoots) walk(dir);
let failed=0;
const pass=(name,ok)=>{console.log(`${ok?'PASS':'FAIL'} ${name}`); if(!ok) failed++;};
for(const file of files){
  const s=fs.readFileSync(path.join(root,file),'utf8');
  const direct=/await\s+fetch\s*\(\s*(?:ENDPOINT|["']https:\/\/api\.openai\.com\/v1\/responses)/.test(s);
  if(!direct) continue;
  if(file===allowedProviderOwner){ pass(`${file} is the sole active provider transport owner`,true); continue; }
  if(legacyFrozen.has(file)){ pass(`${file} classified LEGACY / REMOVE and is outside the scheduler`,true); continue; }
  pass(`${file} must not call Responses API directly`,false);
}
const scheduler=fs.readFileSync(path.join(root,'lib/pipeline/scheduler.ts'),'utf8');
for(const legacy of ['runNextCommercialReasoning','runNextOutreachGeneration','runNextEngagementSelfReview']) pass(`${legacy} legacy worker not scheduler-driven`,!scheduler.includes(legacy));
const gateway=fs.readFileSync(path.join(root,'lib/ai/structured-response-gateway.ts'),'utf8');
pass('structured response gateway has no hidden OpenAI repair request',!gateway.includes('api.openai.com')&&!/fetch\s*\(/.test(gateway)&&!gateway.includes('MODEL_REPAIR'));
const bg=fs.readFileSync(path.join(root,'lib/ai/background-response.ts'),'utf8');
pass('background submission is asynchronous',bg.includes('background: true'));
pass('background response is retained for reliable retrieval',bg.includes('store: true'));
pass('background provider response id is checkpointed',bg.includes('responseId: id'));
pass('background pending is a resumable control signal',bg.includes('OpenAIBackgroundPendingError'));
if(failed){console.error(`\n${failed} Speed R1 invariant(s) failed`);process.exit(1)}
console.log('\nSpeed R1 timeout-elimination invariants passed');
