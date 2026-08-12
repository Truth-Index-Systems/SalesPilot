import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const root=process.cwd(); const read=(p)=>fs.readFileSync(path.join(root,p),"utf8"); const exists=(p)=>fs.existsSync(path.join(root,p));
const src=read("lib/genesis-t8/mathematics/constraint-mathematics.ts");
let pass=0,fail=0; const check=(name,ok)=>{if(ok){pass++;console.log("PASS",name)}else{fail++;console.log("FAIL",name)}};
check("R2 specification exists",exists("GENESIS-T8-CE-R2-R2-CONSTRAINT-MATHEMATICS.md"));
check("constraint mathematics TFR1 version explicit",src.includes('GENESIS_T8_CONSTRAINT_MATHEMATICS_VERSION = "1.1.0-TFR1"'));
check("forensic build identity explicit",src.includes('GENESIS_T8_CE_R2_R2_BUILD = "FORENSIC-BUILD2"'));
check("semantic polarity is categorical",src.includes('"SUPPORTS_REALITY"')&&src.includes('"OPPOSES_REALITY"')&&src.includes('"UNKNOWN"'));
check("Truth input includes support channel",src.includes("supportStrength: number"));
check("Truth input includes contradiction channel",src.includes("contradictionStrength: number"));
check("Truth input includes evidence sufficiency",src.includes("evidenceSufficiency: number"));
check("uncalibrated probability input absent",!src.includes("probability: number"));
check("TI truth input includes coverage",src.includes("coverage: number"));
check("TI contradiction severity consumed",src.includes("contradictionSeverity: number"));
check("truth signal is support minus contradiction",src.includes("support - contradiction"));
check("uncalibrated evidence cannot masquerade as probability",src.includes("UNCALIBRATED_EVIDENCE_IS_NEVER_CONSUMED_AS_PROBABILITY"));
check("knowledge equation is coverage times evidence sufficiency",src.includes("clamp01(coverage) * clamp01(evidenceSufficiency)"));
check("boundary exposes elimination support",src.includes("boundaryEliminationSupport"));
check("boundary does not directly eliminate reality",src.includes("NOT itself an elimination decision"));
check("limiting pressure explicit",src.includes("limitingPressure"));
check("support strength explicit",src.includes("supportStrength"));
check("unknown has zero force",src.includes("UNKNOWN_CONSTRAINTS_HAVE_ZERO_VIABILITY_FORCE"));
check("contradiction passes TI severity unchanged",src.includes("TI_CONTRADICTION_SEVERITY_IS_PRESERVED_WITHOUT_RECALCULATION"));
check("commercial dependency deferred to R3",src.includes("COMMERCIAL_DEPENDENCY_WEIGHTING_IS_DEFERRED_TO_R3_PROPAGATION"));
check("no arbitrary primitive commercial weights",src.includes("NO_ARBITRARY_COMMERCIAL_WEIGHTS_IN_PRIMITIVE_CONSTRAINT_MATH"));
check("AI numeric weight absent",!/(commercialWeight|importanceWeight|fitWeight)\s*[:=]/.test(src));
check("runtime bounds validate TI values",src.includes("TI_${name.toUpperCase()}_BOUND"));
check("applicable semantic assertion requires TI truth",src.includes("APPLICABLE_POLARITY_REQUIRES_TI_TRUTH"));
check("mathematics has no OpenAI import",!/from\s+["']openai["']/.test(src));
check("mathematics has no app import",!/from\s+["'](?:@\/app|@\/components|next\/|react)/.test(src));

for (const manifestPath of ["docs/genesis-t8/GENESIS-T8-CE-R1-CKR-1.0.0-FREEZE-MANIFEST.json","docs/genesis-t8/TI-2.1.8-FREEZE-MANIFEST.json"]) {
  check(`${manifestPath} exists`,exists(manifestPath));
  if(exists(manifestPath)){
    const manifest=JSON.parse(read(manifestPath)); const entries=manifest.kernelFiles??manifest.files??{}; const bad=[];
    for(const [rel,expected] of Object.entries(entries)){const abs=path.join(root,rel); if(!fs.existsSync(abs)||crypto.createHash("sha256").update(fs.readFileSync(abs)).digest("hex")!==expected)bad.push(rel)}
    check(`${manifestPath} matches`,bad.length===0);
  }
}
console.log(`\nGenesis T8 CE-R2 R2 Constraint Mathematics static: ${pass}/${pass+fail} passed.`); if(fail)process.exit(1);
