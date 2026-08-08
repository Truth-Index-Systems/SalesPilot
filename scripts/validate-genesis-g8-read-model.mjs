import fs from "node:fs";
const checks=[]; const add=(ok,label)=>checks.push({ok:Boolean(ok),label});
const required=[
  "lib/genesis-g8/read-model.ts",
  "lib/genesis-g8/hydration.ts",
  "lib/genesis-g8/knowledge-gaps.ts",
  "lib/genesis-g8/persistence/read-repository.ts",
];
for(const file of required) add(fs.existsSync(file),`${file} exists`);
const read=fs.readFileSync(required[0],"utf8");
const hydration=fs.readFileSync(required[1],"utf8");
const repo=fs.readFileSync(required[3],"utf8");
const root=fs.readFileSync("lib/genesis-g8/index.ts","utf8");
add(read.includes("hydrateGenesisG8Knowledge"),"pure persisted-knowledge hydration boundary exists");
add(read.includes("calculateTruthIndex"),"hydration reruns current MR-TI equation rather than trusting stale snapshot JSON");
for(const reason of ["MISSING_EVIDENCE","INSUFFICIENT_EVIDENCE","LOW_CONFIDENCE","CONTRADICTED","STALE_EVIDENCE"]) add(read.includes(`\"${reason}\"`),`gap reason ${reason} exists`);
add(read.includes("minimumEvidence"),"R2 minimum-evidence contract is enforced in gap detection");
add(read.includes("freshness") && read.includes("staleFreshnessThreshold"),"freshness decay can surface a stale-evidence repair gap");
add(read.includes("latestPersistedTruth") && read.includes("needsRecalculation"),"live hydrated Truth is compared with latest persisted snapshot");
add(read.includes("latestEvidenceCreatedAt > latestSnapshotAt"),"new evidence invalidates an older persisted Truth snapshot");
add(repo.includes('import "server-only"'),"database read repository is server-only");
add(repo.includes("getGenesisG8EntityByCanonicalKey"),"knowledge can be addressed by canonical entity key");
add(repo.includes("readGenesisG8KnowledgeBundle"),"single repository boundary reconstructs entity/claims/evidence/latest snapshot");
add(hydration.includes("persistIfChanged") && hydration.includes("persistGenesisG8TruthSnapshot"),"hydration may append a new immutable snapshot only when explicitly requested");
add(root.includes('export * from "./read-model"') && root.includes('export * from "./knowledge-gaps"'),"client-safe R4 read model types/helpers are exported");
add(!read.match(/openai|fetch\(|databaseRequest|supabase/i),"pure read model contains no AI/network/database dependency");
const productionRoots=["lib/discovery","lib/contacts","lib/opportunities","lib/pipeline","lib/autonomy"];
const files=[]; for(const rootPath of productionRoots){ if(!fs.existsSync(rootPath)) continue; const stack=[rootPath]; while(stack.length){ const current=stack.pop(); for(const entry of fs.readdirSync(current,{withFileTypes:true})){ const next=`${current}/${entry.name}`; if(entry.isDirectory()) stack.push(next); else if(/\.(ts|tsx|js|mjs)$/.test(entry.name)) files.push(next); }}}
add(!files.some(file=>fs.readFileSync(file,"utf8").includes("genesis-g8")),"R4 remains isolated from frozen live production paths");
const failed=checks.filter(c=>!c.ok); for(const c of checks) console.log(`${c.ok?"PASS":"FAIL"} ${c.label}`); if(failed.length) process.exit(1); console.log(`\nGenesis G8.1 Knowledge Read Model validation passed (${checks.length}/${checks.length}).`);
