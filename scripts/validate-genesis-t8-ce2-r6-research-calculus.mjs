import fs from "node:fs";
const target="lib/genesis-t8/ce2-evolution/research-calculus.ts";
if(!fs.existsSync(target)) throw new Error("CE2_R6_RESEARCH_CALCULUS_MISSING");
const source=fs.readFileSync(target,"utf8");
let passed=0;
const checks=[
 ["version",/GENESIS_T8_CE2_EVOLUTION_R6_VERSION\s*=\s*"1\.0\.0"/],
 ["impact classes",/"NO_DECISION_VALUE"[\s\S]*"ENRICHMENT"[\s\S]*"ASSURANCE_RELEVANT"[\s\S]*"STABILITY_RELEVANT"[\s\S]*"DECISION_SHARPENING"[\s\S]*"DECISION_BLOCKING"/],
 ["voi principle",/Value of Information/],
 ["no expected utility",/STANDARD_EXPECTED_VALUE_OF_INFORMATION_IS_NOT_CALCULATED_WITHOUT_AUTHORISED_UTILITIES_AND_OUTCOME_PROBABILITIES/],
 ["no entropy priority",/ENTROPY_OR_UNCERTAINTY_REDUCTION_ALONE_CANNOT_GOVERN_RESEARCH_PRIORITY/],
 ["decision critical",/decisionCriticalKnowledgeIds/],
 ["blocking",/blockingKnowledgeIds/],
 ["contradictory",/contradictoryKnowledgeIds/],
 ["uncertain",/uncertainKnowledgeIds/],
 ["stability critical",/criticalDimensions/],
 ["known cost",/knownCost/],
 ["cost tie break",/COST_IS_A_TIE_BREAK_ONLY_WITHIN_EQUAL_DECISION_VALUE/],
 ["unknown cost safe",/UNKNOWN_COST_IS_NOT_ASSUMED_ZERO_OR_CHEAP/],
 ["comparator",/function compareResearchPriority/],
 ["plan",/function buildResearchPlan/],
 ["counterfactual deferred",/COUNTERFACTUAL_DECISION_SET_CONTRACTION_IS_DEFERRED/],
 ["no opp ranking",/CE2_R6_DOES_NOT_RANK_OPPORTUNITIES_ROUTES_OR_CONTACTS/],
];
for(const [name,re] of checks){if(!re.test(source))throw new Error(`CE2_R6_STATIC_FAIL:${name}`);passed++;}
for(const forbidden of [/from\s+["']openai["']/i,/from\s+["']next\//i,/from\s+["']@supabase/i,/process\.env/,/Date\.now\s*\(/,/Math\.random\s*\(/,/Math\.log\s*\(/,/["']expectedUtility["']\s*:/i,/["']probability["']\s*:/i,/["']entropy["']\s*:/i]){if(forbidden.test(source))throw new Error(`CE2_R6_STATIC_FAIL:FORBIDDEN:${forbidden}`);passed++;}
console.log(`PASS CE2-R6 Research Calculus static validator ${passed}/${checks.length+10}`);
