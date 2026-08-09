import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
const root=process.cwd(); const read=(p)=>fs.readFileSync(path.join(root,p),"utf8"); const exists=(p)=>fs.existsSync(path.join(root,p));
const src=read("lib/genesis-t8/mathematics/commercial-coherence.ts");
let pass=0,fail=0; const check=(name,ok)=>{if(ok){pass++;console.log("PASS",name)}else{fail++;console.log("FAIL",name)}};
check("R4 specification exists",exists("GENESIS-T8-CE-R2-R4-COMMERCIAL-COHERENCE-OPPORTUNITY-REALISATION.md"));
check("R4 version explicit",src.includes('GENESIS_T8_COMMERCIAL_COHERENCE_VERSION = "1.0.0"'));
check("R4 build identity explicit",src.includes('GENESIS_T8_CE_R2_R4_BUILD = "R4-BUILD1"'));
check("reinforcement groups are semantic strings",src.includes("reinforcementGroupKey: string"));
check("no numeric reinforcement weight field",!/(reinforcementWeight|importance|weight|multiplier)\s*:\s*number/.test(src));
check("within-group max is implemented",src.includes("Math.max(...values.map(clamp01))"));
check("independent group compounding implemented",src.includes("complement *= 1 - groupStrength"));
check("bounded reinforcement law",src.includes("INDEPENDENT_GROUPS_REINFORCE_WITH_BOUNDED_DIMINISHING_RETURNS"));
check("constraint pressure composes limiting and contradiction",src.includes("composeConstraintPressure"));
check("commercial coherence depends on support and pressure",src.includes("commercialCoherenceFromSupportAndPressure"));
check("non-survivors get zero coherence",src.includes('propagation.viability === "SURVIVES" ? commercialCoherenceFromSupportAndPressure'));
check("commercial stability uses nearest boundary",src.includes("minimumBoundaryMargin"));
check("nearest failure boundary ids exposed",src.includes("nearestFailureBoundaryConstraintIds"));
check("knowledge sufficiency is conservative",src.includes("Math.min(...knowledgeByGroup)"));
check("reasoning confidence separate",src.includes("reasoningConfidence"));
check("contact states categorical",["APPROPRIATE","PLAUSIBLE","UNKNOWN","INAPPROPRIATE"].every(x=>src.includes(`"${x}"`)));
check("route states categorical",["DIRECT","INDIRECT","WEAK","UNKNOWN","BLOCKED"].every(x=>src.includes(`"${x}"`)));
check("route target modes categorical",["PERSON","ORGANISATION","INTERMEDIARY"].every(x=>src.includes(`"${x}"`)));
check("no numeric contact fit contract",!/(contactScore|contactWeight|contactConfidence|contactProbability|contactFit)\s*:\s*number/.test(src));
check("no numeric route fit contract",!/(routeScore|routeWeight|routeConfidence|routeProbability|routeFit)\s*:\s*number/.test(src));
check("commercial elimination dominates realisation",src.includes('if (commercial.viability === "ELIMINATED")'));
check("commercial unresolved dominates realisation",src.includes('if (commercial.viability === "UNRESOLVED")'));
check("blocked route creates stranded opportunity",src.includes('route.state === "BLOCKED"'));
check("organisation route may work without named contact",src.includes('route.targetMode !== "PERSON"'));
check("inappropriate contact strands person route",src.includes('contact.state === "INAPPROPRIATE"'));
check("unknown route stays unresolved",src.includes('route.state === "UNKNOWN"'));
check("R4 exported from mathematics-local barrel",read("lib/genesis-t8/mathematics/index.ts").includes('export * from "./commercial-coherence"'));
check("frozen CE-R1 root barrel remains free of R4 export",!read("lib/genesis-t8/index.ts").includes("commercial-coherence"));
check("no OpenAI import",!/from\s+["']openai["']/.test(src));
check("no app/UI imports",!/from\s+["'](?:@\/app|@\/components|next\/|react)/.test(src));
for (const manifestPath of ["docs/genesis-t8/GENESIS-T8-CE-R1-CKR-1.0.0-FREEZE-MANIFEST.json","docs/genesis-t8/TI-2.1.8-FREEZE-MANIFEST.json"]) {
  check(`${manifestPath} exists`,exists(manifestPath));
  if(exists(manifestPath)){
    const manifest=JSON.parse(read(manifestPath)); const entries=manifest.kernelFiles??manifest.files??{}; const bad=[];
    for(const [rel,expected] of Object.entries(entries)){const abs=path.join(root,rel); if(!fs.existsSync(abs)||crypto.createHash("sha256").update(fs.readFileSync(abs)).digest("hex")!==expected)bad.push(rel)}
    check(`${manifestPath} matches`,bad.length===0);
  }
}
console.log(`\nGenesis T8 CE-R2 R4 Commercial Coherence static: ${pass}/${pass+fail} passed.`); if(fail)process.exit(1);
