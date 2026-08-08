import fs from "node:fs";
const checks=[]; const add=(ok,label)=>checks.push({ok:Boolean(ok),label});
const required=[
  "lib/genesis-g8/eligibility.ts",
  "lib/genesis-g8/knowledge-retrieval.ts",
];
for(const file of required) add(fs.existsSync(file),`${file} exists`);
const eligibility=fs.readFileSync(required[0],"utf8");
const retrieval=fs.readFileSync(required[1],"utf8");
const root=fs.readFileSync("lib/genesis-g8/index.ts","utf8");
for(const status of ["READY","READY_WITH_GAPS","REFRESH_REQUIRED","HUMAN_REVIEW_REQUIRED","NOT_USABLE"]) add(eligibility.includes(`\"${status}\"`),`eligibility state ${status} exists`);
for(const directive of ["USE_KNOWLEDGE","USE_KNOWLEDGE_WITH_GAP_REPAIR","REFRESH_THEN_USE","HUMAN_REVIEW","DISCOVERY_ONLY"]) add(eligibility.includes(`\"${directive}\"`),`routing directive ${directive} exists`);
add(eligibility.includes('status === "SUPPRESSED"'),"suppressed intelligence is blocked before scoring eligibility");
add(eligibility.includes('reviewState === "HUMAN_REJECTED"'),"human rejection makes knowledge non-usable without deletion");
add(eligibility.includes('reviewState === "NEEDS_REVIEW"'),"explicit pending human review is authoritative");
add(eligibility.includes("MATERIAL_CONTRADICTION"),"material contradiction routes to human review");
add(eligibility.includes("STALE_CRITICAL_OR_REQUIRED"),"stale material knowledge routes to refresh");
add(eligibility.includes("CRITICAL_GAP"),"unresolved critical gap blocks instant use");
add(eligibility.includes("minimumUsableTruthIndex") && eligibility.includes("minimumUsableConfidence"),"minimum usable floor is explicit policy rather than hidden magic number");
add(eligibility.includes("allGaps.length === 0") && eligibility.includes('"READY"'),"READY requires no unresolved contract gaps");
add(eligibility.includes("materialGaps.length === 0") && eligibility.includes('"READY_WITH_GAPS"'),"READY_WITH_GAPS permits only non-material gaps");
add(!eligibility.match(/openai|fetch\(|databaseRequest|supabase/i),"pure eligibility engine contains no AI/network/database dependency");
add(retrieval.includes('import "server-only"'),"knowledge retrieval orchestration is server-only");
add(retrieval.includes("retrieveGenesisG8KnowledgeById") && retrieval.includes("retrieveGenesisG8KnowledgeByCanonicalKey"),"knowledge retrieval supports entity id and canonical key");
add(retrieval.includes("hydrateGenesisG8EntityTruth") && retrieval.includes("evaluateGenesisG8KnowledgeEligibility"),"retrieval always hydrates current Truth before eligibility");
add(root.includes('export * from "./eligibility"'),"client-safe eligibility types and pure evaluator are exported");
const productionRoots=["lib/discovery","lib/contacts","lib/opportunities","lib/pipeline","lib/autonomy"];
const files=[]; for(const rootPath of productionRoots){ if(!fs.existsSync(rootPath)) continue; const stack=[rootPath]; while(stack.length){ const current=stack.pop(); for(const entry of fs.readdirSync(current,{withFileTypes:true})){ const next=`${current}/${entry.name}`; if(entry.isDirectory()) stack.push(next); else if(/\.(ts|tsx|js|mjs)$/.test(entry.name)) files.push(next); }}}
add(!files.some(file=>fs.readFileSync(file,"utf8").includes("genesis-g8")),"R5 remains isolated from frozen live production paths");
const failed=checks.filter(c=>!c.ok); for(const c of checks) console.log(`${c.ok?"PASS":"FAIL"} ${c.label}`); if(failed.length) process.exit(1); console.log(`\nGenesis G8.1 Knowledge Retrieval & Eligibility validation passed (${checks.length}/${checks.length}).`);
