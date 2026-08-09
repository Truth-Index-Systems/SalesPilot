import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
const root=process.cwd(); const read=(p)=>fs.readFileSync(path.join(root,p),"utf8"); const exists=(p)=>fs.existsSync(path.join(root,p));
const src=read("lib/genesis-t8/mathematics/constraint-propagation.ts");
let pass=0,fail=0; const check=(name,ok)=>{if(ok){pass++;console.log("PASS",name)}else{fail++;console.log("FAIL",name)}};
check("R3 specification exists",exists("GENESIS-T8-CE-R2-R3-CONSTRAINT-PROPAGATION.md"));
check("propagation version explicit",src.includes('GENESIS_T8_CONSTRAINT_PROPAGATION_VERSION = "1.0.0"'));
check("R3 build identity explicit",src.includes('GENESIS_T8_CE_R2_R3_BUILD = "R3-BUILD1"'));
check("four categorical dependency modes",["REQUIRED","LIMITING","SUPPORTING","INFORMATIONAL"].every(x=>src.includes(`"${x}"`)));
check("dependency has no numeric weight field",!/(weight|importance|attenuation)\s*:\s*number/.test(src));
check("AI semantic ownership law",src.includes("AI_OWNS_DEPENDENCY_SEMANTICS"));
check("numeric dependency weights forbidden",src.includes("DEPENDENCIES_ARE_CATEGORICAL_NOT_NUMERIC_WEIGHTS"));
check("reasoning graph DAG law",src.includes("REASONING_DEPENDENCY_GRAPH_IS_ACYCLIC"));
check("cycle runtime rejection",src.includes("DEPENDENCY_CYCLE"));
check("duplicate semantic dependency rejection",src.includes("DUPLICATE_DEPENDENCY_SEMANTICS"));
check("required mode carries boundary elimination",src.includes("boundaryElimination: source.effectiveBoundaryEliminationSupport"));
check("limiting mode does not carry support",src.includes('case "LIMITING"'));
check("supporting mode does not carry limiting",src.includes('case "SUPPORTING"'));
check("informational mode has zero viability channels",src.includes('case "INFORMATIONAL"'));
check("knowledge deficit propagation explicit",src.includes("effectiveKnowledgeDeficit"));
check("contradiction relevance equation documented",src.includes("x_relevant = x_TI * I(active_dependency_path)"));
check("TI contradiction magnitude preserved",src.includes("TI_RETAINS_OWNERSHIP_OF_CONTRADICTION_MAGNITUDE"));
check("max lattice aggregation implemented",src.includes("Math.max")&&src.includes("MAX_LATTICE_AGGREGATION_PREVENTS_DUPLICATE_PATH_DOUBLE_COUNTING"));
check("no summation-based propagation",!/(reduce\([^\n]+\+|\+=\s*propagated\.)/.test(src));
check("boundary viability has SURVIVES",src.includes('"SURVIVES"'));
check("boundary viability has ELIMINATED",src.includes('"ELIMINATED"'));
check("boundary viability has UNRESOLVED",src.includes('"UNRESOLVED"'));
check("contradiction can render boundary unresolved",src.includes("contradiction >= Math.abs(margin)"));
check("support cannot override boundary law",src.includes("SUPPORTING_OR_LIMITING_FORCE_CAN_NEVER_OVERRIDE_A_VIOLATED_BOUNDARY"));
check("R3 exported from mathematics-local barrel",read("lib/genesis-t8/mathematics/index.ts").includes('export * from "./constraint-propagation"'));
check("frozen CE-R1 root barrel remains free of R3 export",!read("lib/genesis-t8/index.ts").includes("constraint-propagation"));
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
console.log(`\nGenesis T8 CE-R2 R3 Constraint Propagation static: ${pass}/${pass+fail} passed.`); if(fail)process.exit(1);
