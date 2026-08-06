import fs from "node:fs";

const migration = fs.readFileSync("supabase/migrations/0045_genesis_g43_route_aware_opportunity_scoring.sql", "utf8");
const domain = fs.readFileSync("lib/opportunities/domain.ts", "utf8");
const routeView = fs.readFileSync("lib/opportunities/route-view.ts", "utf8");
const queue = fs.readFileSync("components/opportunity-review-queue.tsx", "utf8");

const requiredMigrationTokens = [
  "route_quality integer",
  "route_confidence integer",
  "recommended_entry_strategy text",
  "opportunity-score/v2-route-quality",
  "v_route_quality::numeric*0.24",
  "v_route_confidence::numeric*0.10",
  "ROUTE_AWARE_OPPORTUNITY_SCORE",
  "Human decisions remain authoritative",
];
for (const token of requiredMigrationTokens) {
  if (!migration.includes(token)) throw new Error(`G4.3 migration missing: ${token}`);
}
if (migration.includes("v_buying_authority::numeric*0.20+\n      v_contactability::numeric*0.15")) {
  throw new Error("Legacy authority-first opportunity weighting is still active.");
}
for (const token of ["route_quality", "route_confidence", "recommended_entry_strategy"]) {
  if (!domain.includes(token)) throw new Error(`Opportunity domain missing: ${token}`);
}
if (!routeView.includes("row.route_quality") || !routeView.includes("row.route_confidence")) {
  throw new Error("Route view does not consume persisted G4.3 scores.");
}
if (!queue.includes("<span>Route quality</span>") || !queue.includes("<span>Route confidence</span>")) {
  throw new Error("Opportunity cards do not expose route-aware scoring.");
}
console.log("Genesis G4.3 route-aware opportunity scoring validation passed.");
