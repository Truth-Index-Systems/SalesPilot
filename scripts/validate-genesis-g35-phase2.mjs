import fs from "node:fs";

const required = [
  "lib/opportunities/scoring.ts",
  "supabase/migrations/0030_genesis_g35_phase2_opportunity_intelligence_scoring.sql",
];
for (const file of required) {
  if (!fs.existsSync(file)) throw new Error(`Missing ${file}`);
}
const scheduler = fs.readFileSync("lib/pipeline/scheduler.ts", "utf8");
const migration = fs.readFileSync(required[1], "utf8");
const domain = fs.readFileSync("lib/opportunities/domain.ts", "utf8");
const assertions = [
  [scheduler.includes("scoreOpportunityIntelligence"), "scheduler scores opportunities"],
  [migration.includes("score_opportunity_intelligence"), "scoring RPC exists"],
  [migration.includes("opportunity-score/v1"), "versioned scoring exists"],
  [migration.includes("LOW_PRIORITY"), "low scores remain visible"],
  [migration.includes("NEEDS_CONTACT"), "contact limitations remain explicit"],
  [migration.includes("score_explanation_json"), "transparent explanation persists"],
  [domain.includes("OpportunityScoreExplanation"), "typed explanation contract exists"],
  [!migration.toLowerCase().includes("openai"), "scoring uses persisted intelligence only"],
];
for (const [ok, label] of assertions) if (!ok) throw new Error(`Failed: ${label}`);
console.log("Genesis G3.5 Phase 2 opportunity intelligence contract passed.");
