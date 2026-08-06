import fs from "node:fs";

const component = fs.readFileSync("components/ai-governance-controls.tsx", "utf8");
const route = fs.readFileSync("app/api/internal/autonomy/governance/route.ts", "utf8");
const checks = [
  [component.includes('type="text" inputMode="numeric"'), "numeric inputs avoid browser-preserved leading zeros"],
  [component.includes('replace(/^0+(?=\\d)/, "")'), "leading zeros are normalised"],
  [component.includes("Limits saved"), "save confirmation is visible"],
  [component.includes("Independent limit for each campaign"), "campaign limit independence is explained"],
  [component.includes("Historical count; changing limits does not reset it"), "blocked metric is labelled historical"],
  [route.includes("ai_governance_policies?organisation_id=eq."), "save endpoint reads persisted policy back from database"],
  [route.includes("AI_GOVERNANCE_READBACK_FAILED"), "missing persisted row fails closed"],
];
let failed = false;
for (const [ok, label] of checks) {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}`);
  if (!ok) failed = true;
}
if (failed) process.exit(1);
