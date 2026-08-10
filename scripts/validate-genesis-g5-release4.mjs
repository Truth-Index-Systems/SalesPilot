import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const checks = [];
const check = (name, pass) => checks.push({ name, pass: Boolean(pass) });

const migration = read("supabase/migrations/0077_genesis_g5_release4_channel_specific_outreach_generation.sql");
const scheduler = read("lib/pipeline/scheduler.ts");
const worker = read("lib/engagement/g5-outreach-generation.ts");
const openai = read("lib/engagement/g5-outreach-generation-openai.ts");
const schema = read("lib/engagement/g5-outreach-generation-schema.ts");

check("adds persisted R4 outreach fields", migration.includes("outreach_generation_json") && migration.includes("outreach_generation_source_fingerprint"));
check("claims only channel-ready strategy", migration.includes("s.channel_strategy_json is not null") && migration.includes("state='GENERATING'"));
check("supports fenced retry ownership", migration.includes("failure_stage='OUTREACH_GENERATION'") && migration.includes("p_lease_token"));
check("commits only GENERATING to SELF_REVIEW", migration.includes("previous_state='GENERATING'") && migration.includes("state='SELF_REVIEW'"));
check("does not approve queue or send", !migration.includes("state='APPROVED'\n") && !migration.includes("state='QUEUED'\n") && !migration.includes("state='SENT'\n"));
check("repairs R3 event compatibility", migration.includes("'CHANNEL_STRATEGY_READY'"));
check("worker uses dedicated R4 RPCs", worker.includes("claim_g5_outreach_generation") && worker.includes("complete_g5_outreach_generation_owned"));
check("worker handles ownership supersession", worker.includes("SUPERSEDED") && worker.includes("isPipelineOwnershipLost"));
check("gateway uses canonical OUTREACH job type", openai.includes('jobType: "OUTREACH"'));
check("gateway fingerprints exact consumed context", openai.includes("sourceFingerprint = stableFingerprint(compactInput)"));
check("AI cannot choose a different route", openai.includes("G5_OUTREACH_ROUTE_MISMATCH") && openai.includes("G5_OUTREACH_CHANNEL_MISMATCH"));
check("G4 route viability and reachability are revalidated", openai.includes("G5_OUTREACH_G4_ROUTE_NOT_VIABLE") && openai.includes("G5_OUTREACH_G4_ROUTE_UNREACHABLE"));
check("evidence source ids are deterministically checked", openai.includes("G5_OUTREACH_UNKNOWN_EVIDENCE_SOURCE"));
check("generation is native to four R3 channels", schema.includes('"EMAIL", "LINKEDIN", "SWITCHBOARD", "REFERRAL"'));
check("scheduler uses bounded governed G5 lanes", scheduler.includes("g5DispatchWidth") && scheduler.includes("Promise.all(Array.from({ length: g5DispatchWidth }") && scheduler.includes("AI reservation caps remain authoritative"));
check("scheduler now executes R4 worker", scheduler.includes("runNextG5OutreachGeneration(runId)"));
check("R4 remains state-gated before self-review", scheduler.includes("runNextG5OutreachGeneration(runId)") && scheduler.indexOf("runNextG5OutreachGeneration(runId)") < scheduler.indexOf("runNextG5SelfReview(runId)"));
check("no G4 domain mutation added", !migration.match(/update\s+public\.(opportunities|companies|contacts|commercial_routes|company_route_intelligence)/i));

for (const c of checks) console.log(`${c.pass ? "PASS" : "FAIL"} ${c.name}`);
const failed = checks.filter((c) => !c.pass);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
if (failed.length) process.exit(1);
