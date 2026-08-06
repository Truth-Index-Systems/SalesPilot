import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const checks = [];
const add = (ok, label) => checks.push({ ok, label });

const intelligence = read("lib/intelligence/openai.ts");
const gateway = read("lib/ai/structured-response-gateway.ts");
const worker = read("lib/intelligence/business-analysis-worker.ts");
const route = read("app/api/intelligence/business-discovery/route.ts");

add(intelligence.includes("parseStructuredAiResponse"), "Business Intelligence uses the shared gateway");
add(intelligence.includes("max_output_tokens: 9_000"), "Business Intelligence has a non-truncating structured-output budget");
add(gateway.includes("max_output_tokens: 9_000"), "Gateway repair has enough output budget for the full schema");
add(worker.includes('code:"INVALID_AI_OUTPUT"'), "Worker classifies malformed output safely");
add(route.includes('job.last_error_code === "INVALID_AI_OUTPUT"'), "Status API masks stored parser details");
add(!route.includes('message: job.last_error_message ?? "The analysis did not complete."') || route.indexOf('job.last_error_code === "INVALID_AI_OUTPUT"') < route.indexOf('message: job.last_error_message ?? "The analysis did not complete."'), "Structured errors are masked before generic error replay");

const failed = checks.filter((check) => !check.ok);
for (const check of checks) console.log(`${check.ok ? "PASS" : "FAIL"} ${check.label}`);
if (failed.length) process.exit(1);
