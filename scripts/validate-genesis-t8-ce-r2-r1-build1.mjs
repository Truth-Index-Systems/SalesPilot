import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root,p),"utf8");
const exists = (p) => fs.existsSync(path.join(root,p));
const mathDir = "lib/genesis-t8/mathematics";
const files = {
  constitution: read(`${mathDir}/constitution.ts`),
  opportunity: read(`${mathDir}/opportunity.ts`),
  constraints: read(`${mathDir}/constraints.ts`),
  state: read(`${mathDir}/state.ts`),
  research: read(`${mathDir}/research.ts`),
  pipeline: read(`${mathDir}/pipeline.ts`),
  input: read(`${mathDir}/input-contract.ts`),
  explainability: read(`${mathDir}/explainability.ts`),
  index: read(`${mathDir}/index.ts`),
};
let pass=0,fail=0; const check=(name,ok)=>{ if(ok){pass++; console.log("PASS",name)} else {fail++; console.log("FAIL",name)} };
const all = Object.values(files).join("\n");

check("R1 Build 1 specification exists", exists("GENESIS-T8-CE-R2-R1-BUILD1-MATHEMATICAL-CONSTITUTION.md"));
check("separate CE-R2 mathematics namespace exists", exists(`${mathDir}/index.ts`));
check("CE-R2 release identity explicit", files.constitution.includes('GENESIS_T8_CE_R2_RELEASE = "CE-R2"'));
check("mathematical constitution version explicit", files.constitution.includes('GENESIS_T8_MATHEMATICAL_CONSTITUTION_VERSION = "1.0.0"'));
check("commercial realities discovered not invented", files.constitution.includes("COMMERCIAL_REALITIES_ARE_DISCOVERED_NOT_INVENTED"));
check("AI semantic sovereignty preserved", files.constitution.includes("AI_OWNS_SEMANTIC_INTERPRETATION"));
check("truth precedes commercial reasoning", files.constitution.includes("TRUTH_QUALIFICATION_PRECEDES_COMMERCIAL_REASONING"));
check("UDOSIB owns deterministic constraint reasoning", files.constitution.includes("UDOSIB_OWNS_DETERMINISTIC_CONSTRAINT_REASONING"));
check("unknown reduces certainty not possibility", files.constitution.includes("UNKNOWNS_REDUCE_CERTAINTY_NOT_POSSIBILITY"));
check("commercial significance explicitly local", files.constitution.includes("COMMERCIAL_SIGNIFICANCE_IS_LOCAL_TO_SELLER_OFFERING_TARGET_AND_REASONING_PATH"));
check("survival precedes ordering", files.constitution.includes("OPPORTUNITY_ORDERING_FOLLOWS_SURVIVAL_NOT_PRECEDES_IT"));
check("opportunity definition frozen", files.opportunity.includes("A truth-qualified commercial reality between a seller, an offering and a target organisation"));
check("opportunity is relational not intrinsic", files.opportunity.includes("OPPORTUNITY_IS_RELATIONAL_NOT_INTRINSIC"));
check("seller offering target truth time define context", files.opportunity.includes("SELLER_OFFERING_TARGET_TRUTH_AND_TIME_DEFINE_THE_REASONING_CONTEXT"));
check("unknown not false law exists", files.opportunity.includes("UNKNOWN_DOES_NOT_EQUAL_FALSE"));
for (const constraint of ["BOUNDARY","LIMITING","SUPPORTING","UNKNOWN","CONTRADICTORY"]) check(`constraint class ${constraint} exists`, files.constraints.includes(`"${constraint}"`));
check("boundary semantics eliminate only when violated/applicable", files.constraints.includes("violated applicable boundary constraint"));
check("limiting constraint does not independently eliminate", files.constraints.includes("does not by itself eliminate"));
check("supporting cannot override boundary", files.constraints.includes("cannot override a violated boundary constraint"));
check("unknown affects sufficiency/confidence only", files.constraints.includes("leaves possibility unchanged"));
check("contradiction consumes Truth-qualified state", files.constraints.includes("Truth-Engine-qualified contradiction state"));
check("AI constraint contract contains no weight field", !/\b(weight|score|probability|ranking|coherence)\??\s*:/.test(files.constraints));
check("AI constraint cannot use Truth dimension", files.constraints.includes('Exclude<GenesisT8CommercialDimension, "TRUTH">'));
check("AI constraint is structurally validated", files.constraints.includes("assertAIConstraintContractInvariant"));
for (const variable of ["COMMERCIAL_COHERENCE","CAPABILITY_COMPATIBILITY","OPERATIONAL_COMPATIBILITY","TECHNICAL_COMPATIBILITY","CONSTRAINT_PRESSURE","KNOWLEDGE_SUFFICIENCY","REASONING_CONFIDENCE","COMMERCIAL_STABILITY","OPPORTUNITY_CLASSIFICATION"]) check(`state variable ${variable} exists`, files.state.includes(`"${variable}"`));
check("state is derived reasoning not truth", files.state.includes("STATE_VARIABLES_ARE_DERIVED_REASONING_NOT_CANONICAL_KNOWLEDGE"));
check("state must be recalculable", files.state.includes("STATE_VARIABLES_MUST_BE_RECALCULABLE_FROM_CANONICAL_INPUTS"));
check("raw AI output forbidden", files.constitution.includes("NO_RAW_AI_OUTPUT"));
check("prompt text forbidden", files.constitution.includes("NO_PROMPT_TEXT"));
check("provider metadata forbidden", files.constitution.includes("NO_PROVIDER_METADATA"));
check("UI state forbidden", files.constitution.includes("NO_UI_STATE"));
check("database layout forbidden", files.constitution.includes("NO_DATABASE_LAYOUT"));
check("unqualified knowledge forbidden", files.constitution.includes("NO_UNQUALIFIED_KNOWLEDGE"));
check("reasoning input requires truth authority", files.input.includes("truthAuthorityId: string"));
check("reasoning input requires ontology fingerprint", files.input.includes("ontologySemanticFingerprint: string"));
check("reasoning input only takes constraint contracts", files.input.includes("constraintContracts: readonly GenesisT8AIConstraintContract[]"));
check("reality scope mismatch rejected", files.input.includes("REALITY_SCOPE_MISMATCH"));
check("directed research targets decision limiting unknown", files.research.includes("MOST_DECISION_LIMITING_UNKNOWN"));
check("research loops through TI", files.research.includes("TI_QUALIFIES_NEWLY_DISCOVERED_KNOWLEDGE"));
check("UDOSIB recalculates after research", files.research.includes("UDOSIB_RECALCULATES_FROM_THE_UPDATED_TRUTH_QUALIFIED_STATE"));
check("pipeline places AI semantics before UDOSIB", files.pipeline.includes("AI_SEMANTIC_INTERPRETATION") && files.pipeline.includes("DETERMINISTIC_UDOSIB_REASONING"));
check("pipeline ends in grounded AI explanation", files.pipeline.includes("AI_GROUNDED_EXPLANATION"));
check("UDOSIB must not call AI for numeric decisions", files.pipeline.includes("UDOSIB_MUST_NOT_CALL_AI_TO_DECIDE_NUMERIC_OUTPUTS"));
check("explainability trace reaches truth qualification", files.explainability.includes('"TRUTH_QUALIFICATION"'));
check("AI cannot rewrite mathematical causality", files.explainability.includes("AI_MAY_NARRATE_TRACE_BUT_MAY_NOT_REWRITE_MATHEMATICAL_CAUSALITY"));
check("elimination trace required", files.explainability.includes("ELIMINATED_REALITIES_MUST_RETAIN_THE_ELIMINATING_CONSTRAINT_TRACE"));
check("no numeric commercial equation implemented in R1 Build 1", !/Math\.(exp|pow|log|sqrt)\s*\(|\b(?:score|weight)\s*=|commercialCoherence\s*=|constraintPressure\s*=/.test(all));
check("mathematics does not import OpenAI", !/from\s+["']openai["']/.test(all));
check("mathematics does not import application code", !/from\s+["'](?:@\/app|@\/components|next\/|react)/.test(all));
check("mathematics public barrel is local and separate", files.index.includes('export * from "./constitution"') && files.index.includes('export * from "./constraints"'));

// Frozen CE-R1 must remain byte-for-byte intact.
const ckrManifestPath="docs/genesis-t8/GENESIS-T8-CE-R1-CKR-1.0.0-FREEZE-MANIFEST.json";
check("CE-R1 CKR freeze manifest exists", exists(ckrManifestPath));
if (exists(ckrManifestPath)) {
  const manifest=JSON.parse(read(ckrManifestPath)); const bad=[];
  for (const [rel,expected] of Object.entries(manifest.kernelFiles??{})) {
    const abs=path.join(root,rel);
    if(!fs.existsSync(abs) || crypto.createHash("sha256").update(fs.readFileSync(abs)).digest("hex")!==expected) bad.push(rel);
  }
  check("CE-R1 CKR v1 remains byte-for-byte frozen", bad.length===0);
}
const tiManifestPath="docs/genesis-t8/TI-2.1.8-FREEZE-MANIFEST.json";
check("TI-2.1.8 freeze manifest exists", exists(tiManifestPath));
if (exists(tiManifestPath)) {
  const manifest=JSON.parse(read(tiManifestPath)); const bad=[];
  for (const [rel,expected] of Object.entries(manifest.files??{})) {
    const abs=path.join(root,rel);
    if(!fs.existsSync(abs) || crypto.createHash("sha256").update(fs.readFileSync(abs)).digest("hex")!==expected) bad.push(rel);
  }
  check("TI-2.1.8 remains byte-for-byte frozen", bad.length===0);
}

console.log(`\nGenesis T8 CE-R2 R1 Build 1 Mathematical Constitution: ${pass}/${pass+fail} passed.`);
if(fail) process.exit(1);
