import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const checks = [];
const check = (name, pass) => checks.push({ name, pass: Boolean(pass) });

const migration = read("supabase/migrations/0078_genesis_g5_release5_personalisation_safety_layer.sql");
const scheduler = read("lib/pipeline/scheduler.ts");
const worker = read("lib/engagement/g5-personalisation-safety.ts");
const schema = read("lib/engagement/g5-personalisation-safety-schema.ts");
const outreach = read("lib/engagement/g5-outreach-generation-openai.ts");
const outreachSchema = read("lib/engagement/g5-outreach-generation-schema.ts");
const outreachWorker = read("lib/engagement/g5-outreach-generation.ts");

check("adds persisted safety manifest fields", migration.includes("personalisation_safety_json") && migration.includes("personalisation_safety_source_fingerprint"));
check("classification contract is explicit", schema.includes('"VERIFIED_FACT", "COMMERCIAL_INFERENCE", "DO_NOT_USE"'));
check("manifest is deterministic and needs no AI", worker.includes("buildG5PersonalisationSafetyManifest") && !worker.includes("fetch(") && !worker.includes("reserveAiRequest"));
check("verified evidence IDs must exist in immutable G4 snapshot", worker.includes("G5_PERSONALISATION_SAFETY_UNKNOWN_SOURCE") && worker.includes("sourceExists(sourceSnapshot"));
check("R2 safeEvidence becomes VERIFIED_FACT", worker.includes('classification: "VERIFIED_FACT"') && worker.includes("commercialReasoning.safeEvidence"));
check("R2 commercialInferences become framed inference", worker.includes('classification: "COMMERCIAL_INFERENCE"') && worker.includes('allowedUsage: "FRAMED_INFERENCE"'));
check("R2 prohibitedClaims become DO_NOT_USE", worker.includes('classification: "DO_NOT_USE"') && worker.includes('allowedUsage: "EXCLUDE"'));
check("R5 preserves R1 lifecycle states", migration.includes("state='STRATEGY_READY'") && !migration.includes("state='PERSONALISATION"));
check("R5 can backfill pre-R5 SELF_REVIEW rows", migration.includes("s.state='SELF_REVIEW' and s.personalisation_safety_json is null") && migration.includes("enforcedBeforeGeneration"));
check("R5 recovers pre-R5 outreach retries missing safety", migration.includes("s.failure_stage='OUTREACH_GENERATION'") && migration.includes("s.personalisation_safety_json is null and s.outreach_generation_json is null"));
check("R5 ownership is lease fenced", migration.includes("p_lease_token") && migration.includes("G5_ENGAGEMENT_OWNERSHIP_LOST"));
check("R4 claim now requires R5 manifest", migration.includes("s.personalisation_safety_json is not null") && migration.includes("s.personalisation_safety_schema_version='g5-personalisation-safety/v1'"));
check("R4 generation context includes safety manifest", migration.includes("personalisation_safety_json jsonb") && outreachWorker.includes("personalisationSafety: context.personalisation_safety_json"));
check("outreach prompt consumes only safety policy", outreach.includes("Use only items allowed by personalisationSafety"));
check("personalisation basis must be manifest IDs", outreach.includes("G5_OUTREACH_PERSONALISATION_BASIS_NOT_ALLOWED") && outreach.includes("allowedIds.has"));
check("evidenceUsed must be VERIFIED_FACT sources", outreach.includes("G5_OUTREACH_EVIDENCE_NOT_VERIFIED_FACT") && outreach.includes("verifiedSourceIds"));
check("DO_NOT_USE cannot become an allowed basis", outreach.includes('item.classification === "VERIFIED_FACT" || item.classification === "COMMERCIAL_INFERENCE"'));
check("generation audit prompt is bumped to v2", outreachSchema.includes('promptVersion: z.literal("g5-outreach-generation/v2")') && outreach.includes('prompt: "g5-outreach-generation/v2"'));
check("SQL completion requires v2 and enforced safety", migration.includes("g5-outreach-generation/v2") && migration.includes("G5_OUTREACH_PERSONALISATION_SAFETY_NOT_ENFORCED"));
check("scheduler executes deterministic R5 before R4", scheduler.indexOf("runNextG5PersonalisationSafety(runId)") < scheduler.indexOf("runNextG5OutreachGeneration(runId)"));
check("R5 does not activate self-review approval queue or send", scheduler.includes("const engagementSelfReview = null") && scheduler.includes("const engagementQueue = null"));
check("no G4 domain mutation added", !migration.match(/update\s+public\.(opportunities|companies|contacts|commercial_routes|company_route_intelligence)/i));

for (const c of checks) console.log(`${c.pass ? "PASS" : "FAIL"} ${c.name}`);
const failed = checks.filter((c) => !c.pass);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
if (failed.length) process.exit(1);
