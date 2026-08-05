import fs from "node:fs";
import path from "node:path";

const root=process.cwd();
const read=(p)=>fs.readFileSync(path.join(root,p),"utf8");
const required=[
  "lib/opportunities/domain.ts",
  "lib/opportunities/repository.ts",
  "lib/opportunities/builder.ts",
  "supabase/migrations/0029_genesis_g35_phase1_opportunity_domain.sql",
  "docs/genesis-g35/phase1-opportunity-domain.md",
];
for(const file of required){ if(!fs.existsSync(path.join(root,file))) throw new Error(`Missing ${file}`); }
const sql=read(required[3]);
for(const token of ["public.opportunities","public.opportunity_history","sync_opportunity_foundations","OpportunityCreated","opportunity_overview","opportunity_detail"]){
  if(!sql.includes(token)) throw new Error(`Migration missing ${token}`);
}
const scheduler=read("lib/pipeline/scheduler.ts");
if(!scheduler.includes("syncOpportunityFoundations(runId)")) throw new Error("Scheduler does not materialise opportunities");
if(scheduler.indexOf("syncOpportunityFoundations(runId)") < scheduler.indexOf("runNextContactDiscovery")) throw new Error("Opportunity sync must run after contact execution path");
const builder=read("lib/opportunities/builder.ts");
if(/openai|web_search/i.test(builder)) throw new Error("Phase 1 builder must not make AI or web calls");
console.log("Genesis G3.5 Phase 1 opportunity-domain contract passed.");
