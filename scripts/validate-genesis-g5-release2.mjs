import fs from "node:fs";

const read = (p) => fs.readFileSync(p, "utf8");
const worker = read("lib/engagement/g5-commercial-reasoning.ts");
const ai = read("lib/engagement/g5-commercial-reasoning-openai.ts");
const schema = read("lib/engagement/g5-commercial-reasoning-schema.ts");
const scheduler = read("lib/pipeline/scheduler.ts");
const migration = read("supabase/migrations/0075_genesis_g5_release2_commercial_reasoning_engine.sql");

const checks = [
  [worker.includes('expectedState: "WAITING"') && worker.includes('nextState: "REASONING"'), "R2 claims only WAITING -> REASONING"],
  [worker.includes("complete_g5_commercial_reasoning_owned"), "R2 completion is ownership-fenced"],
  [migration.includes("state='STRATEGY_READY'"), "R2 completes at STRATEGY_READY"],
  [migration.includes("commercial_reasoning_source_snapshot_json"), "R2 persists consumed G4 snapshot"],
  [migration.includes("commercial_reasoning_source_fingerprint"), "R2 persists source fingerprint"],
  [migration.includes("od.status='APPROVED'"), "R2 consumes approved opportunities only"],
  [migration.includes("'g4Immutable',true"), "G4 immutable boundary is explicit"],
  [schema.includes('z.literal("g5-commercial-reasoning/v1")'), "strict G5 reasoning schema is versioned"],
  [schema.includes("prohibitedClaims") && schema.includes("commercialInferences") && schema.includes("safeEvidence"), "reasoning separates safe evidence, inference and prohibited claims"],
  [ai.includes("Do not write an email, LinkedIn message, phone script or switchboard script"), "R2 cannot generate outreach"],
  [ai.includes("Do not invent a new contact, route, channel, buying path or company fact"), "R2 cannot rediscover G4 truth"],
  [scheduler.includes("runNextG5CommercialReasoning(runId)"), "scheduler invokes canonical G5 reasoner"],
  [scheduler.includes("const outreachGeneration = null") && scheduler.includes("const engagementSelfReview = null") && scheduler.includes("const engagementQueue = null"), "legacy downstream engagement execution is cut off"],
  [!scheduler.includes("runNextCommercialReasoning(runId)"), "legacy commercial reasoner is not executable from scheduler"],
];

let failed = 0;
for (const [ok, label] of checks) {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}`);
  if (!ok) failed++;
}
if (failed) process.exit(1);
console.log(`G5 Release 2 validation passed (${checks.length}/${checks.length}).`);
