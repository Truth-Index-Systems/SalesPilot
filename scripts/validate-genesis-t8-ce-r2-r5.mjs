import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
const root=process.cwd(); const read=(p)=>fs.readFileSync(path.join(root,p),"utf8"); const exists=(p)=>fs.existsSync(path.join(root,p));
const src=read("lib/genesis-t8/mathematics/opportunity-mathematics.ts");
let pass=0,fail=0; const check=(name,ok)=>{if(ok){pass++;console.log("PASS",name)}else{fail++;console.log("FAIL",name)}};
check("R5 specification exists",exists("GENESIS-T8-CE-R2-R5-OPPORTUNITY-MATHEMATICS.md"));
check("R5 version explicit",src.includes('GENESIS_T8_OPPORTUNITY_MATHEMATICS_VERSION = "1.0.0"'));
check("R5 build identity explicit",src.includes('GENESIS_T8_CE_R2_R5_BUILD = "R5-BUILD1"'));
check("realisation precedence exists",src.includes("GENESIS_T8_REALISATION_PRECEDENCE"));
for(const state of ["NOT_VIABLE","COMMERCIAL_REALITY_UNRESOLVED","STRANDED","VIABLE_BUT_UNRESOLVED","ACTIONABLE_WITHOUT_NAMED_CONTACT","ACTIONABLE"]) check(`precedence includes ${state}`,src.includes(`${state}:`));
check("ordering vector includes coherence",src.includes("commercialCoherence: number"));
check("ordering vector includes stability",src.includes("commercialStability: number"));
check("ordering vector includes knowledge",src.includes("knowledgeSufficiency: number"));
check("ordering vector includes reasoning confidence",src.includes("reasoningConfidence: number"));
check("ordering vector includes constraint headroom",src.includes("constraintHeadroom: number"));
check("commercial strength uses minimum",src.includes("Math.min(vector.commercialCoherence, vector.commercialStability, vector.constraintHeadroom)"));
check("decision assurance uses minimum",src.includes("Math.min(vector.knowledgeSufficiency, vector.reasoningConfidence)"));
check("opportunity robustness uses maximin",src.includes("Math.min(commercialStrength(vector), decisionAssurance(vector))"));
check("Pareto dominance implemented",src.includes("paretoDominates"));
check("Pareto requires no worse on every axis",src.includes("const noWorse = av.every"));
check("Pareto requires strictly better axis",src.includes("const strictlyBetter = av.some"));
check("Pareto front construction implemented",src.includes("computeParetoFronts"));
check("realisation precedence sorts first",src.includes("if (a.realisationPrecedence !== b.realisationPrecedence)"));
check("Pareto front sorts second",src.includes("if (a.paretoFront !== b.paretoFront)"));
check("robustness sorts after Pareto",src.includes("a.opportunityRobustness"));
check("canonical id only final tie break",src.includes("return a.opportunityId.localeCompare(b.opportunityId)"));
check("duplicate opportunity ids rejected",src.includes("DUPLICATE_OPPORTUNITY_ID"));
check("duplicate target entities rejected",src.includes("DUPLICATE_TARGET_ENTITY"));
check("weighted score smuggling rejected",src.includes("FORBIDDEN_WEIGHTED_SCORE"));
check("no weighted-average arithmetic",!/(0\.[0-9]+\s*\*\s*(?:vector\.|commercial\.)|(?:vector\.|commercial\.)\w+\s*\*\s*0\.[0-9]+)/.test(src));
check("top N helper exists",src.includes("topOrderedOpportunities"));
check("free tier excluded from maths law",src.includes("APPLICATION_FREE_TIER_POLICY_IS_NOT_PART_OF_MATHEMATICS"));
check("R5 exported from mathematics-local barrel",read("lib/genesis-t8/mathematics/index.ts").includes('export * from "./opportunity-mathematics"'));
check("frozen CE-R1 root barrel remains free of R5 export",!read("lib/genesis-t8/index.ts").includes("opportunity-mathematics"));
check("no OpenAI import",!/from\s+["']openai["']/.test(src));
check("no UI imports",!/from\s+["'](?:@\/app|@\/components|next\/|react)/.test(src));
for (const manifestPath of ["docs/genesis-t8/GENESIS-T8-CE-R1-CKR-1.0.0-FREEZE-MANIFEST.json","docs/genesis-t8/TI-2.1.8-FREEZE-MANIFEST.json"]) {
  check(`${manifestPath} exists`,exists(manifestPath));
  if(exists(manifestPath)){
    const manifest=JSON.parse(read(manifestPath)); const entries=manifest.kernelFiles??manifest.files??{}; const bad=[];
    for(const [rel,expected] of Object.entries(entries)){const abs=path.join(root,rel); if(!fs.existsSync(abs)||crypto.createHash("sha256").update(fs.readFileSync(abs)).digest("hex")!==expected)bad.push(rel)}
    check(`${manifestPath} matches`,bad.length===0);
  }
}
console.log(`\nGenesis T8 CE-R2 R5 Opportunity Mathematics static: ${pass}/${pass+fail} passed.`); if(fail)process.exit(1);
