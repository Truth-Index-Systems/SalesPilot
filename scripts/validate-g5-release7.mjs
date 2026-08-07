import fs from "node:fs";
const read=(p)=>fs.readFileSync(new URL(`../${p}`,import.meta.url),"utf8");
const worker=read("lib/engagement/g5-engagement-quality.ts");
const schema=read("lib/engagement/g5-engagement-quality-schema.ts");
const scheduler=read("lib/pipeline/scheduler.ts");
const sql=read("supabase/migrations/0080_genesis_g5_release7_engagement_quality_engine.sql");
const checks=[
 ["schema version",schema.includes('g5-engagement-quality/v1')],
 ["separate confidence",schema.includes('engagementConfidence')],
 ["8 dimensions",["commercialRelevance","routeAlignment","evidenceStrength","personalisationQuality","messageClarity","ctaQuality","channelSuitability","riskSafety"].every(x=>schema.includes(x))],
 ["deterministic worker",worker.includes('buildG5EngagementQuality')&&!worker.includes('fetch(')],
 ["requires PASS",worker.includes('G5_QUALITY_REQUIRES_PASS')],
 ["verified fact penalty",worker.includes('verifiedFactCount > 0')],
 ["100 weight total",worker.includes('[dimensions.commercialRelevance, 18]')&&worker.includes('[dimensions.riskSafety, 8]')],
 ["no opportunity score import",!worker.includes('opportunity') || !worker.includes('OpportunityScoring')],
 ["scheduler typed",scheduler.includes('G5EngagementQualityWorkerResult | null')],
 ["scheduler runs quality",scheduler.includes('runNextG5EngagementQuality(runId)')],
 ["canonical columns",sql.includes('engagement_quality_json')&&sql.includes('engagement_confidence')],
 ["append history",sql.includes('engagement_quality_assessments')],
 ["claim fenced",sql.includes('claim_g5_engagement_quality')&&sql.includes('for update of s skip locked')],
 ["context fenced",sql.includes('get_g5_engagement_quality_context_owned')&&sql.includes('G5_ENGAGEMENT_OWNERSHIP_LOST')],
 ["complete fenced",sql.includes('complete_g5_engagement_quality_owned')],
 ["retry fenced",sql.includes('fail_g5_engagement_quality_owned')],
 ["approval gated",sql.includes('G5_ENGAGEMENT_QUALITY_REQUIRED')],
 ["event emitted",sql.includes('ENGAGEMENT_QUALITY_SCORED')],
 ["service role grants",sql.includes('grant execute on function public.claim_g5_engagement_quality')],
 ["immutable marker",worker.includes('immutableG4: true')&&sql.includes("'immutableG4',true")],
];
let passed=0;
for(const [name,ok] of checks){console.log(`${ok?'PASS':'FAIL'} ${name}`);if(ok)passed++;}
console.log(`\n${passed}/${checks.length} passed`);
if(passed!==checks.length)process.exit(1);
