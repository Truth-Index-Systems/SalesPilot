import fs from "node:fs";

const lifecycle = fs.readFileSync("components/api-lifecycle-refresh.tsx", "utf8");
const ticker = fs.readFileSync("components/discovery-activity-ticker.tsx", "utf8");
const layout = fs.readFileSync("app/layout.tsx", "utf8");

const checks = [
  [layout.includes("<ApiLifecycleRefresh />"), "Root layout mounts API lifecycle refresh"],
  [lifecycle.includes('new Set(["POST", "PUT", "PATCH", "DELETE"])'), "Mutating API methods are observed"],
  [lifecycle.includes('salespilot:api-start'), "API-start lifecycle event exists"],
  [lifecycle.includes('salespilot:api-finish'), "API-finish lifecycle event exists"],
  [lifecycle.includes("router.refresh()"), "Lifecycle refresh invokes router.refresh"],
  [ticker.includes("latestSnapshot"), "Discovery polling tracks complete snapshots"],
  [ticker.includes("next_retry_at"), "Retry-time changes are included"],
  [ticker.includes("progress"), "Progress changes are included"],
  [ticker.includes("activities.slice(0,8)"), "Activity changes are included"],
];

for (const [ok, label] of checks) {
  if (!ok) throw new Error(`Validation failed: ${label}`);
  console.log(`PASS ${label}`);
}
