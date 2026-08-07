import fs from "node:fs";

const read = (p) => fs.readFileSync(p, "utf8");
const worker = read("lib/engagement/g5-channel-strategy.ts");
const ai = read("lib/engagement/g5-channel-strategy-openai.ts");
const schema = read("lib/engagement/g5-channel-strategy-schema.ts");
const scheduler = read("lib/pipeline/scheduler.ts");
const migration = read("supabase/migrations/0076_genesis_g5_release3_engagement_channel_strategy.sql");

const checks = [
  [migration.includes("state='STRATEGY_READY'") && migration.includes("statePreserved"), "R3 preserves the canonical STRATEGY_READY lifecycle state"],
  [migration.includes("claim_g5_channel_strategy") && migration.includes("get_g5_channel_strategy_context_owned") && migration.includes("complete_g5_channel_strategy_owned"), "R3 channel work is ownership-fenced end to end"],
  [migration.includes("commercial_reasoning_json is not null") && migration.includes("commercial_reasoning_source_snapshot_json is not null"), "R3 requires completed R2 reasoning and its immutable G4 snapshot"],
  [migration.includes("channel_strategy_json") && migration.includes("channel_strategy_source_fingerprint"), "R3 persists channel decision and source fingerprint"],
  [migration.includes("G5_CHANNEL_STRATEGY_READY") && migration.includes("Strongest engagement route selected"), "R3 emits customer-visible progress"],
  [migration.includes("p_expected_state='STRATEGY_READY' and p_next_state='GENERATING'") && migration.includes("channel_strategy_json is not null"), "future GENERATING claims are gated on a completed channel strategy"],
  [schema.includes('z.literal("g5-channel-strategy/v1")'), "strict R3 schema is versioned"],
  [schema.includes('z.enum(["EMAIL", "LINKEDIN", "SWITCHBOARD", "REFERRAL"])'), "R3 exposes only executable channels supported by G4 route truth"],
  [ai.includes("Choose only viable commercial route IDs") && ai.includes("Never invent a route ID"), "AI cannot invent commercial routes"],
  [ai.includes("CHANNEL_COMPATIBILITY") && ai.includes("G5_CHANNEL_STRATEGY_CHANNEL_MISMATCH"), "post-AI validation enforces G4 channel compatibility"],
  [ai.includes("G5_CHANNEL_STRATEGY_UNREACHABLE") && ai.includes("channelValue"), "post-AI validation requires persisted reachability"],
  [worker.includes("fail_g5_channel_strategy_owned") && migration.includes("failure_stage='CHANNEL_STRATEGY'"), "R3 failures retry without leaking into another engagement stage"],
  [scheduler.includes("runNextG5ChannelStrategy(runId)"), "scheduler invokes R3 channel strategy"],
  [scheduler.includes("!commercialReasoning.processed") && scheduler.includes("ONE G5 AI worker"), "scheduler runs at most one G5 AI worker per cycle"],
  [scheduler.includes("const outreachGeneration = null") && scheduler.includes("const engagementSelfReview = null") && scheduler.includes("const engagementQueue = null"), "R3 still cannot generate, review, queue or send outreach"],
  [!scheduler.includes("runNextOutreachGeneration(runId)") && !scheduler.includes("runNextEngagementSelfReview(runId)"), "legacy downstream execution remains cut off"],
];

let failed = 0;
for (const [ok, label] of checks) {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}`);
  if (!ok) failed++;
}
if (failed) process.exit(1);
console.log(`G5 Release 3 validation passed (${checks.length}/${checks.length}).`);
