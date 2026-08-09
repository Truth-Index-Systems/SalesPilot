import fs from "node:fs";
const read=p=>fs.readFileSync(new URL(`../${p}`,import.meta.url),"utf8");
let passed=0; const checks=[];
function check(name,ok){checks.push({name,ok:Boolean(ok)}); if(ok){passed++; console.log(`✓ ${name}`);} else console.error(`FAIL ${name}`);}
const expansion=read("lib/genesis-g8/autonomous-expansion-openai.ts");
const worker=read("lib/genesis-g8/autonomous-expansion-worker.ts");
const workload=read("lib/ai/workload-profile.ts");

check("research version bumped to Build 8.3.3", expansion.includes('B8.3.3-BREADTH-DECOMPOSED-3.0'));
check("request scope version fenced to v3", expansion.includes('genesis-g82-expansion-v3:'));
check("completed checkpoint recovery version fenced", expansion.includes('request_scope=like.genesis-g82-expansion-v3:*'));
check("three-company breadth cap retained", expansion.includes('GENESIS_G82_EXPANSION_COMPANIES_PER_CALL = 3'));
check("company evidence capped at four in Zod", expansion.includes('evidence: z.array(EvidenceSchema).min(2).max(4)'));
check("provider evidence array capped at four", expansion.includes('evidence: { type: "array", maxItems: 4, items: evidenceJson }'));
check("evidence excerpts bounded", expansion.includes('excerpt: z.string().min(1).max(420)'));
check("summary bounded", expansion.includes('summary: z.string().max(320)'));
check("expansion company schema excludes contacts", !/properties:\s*\{[\s\S]*?contacts:\s*\{/.test(expansion.match(/const expansionJsonSchema = \{[\s\S]*?\n\} as const;/)?.[0]??""));
check("expansion company schema excludes routes", !/properties:\s*\{[\s\S]*?routes:\s*\{/.test(expansion.match(/const expansionJsonSchema = \{[\s\S]*?\n\} as const;/)?.[0]??""));
check("prompt explicitly delegates contacts and routes", expansion.includes('Do not research or return contacts, people, email addresses, LinkedIn profiles, routes, forms, outreach paths or decision makers'));
check("prompt restricts breadth claim keys", expansion.includes('expansion evidence may use only identity, canonical_domain, current_operation, industry, sector or geography'));
check("prompt limits evidence to 2-4", expansion.includes('Exactly 2-4 high-value company-level evidence items per company'));
check("prompt limits excerpt target", expansion.includes('Keep excerpts <= 280 characters'));
check("output completion is explicit priority", expansion.includes('Optimise for completion, not richness'));
check("expansion output floor reduced from legacy 6000", expansion.includes('max_output_tokens:Math.max(profile.maxOutputTokens,4500)'));
check("workload output target is 4500", /GENESIS_G82_EXPANSION:\s*\{[\s\S]*?maxOutputTokens:\s*4_500/.test(workload));
check("workload evidence limit is four", /GENESIS_G82_EXPANSION:\s*\{[\s\S]*?evidenceLimit:\s*4/.test(workload));
check("workload depth reduced to four", /GENESIS_G82_EXPANSION:\s*\{[\s\S]*?depth:\s*4/.test(workload));
check("workload prompt version is v3 breadth", workload.includes('promptVersion: "genesis-g82-expansion/v3-breadth-decomposed"'));
check("workload cache key version bumped", workload.includes('cacheKey: "marketroute:genesis-g82:expansion:v3"'));
check("worker does not persist contact entities from expansion", !worker.includes('::contact::'));
check("worker does not persist route entities from expansion", !worker.includes('::route::'));
check("worker explicitly returns zero depth entities", worker.includes('return {companies:1,contacts:0,routes:0};'));
check("worker delegates depth downstream", worker.includes('delegated to downstream MR-TI-2 repair/research workers'));

console.log(`\nBuild 8.3.3 expansion decomposition: ${passed}/${checks.length} passed`);
if(passed!==checks.length) process.exit(1);
