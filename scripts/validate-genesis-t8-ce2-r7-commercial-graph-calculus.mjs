import fs from "node:fs";
const target="lib/genesis-t8/ce2-evolution/commercial-graph-calculus.ts";
if(!fs.existsSync(target)) throw new Error("CE2_R7_GRAPH_CALCULUS_MISSING");
const source=fs.readFileSync(target,"utf8");
let passed=0;
const checks=[
 ["version",/GENESIS_T8_CE2_EVOLUTION_R7_VERSION\s*=\s*"1\.0\.0"/],
 ["edge states",/"OPEN"[\s\S]*"UNRESOLVED"[\s\S]*"BLOCKED"/],
 ["reachability",/function isCommerciallyReachable/],
 ["shortest hops",/function shortestOpenHopCount/],
 ["simple paths",/function enumerateCommercialSimplePaths/],
 ["pareto dominance",/function commercialPathDominates/],
 ["pareto frontier",/function paretoCommercialPaths/],
 ["bottleneck",/bottleneckStabilityMargin/],
 ["disjoint paths",/function internallyVertexDisjointOpenPathCount/],
 ["critical nodes",/function criticalOpenNodeIds/],
 ["critical edges",/function criticalOpenEdgeIds/],
 ["weighted path forbidden",/SCALAR_WEIGHTED_SHORTEST_PATHS_ARE_FORBIDDEN/],
 ["path state precedence",/PATH_ACCESSIBILITY_IS_CATEGORICAL_AND_NON_COMPENSATORY/],
 ["pareto law",/PARETO_PATH_REASONING_PRESERVES_INCOMPARABLE_COMMERCIAL_TRADEOFFS_WITHIN_EQUAL_ACCESSIBILITY_CLASS/],
 ["menger law",/MENGER_STYLE_DISJOINT_PATH_REASONING_GOVERNS_STRUCTURAL_ROUTE_REDUNDANCY/],
 ["complexity fail closed",/PATH_ENUMERATION_COMPLEXITY_LIMITS_FAIL_CLOSED/],
 ["no route scores",/AI_MAY_CANONICALISE_SEMANTIC_GRAPH_RELATIONSHIPS_BUT_MAY_NOT_ASSIGN_PATH_WEIGHTS_SCORES_OR_RANKS/],
 ["no opportunity ranking",/CE2_R7_DOES_NOT_RANK_OPPORTUNITIES_CONTACTS_OR_RESEARCH/],
];
for(const [name,re] of checks){if(!re.test(source))throw new Error(`CE2_R7_STATIC_FAIL:${name}`);passed++;}
for(const forbidden of [/from\s+["']openai["']/i,/from\s+["']next\//i,/from\s+["']@supabase/i,/process\.env/,/Date\.now\s*\(/,/Math\.random\s*\(/,/\bweight\s*:/i,/\bscore\s*:/i,/\bprobability\s*:/i,/\bconfidence\s*:/i]){if(forbidden.test(source))throw new Error(`CE2_R7_STATIC_FAIL:FORBIDDEN:${forbidden}`);passed++;}
console.log(`PASS CE2-R7 Commercial Graph Calculus static validator ${passed}/${checks.length+10}`);
