import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const exists = (p) => fs.existsSync(path.join(root, p));
const checks = [];
const check = (name, ok, detail = "") => checks.push({ name, ok: Boolean(ok), detail });

const constitutionPath = "lib/genesis-t8/constitution.ts";
const docsPath = "docs/genesis-t8/GENESIS-T8-CONSTITUTION-v1.0.md";
const manifestPath = "docs/genesis-t8/TI-2.1.8-FREEZE-MANIFEST.json";

check("Genesis T8 constitution module exists", exists(constitutionPath));
check("Genesis T8 constitution specification exists", exists(docsPath));
check("TI-2.1.8 cryptographic freeze manifest exists", exists(manifestPath));
check("Genesis T8 public index exists", exists("lib/genesis-t8/index.ts"));

const constitution = read(constitutionPath);
const docs = read(docsPath);

check("platform identity is permanently Genesis T8", /GENESIS_T8_PLATFORM\s*=\s*"GENESIS_T8"/.test(constitution));
check("constitution is explicitly versioned", /GENESIS_T8_CONSTITUTION_VERSION\s*=\s*"1\.[01]\.0"/.test(constitution));
check("CE Release 1 Build 1 is version-fenced", /GENESIS_T8_CE_RELEASE\s*=\s*"CE-R1"/.test(constitution) && /GENESIS_T8_CE_BUILD\s*=\s*"BUILD1"/.test(constitution));
check("Truth Engine contract exists", /TRUTH:\s*(?:Object\.freeze|engine)\s*\(/.test(constitution));
check("Commercial Engine contract exists", /COMMERCIAL:\s*(?:Object\.freeze|engine)\s*\(/.test(constitution));
check("Contact Engine contract exists", /CONTACT:\s*(?:Object\.freeze|engine)\s*\(/.test(constitution));
check("Route Engine contract exists", /ROUTE:\s*(?:Object\.freeze|engine)\s*\(/.test(constitution));
check("Opportunity Engine contract exists", /OPPORTUNITY:\s*(?:Object\.freeze|engine)\s*\(/.test(constitution));
check("truth-before-reasoning runtime guard exists", /assertTruthPrecedesReasoning/.test(constitution));
check("authoritative reasoning persistence guard exists", /assertNoAuthoritativeReasoningPersistence/.test(constitution));
check("non-truth engines do not consume discovered knowledge by contract", !/(COMMERCIAL|CONTACT|ROUTE|OPPORTUNITY):[\s\S]{0,900}mayConsume:\s*Object\.freeze\(\[[^\]]*"DISCOVERED_KNOWLEDGE"/.test(constitution));
check("Truth Engine cannot persist derived reasoning", /TRUTH:[\s\S]{0,800}mayPersistAuthoritatively:\s*(?:Object\.freeze\()?\["TRUTH_QUALIFIED_KNOWLEDGE"\](?:\s+as const)?\)?/.test(constitution));
check("commercial desirability is explicitly forbidden to Truth Engine", /TRUTH:[\s\S]{0,1200}"commercial desirability"/.test(constitution));
check("constitution preserves token graph without prematurely freezing dimensions", /multidimensional token graph will be specified in CE-R1 Build 3/i.test(docs));
check("Build 1 explicitly prohibits production runtime changes", /does \*\*not\*\* change the production G8 pipeline/i.test(docs));
check("constitution states AI understands and Genesis reasons", /AI understands[;,. ]+Genesis reasons/i.test(docs));
check("constitution states knowledge persists and reasoning recalculates", /Knowledge persists; reasoning recalculates/i.test(docs));
check("constitution requires deterministic mathematical outputs", /Identical inputs produce identical mathematical outputs/i.test(docs));
check("constitution requires explainability", /Every conclusion is explainable/i.test(docs));
check("constitution enforces engine independence", /One engine owns one responsibility/i.test(docs));
check("constitution protects frozen kernels", /Frozen kernels change only through explicit versioning/i.test(docs));
check("constitution protects reality over desired scores", /Mathematics represents reality, not desired scores/i.test(docs));

if (exists(manifestPath)) {
  const manifest = JSON.parse(read(manifestPath));
  check("freeze manifest identifies TI-2.1.8", manifest.engine === "TI-2.1.8");
  const entries = Object.entries(manifest.files ?? {});
  check("freeze manifest covers TI-2.1.8 source files", entries.length >= 20, `${entries.length} files`);
  const mismatches = [];
  for (const [relative, expected] of entries) {
    const absolute = path.join(root, relative);
    if (!fs.existsSync(absolute)) {
      mismatches.push(`${relative}:missing`);
      continue;
    }
    const actual = crypto.createHash("sha256").update(fs.readFileSync(absolute)).digest("hex");
    if (actual !== expected) mismatches.push(`${relative}:changed`);
  }
  check("TI-2.1.8 source matches frozen cryptographic manifest", mismatches.length === 0, mismatches.join(", "));
}

// T8 must remain application-independent at the platform boundary.
const t8Files = [];
const walk = (dir) => {
  const absolute = path.join(root, dir);
  if (!fs.existsSync(absolute)) return;
  for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(rel);
    else if (/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(entry.name)) t8Files.push(rel);
  }
};
walk("lib/genesis-t8");
const t8Text = t8Files.map((file) => read(file)).join("\n");
check("Genesis T8 core does not import application layer", !/from\s+["']@?\/?app\//.test(t8Text));
check("Genesis T8 core does not import MarketRoute UI", !/from\s+["'][^"']*(components|dashboard)[^"']*["']/.test(t8Text));
check("Genesis T8 core does not call OpenAI directly", !/openai|responses\.create|chat\.completions/i.test(t8Text));

const failed = checks.filter((c) => !c.ok);
for (const c of checks) console.log(`${c.ok ? "PASS" : "FAIL"} ${c.name}${c.detail ? ` :: ${c.detail}` : ""}`);
console.log(`\nGenesis T8 CE-R1 Build 1: ${checks.length - failed.length}/${checks.length} checks passed.`);
if (failed.length) process.exit(1);
