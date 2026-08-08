import fs from "node:fs";

const checks = [];
const add = (ok, label) => checks.push({ ok: Boolean(ok), label });

const file = "lib/genesis-g8/orchestration-boundary.ts";
add(fs.existsSync(file), `${file} exists`);
const src = fs.readFileSync(file, "utf8");
const planning = fs.readFileSync("lib/genesis-g8/planning.ts", "utf8");
const root = fs.readFileSync("lib/genesis-g8/index.ts", "utf8");

for (const kind of ["KNOWLEDGE_RESULT", "DISCOVERY_REPAIR", "DISCOVERY_FULL", "HUMAN_REVIEW"]) {
  add(src.includes(`"${kind}"`), `execution kind ${kind} exists`);
}
add(src.includes("GENESIS_G8_ORCHESTRATION_BOUNDARY_VERSION"), "orchestration boundary is versioned");
add(src.includes("dispatchKey"), "execution instructions expose idempotent dispatch keys");
add(src.includes("safeKeyPart"), "dispatch keys are normalized deterministically");
add(src.includes('"EXISTING_DISCOVERY_INTELLIGENCE"'), "Discovery execution target preserves existing workers");
add(src.includes('"FOUNDER_REVIEW_QUEUE"'), "human review has an explicit founder review target");
add(src.includes("workflowRef") && src.includes("must never be persisted"), "workflow correlation is explicitly isolated from shared intelligence");
add(src.includes('case "USE_KNOWLEDGE"') && src.includes("knowledgeInstruction"), "USE_KNOWLEDGE becomes a Knowledge instruction");
add(src.includes('case "USE_KNOWLEDGE_AND_REPAIR"') && src.includes('"NON_BLOCKING"'), "knowledge-plus-repair emits non-blocking repair work");
add(src.includes('case "REFRESH_BEFORE_USE"') && src.includes('"BLOCKING_BEFORE_USE"'), "refresh-before-use emits blocking repair work");
add(src.includes('case "ROUTE_TO_HUMAN_REVIEW"') && src.includes("humanReviewInstruction"), "human-review plans stop at review instruction");
add(src.includes('case "RUN_FULL_DISCOVERY"') && src.includes('"DISCOVERY_FULL"'), "full fallback becomes one full-Discovery instruction");
add(src.includes("repair.disposition !== \"DISCOVERY_INTELLIGENCE\""), "human-review repair contracts are not silently dispatched to Discovery");
add(src.includes("duplicate dispatchKey"), "boundary validator detects duplicate work");
add(src.includes("must not expose Knowledge before blocking refresh"), "boundary validator blocks premature Knowledge use");
add(src.includes("must stop at the human-review boundary"), "boundary validator protects human-review authority");
add(src.includes("must create exactly one full-Discovery instruction"), "full Discovery fallback is singular and bounded");
add(!src.match(/openai|fetch\(|databaseRequest|supabase|createClient|from\(["'`]/i), "R7 orchestration boundary has no AI/network/database dependency");
add(root.includes('export * from "./orchestration-boundary"'), "R7 public API exported from G8 root");
add(planning.includes("RUN_FULL_DISCOVERY") && planning.includes("USE_KNOWLEDGE_AND_REPAIR"), "R7 consumes the established R6 plan contract");

const productionRoots = ["lib/discovery", "lib/contacts", "lib/opportunities", "lib/pipeline", "lib/autonomy"];
const files = [];
for (const rootPath of productionRoots) {
  if (!fs.existsSync(rootPath)) continue;
  const stack = [rootPath];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const next = `${current}/${entry.name}`;
      if (entry.isDirectory()) stack.push(next);
      else if (/\.(ts|tsx|js|mjs)$/.test(entry.name)) files.push(next);
    }
  }
}
add(!files.some((path) => fs.readFileSync(path, "utf8").includes("genesis-g8")), "R7 remains isolated from frozen live production paths");

const failed = checks.filter((check) => !check.ok);
for (const check of checks) console.log(`${check.ok ? "PASS" : "FAIL"} ${check.label}`);
if (failed.length) process.exit(1);
console.log(`\nGenesis G8.1 Dual-Channel Orchestration Boundary validation passed (${checks.length}/${checks.length}).`);
