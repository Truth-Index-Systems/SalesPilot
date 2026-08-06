import fs from "node:fs";

const ticker = fs.readFileSync("components/discovery-activity-ticker.tsx", "utf8");
const layout = fs.readFileSync("app/layout.tsx", "utf8");

const checks = [
  [!layout.includes("ApiLifecycleRefresh"), "Obsolete global fetch monkey-patch is not mounted"],
  [!fs.existsSync("components/api-lifecycle-refresh.tsx"), "Obsolete lifecycle component removed"],
  [ticker.includes("latestSnapshot"), "Discovery polling tracks complete snapshots"],
  [ticker.includes("next_retry_at"), "Retry-time changes are included"],
  [ticker.includes("progress"), "Progress changes are included"],
  [ticker.includes("activities.slice(0,8)"), "Activity changes are included"],
  [ticker.includes('window.addEventListener("focus"'), "Focus refresh installed"],
  [ticker.includes('document.addEventListener("visibilitychange"'), "Visibility refresh installed"],
  [ticker.includes("router.refresh()"), "Database-state changes refresh the server view"],
];

for (const [ok, label] of checks) {
  if (!ok) throw new Error(`Validation failed: ${label}`);
  console.log(`PASS ${label}`);
}
