import fs from 'node:fs';
const plan=fs.readFileSync('lib/discovery/search-plan.ts','utf8');
const service=fs.readFileSync('features/discovery/company-discovery.service.ts','utf8');
const forbidden=['api.openai.com','reserveAiRequest','parseStructuredAiResponse','fetch('];
for(const token of forbidden){
  if(plan.includes(token)) throw new Error(`Search planning still contains external/AI dependency: ${token}`);
}
if(!plan.includes('deterministic market-search specification')) throw new Error('Deterministic planning contract missing');
const planningIndex=service.indexOf('p_stage:"PLANNING"');
const searchIndex=service.indexOf('p_stage:"SEARCHING"');
const discoverIndex=service.indexOf('discoverCompanies({');
if(!(planningIndex>=0 && searchIndex>planningIndex && discoverIndex>searchIndex)) throw new Error('Company Discovery phase order is invalid');
console.log('G4 deterministic search planning validation passed.');
