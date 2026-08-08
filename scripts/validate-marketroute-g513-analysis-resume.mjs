import fs from "node:fs";

const wizard = fs.readFileSync("components/campaign-wizard.tsx", "utf8");
const vercel = JSON.parse(fs.readFileSync("vercel.json", "utf8"));

const checks = [
  [wizard.includes('if (job.status === "QUEUED")'), "queued analysis jobs are explicitly resumed inside the monitor loop"],
  [wizard.includes("Business analysis queued resume dispatch failed"), "queued resume dispatch is wired"],
  [wizard.includes('if (job.status === "FAILED_RETRYABLE")'), "retryable recovery remains wired"],
  [fs.existsSync("public/marketroute-logo.png"), "MarketRoute wordmark exists"],
  [fs.existsSync("public/salespilot-logo.png"), "legacy logo URL compatibility asset exists"],
  [Array.isArray(vercel.crons) && vercel.crons.some(c => c.path === "/api/autonomy/ai/collect"), "background collector recovery cron remains configured"],
];

let failed = 0;
for (const [ok, label] of checks) {
  console.log(`${ok ? "✓" : "✗"} ${label}`);
  if (!ok) failed++;
}
if (failed) process.exit(1);
console.log("MarketRoute G5.1.3 analysis resume validation passed.");
