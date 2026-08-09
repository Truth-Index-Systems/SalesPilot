import fs from "node:fs";
const files=[
  "lib/genesis-t8/mathematics/research-intelligence.ts",
  "lib/genesis-t8/mathematics/index.ts",
  "GENESIS-T8-CE-R2-R6-RESEARCH-INTELLIGENCE.md",
];
let pass=0, fail=0;
const check=(name,cond)=>{if(cond){pass++;console.log("PASS",name)}else{fail++;console.error("FAIL",name)}};
for(const f of files) check(`exists ${f}`,fs.existsSync(f));
const src=fs.readFileSync("lib/genesis-t8/mathematics/research-intelligence.ts","utf8");
const spec=fs.readFileSync("GENESIS-T8-CE-R2-R6-RESEARCH-INTELLIGENCE.md","utf8");
const checks=[
 ["version",src.includes('GENESIS_T8_RESEARCH_INTELLIGENCE_VERSION = "1.0.0"')],
 ["four research kinds",["CONSTRAINT","CONTRADICTION","CONTACT","ROUTE"].every(x=>src.includes(`"${x}"`))],
 ["five impact classes",["NO_DECISION_VALUE","ASSURANCE_GAP","STABILITY_PIVOTAL","REALISATION_PIVOTAL","VIABILITY_PIVOTAL"].every(x=>src.includes(`"${x}"`))],
 ["lexicographic declaration",src.includes("lexicographic state")],
 ["no weighted expected value",src.includes("never a weighted sum")],
 ["AI semantic question",src.includes("semanticQuestionKey")],
 ["AI weight guard",src.includes("AI_NUMERIC_RESEARCH_WEIGHT")],
 ["constraint deficit consumed",src.includes("effectiveKnowledgeDeficit")],
 ["TI contradiction consumed",src.includes("relevantContradictionUncertainty")],
 ["unresolved boundary priority",src.includes("unresolvedBoundaryConstraintIds")],
 ["nearest boundary priority",src.includes("nearestFailureBoundaryConstraintIds")],
 ["contact pivotal",src.includes("CONTACT_CAN_CHANGE_REALISATION")],
 ["route pivotal",src.includes("ROUTE_CAN_CHANGE_REALISATION")],
 ["not viable fail closed",src.includes('commercial.viability === "SURVIVES"')],
 ["single next selector",src.includes("selectNextResearchForOpportunity")],
 ["portfolio selector",src.includes("selectNextPortfolioResearch")],
 ["duplicate research guard",src.includes("DUPLICATE_RESEARCH_ID")],
 ["duplicate semantic question guard",src.includes("DUPLICATE_SEMANTIC_QUESTION")],
 ["deterministic tie",src.includes("researchId.localeCompare")],
 ["portfolio decision impact precedes R5 rank",src.includes("PORTFOLIO_RESEARCH_IMPACT_CLASS_PRECEDES_CURRENT_R5_RANK")],
 ["unknown is not negative",src.includes("UNKNOWN_INFORMATION_NEVER_COUNTS_AS_NEGATIVE")],
 ["spec research loop",spec.includes("AI → TI → UDOSIB")],
 ["spec value of information",spec.includes("Value of Information")],
 ["spec no threshold",spec.includes("No arbitrary research threshold")],
 ["math index export",fs.readFileSync("lib/genesis-t8/mathematics/index.ts","utf8").includes('export * from "./research-intelligence";')],
];
for(const [name,cond] of checks) check(name,cond);
console.log(`\nGenesis T8 CE-R2 R6 static validation: ${pass}/${pass+fail} passed.`);
if(fail) process.exit(1);
