import fs from "node:fs";

const reader = fs.readFileSync("lib/intelligence/website-reader.ts", "utf8");
const route = fs.readFileSync("app/api/intelligence/business-discovery/route.ts", "utf8");
const wizard = fs.readFileSync("components/campaign-wizard.tsx", "utf8");

const checks = [
  [reader.includes("normalizeWebsiteUrl"), "URL normalisation is present"],
  [reader.includes('redirect: "manual"'), "redirects are manually validated"],
  [reader.includes("WEBSITE_NOT_FOUND"), "website errors are typed"],
  [route.includes("customerErrorFor"), "server errors are mapped"],
  [!route.includes("error: message") && !route.includes("error: error.message"), "raw error messages are not returned"],
  [wizard.includes("website-error"), "premium error panel is rendered"],
  [wizard.includes("Try again"), "retry action is available"],
];

const failed = checks.filter(([ok]) => !ok);
for (const [ok, label] of checks) console.log(`${ok ? "✓" : "✗"} ${label}`);
if (failed.length) process.exit(1);
