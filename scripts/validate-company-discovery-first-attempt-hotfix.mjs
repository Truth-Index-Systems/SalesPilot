import fs from "node:fs";

const openai = fs.readFileSync("lib/discovery/openai.ts", "utf8");
const errors = fs.readFileSync("lib/pipeline/errors.ts", "utf8");
const worker = fs.readFileSync("features/discovery/company-discovery.service.ts", "utf8");

const checks = [
  [openai.includes('reasoning: { effort: "low" }'), "Company discovery uses low reasoning effort"],
  [openai.includes("max_output_tokens: 9_000"), "Company discovery has sufficient shared reasoning/output budget"],
  [openai.includes('responseStatus === "incomplete"'), "Incomplete Responses API results are detected"],
  [openai.indexOf("CompanyDiscoveryResultSchema.parse") < openai.lastIndexOf("ok: true"), "AI usage is only marked successful after schema validation"],
  [openai.includes('errorCode: "INVALID_JSON"') && openai.includes('errorCode: "INVALID_SCHEMA"'), "Invalid output is recorded accurately"],
  [openai.includes("maxItems: 8") && openai.includes("maxItems: 4"), "Company and evidence output are bounded"],
  [errors.includes('upper.includes("DISCOVERY_INCOMPLETE")'), "Incomplete output is classified as retryable invalid AI output"],
  [worker.includes("The research response did not complete cleanly"), "Customer activity explains safe hold without exposing internals"],
  [!openai.includes("SALESPILOT_TEST_MODE"), "No test mode was introduced"],
];

let failed = false;
for (const [ok, label] of checks) {
  console.log(`${ok ? "✓" : "✗"} ${label}`);
  if (!ok) failed = true;
}
if (failed) process.exit(1);
console.log("\nCompany Discovery first-attempt hotfix passed");
