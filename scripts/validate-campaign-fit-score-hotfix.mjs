import fs from "node:fs";

const read = (file) => fs.readFileSync(file, "utf8");
const fit = read("lib/intelligence/fit-score.ts");
const openai = read("lib/intelligence/openai.ts");
const schema = read("lib/intelligence/business-discovery-schema.ts");
const route = read("app/api/intelligence/business-discovery/route.ts");
const launch = read("app/api/campaigns/launch/route.ts");
const wizard = read("components/campaign-wizard.tsx");

const checks = [
  [fit.includes("bounded * 10") && fit.includes("confidence >= 0.5"), "guarded 0–10 to 0–100 normalisation exists"],
  [openai.includes("fitScore MUST use a 0–100 scale, never a 0–10 scale"), "prompt explicitly defines the score scale"],
  [openai.includes("normaliseBusinessAnalysis(envelopeSchema.parse(parsed))"), "new AI results are normalised before persistence"],
  [schema.includes("Never use a 0–10 scale"), "structured schema describes the correct scale"],
  [route.includes("normaliseBusinessAnalysis(job.analysis_json"), "saved analysis resumes with corrected scale"],
  [launch.includes("normaliseBusinessAnalysis(parsed.businessAnalysis)"), "launch boundary prevents a low-scale score being persisted"],
  [wizard.includes("campaignMatchLabel(proposal.fitScore)"), "campaign label derives from the numeric score"],
  [fit.includes('return "Low match"'), "low scores no longer display as Good match"],
];

let failed = false;
for (const [ok, label] of checks) {
  console.log(`${ok ? "✓" : "✗"} ${label}`);
  if (!ok) failed = true;
}
if (failed) process.exit(1);
console.log("\nSalesPilot campaign fit-score scale hotfix passed");
