import fs from "node:fs";
import path from "node:path";
const root=process.cwd(); const read=(f)=>fs.readFileSync(path.join(root,f),"utf8");
const required=["lib/engagement/commercial-reasoning-schema.ts","lib/engagement/commercial-reasoning-openai.ts","lib/engagement/commercial-reasoning.ts","supabase/migrations/0036_genesis_g4_phase3_commercial_reasoning.sql"];
for(const file of required)if(!fs.existsSync(path.join(root,file)))throw new Error(`Missing G4 Phase 3 file: ${file}`);
const schema=read(required[0]), ai=read(required[1]), worker=read(required[2]), sql=read(required[3]), scheduler=read("lib/pipeline/scheduler.ts"), governance=read("lib/ai/governance.ts");
const expectations=[
 [schema.includes('engagement-commercial-reasoning/v1'),"deterministic schema version"],
 [schema.includes("commercialObjective")&&schema.includes("buyingAngle")&&schema.includes("likelyObjections")&&schema.includes("ctaStrategy"),"commercial outputs"],
 [schema.includes("evidenceReferences")&&schema.includes("limitations"),"evidence and limitation contract"],
 [ai.includes('type:"json_schema"')&&ai.includes("strict:true"),"Responses API strict JSON"],
 [ai.includes("Never invent company facts")&&ai.includes("Do not write the outreach message"),"hallucination and phase boundary"],
 [ai.includes('jobType:"COMMERCIAL_REASONING"'),"AI governance reservation"],
 [worker.includes('rpc/claim_engagement_commercial_reasoning')&&worker.includes('rpc/complete_engagement_commercial_reasoning'),"claim and completion workflow"],
 [scheduler.includes("await runNextCommercialReasoning(runId)"),"single scheduler ownership"],
 [sql.includes("engagement_commercial_analyses"),"persistent analysis repository"],
 [sql.includes("for update of a skip locked"),"concurrency-safe claiming"],
 [sql.includes("attempt_count<5")&&sql.includes("FAILED_RETRYABLE"),"bounded retry"],
 [sql.includes("COMMERCIAL_ANALYSIS_COMPLETED"),"history and timeline"],
 [sql.includes("engagement_generation_history"),"generation history persistence"],
 [sql.includes("engagement_prompt_versions"),"prompt version persistence"],
 [governance.includes('"COMMERCIAL_REASONING"'),"governance type extension"],
 [!sql.match(/send_at|sent_at|smtp|email_body|subject_line/i),"no drafting or sending"],
];
for(const [ok,label] of expectations)if(!ok)throw new Error(`G4 Phase 3 validation failed: ${label}`);
console.log("Genesis G4 Phase 3 Commercial Reasoning validation passed.");
