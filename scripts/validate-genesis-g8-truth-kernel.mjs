import fs from "node:fs";

const required = [
  "lib/genesis-g8/truth/types.ts",
  "lib/genesis-g8/truth/policy.ts",
  "lib/genesis-g8/truth/math.ts",
  "lib/genesis-g8/truth/evidence.ts",
  "lib/genesis-g8/truth/claim.ts",
  "lib/genesis-g8/truth/review.ts",
  "lib/genesis-g8/truth/equation.ts",
  "lib/genesis-g8/truth/index.ts",
  "lib/genesis-g8/channels.ts",
  "lib/genesis-g8/index.ts",
];
const checks = [];
const add = (ok, label) => checks.push({ ok: Boolean(ok), label });
for (const file of required) add(fs.existsSync(file), `${file} exists`);

const equation = fs.readFileSync("lib/genesis-g8/truth/equation.ts", "utf8");
const evidence = fs.readFileSync("lib/genesis-g8/truth/evidence.ts", "utf8");
const review = fs.readFileSync("lib/genesis-g8/truth/review.ts", "utf8");
const policy = fs.readFileSync("lib/genesis-g8/truth/policy.ts", "utf8");
const channels = fs.readFileSync("lib/genesis-g8/channels.ts", "utf8");

add(!equation.match(/openai|fetch\(|databaseRequest|postgres|supabase/i), "Truth equation has no AI/network/database dependency");
add(equation.includes("confidence01 * coverage01"), "confidence and coverage remain separate before Truth Index composition");
add(equation.includes("Math.min(calculated01, criticalCeiling01)"), "critical claims impose a deterministic reliability ceiling");
add(evidence.includes("halfLifeFreshness"), "freshness decays evidence rather than the entity score directly");
add(review.includes("MATERIAL_CONTRADICTION"), "contradictory evidence can trigger deterministic human review");
add(policy.includes('"MR-TI-1.0"'), "equation is explicitly versioned");
add(channels.includes("KNOWLEDGE_INTELLIGENCE") && channels.includes("DISCOVERY_INTELLIGENCE"), "dual-channel architecture is explicit");
add(channels.includes("KNOWLEDGE_FIRST_WITH_DISCOVERY_FALLBACK"), "future default preserves live discovery fallback");

const productionRoots = ["lib/discovery", "lib/contacts", "lib/opportunities", "lib/pipeline", "lib/autonomy"];
const productionFiles = [];
for (const root of productionRoots) {
  if (!fs.existsSync(root)) continue;
  const stack = [root];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const next = `${current}/${entry.name}`;
      if (entry.isDirectory()) stack.push(next);
      else if (/\.(ts|tsx|js|mjs)$/.test(entry.name)) productionFiles.push(next);
    }
  }
}
const liveImportsG8 = productionFiles.some((file) => fs.readFileSync(file, "utf8").includes("genesis-g8"));
add(!liveImportsG8, "G8 Release 1 is not wired into frozen production discovery/customer paths");

const failed = checks.filter((check) => !check.ok);
for (const check of checks) console.log(`${check.ok ? "PASS" : "FAIL"} ${check.label}`);
if (failed.length) process.exit(1);
console.log(`\nGenesis G8.1 Truth Kernel validation passed (${checks.length}/${checks.length}).`);
