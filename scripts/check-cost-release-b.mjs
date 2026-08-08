import fs from 'node:fs';
const checks=[
 ['lib/ai/cost-optimisation.ts','stableFingerprint'],
 ['lib/intelligence/model-router.ts','COST_SAFE_DEFAULT'],
 ['lib/discovery/openai.ts','search_context_size: "low"'],
 ['lib/contacts/openai.ts','search_context_size:"low"'],
 ['lib/engagement/commercial-reasoning-openai.ts','compactContext'],
 ['lib/engagement/outreach-generation-openai.ts','compactContext'],
 ['lib/engagement/self-review-openai.ts','compactContext'],
];
for(const [file,text] of checks){const content=fs.readFileSync(file,'utf8');if(!content.includes(text))throw new Error(`${file} missing ${text}`)}
for(const file of ['lib/engagement/commercial-reasoning-openai.ts','lib/engagement/outreach-generation-openai.ts','lib/engagement/self-review-openai.ts']){if(fs.readFileSync(file,'utf8').includes('web_search_preview'))throw new Error(`${file} must not use web search`)}
console.log('MarketRoute AI Cost Optimisation Release B passed');
