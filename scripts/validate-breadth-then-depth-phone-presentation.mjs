import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const migration = read("supabase/migrations/0088_genesis_post_freeze_breadth_then_depth_route_research_and_phone_presentation.sql");
const routeView = read("lib/opportunities/route-view.ts");
const opportunity = read("app/opportunities/[id]/page.tsx");
const campaign = read("app/campaigns/[id]/page.tsx");

const checks = [
  ["depth focus column", /add column if not exists depth_focus_started_at timestamptz/i.test(migration)],
  ["focused account gets first claim priority", /when s\.depth_focus_started_at is not null then 0/.test(migration)],
  ["pass zero precedes new depth work", /when coalesce\(s\.route_expansion_pass,0\)=0 then 1/.test(migration)],
  ["depth focus promoted only after pass zero", /when coalesce\(target\.route_expansion_pass,0\)>0 then coalesce\(target\.depth_focus_started_at,now\(\)\)/.test(migration)],
  ["ready releases focus", /route_research_state='READY'[\s\S]*depth_focus_started_at=null/.test(migration)],
  ["exhausted releases focus", /route_research_state='EXHAUSTED'[\s\S]*depth_focus_started_at=null/.test(migration)],
  ["planner mirrors breadth-depth priority", (migration.match(/when s\.depth_focus_started_at is not null then 0/g) ?? []).length >= 2],
  ["governance remains budget blocking not failing", /'BUDGET_BLOCKED'::text/.test(migration)],
  ["one heavyweight policy documented", /one heavyweight Route Intelligence/.test(migration)],
  ["market scan progress exposed", /routeMarketScanComplete/.test(campaign) && /Market scan/.test(campaign)],
  ["route view carries phone", /phone: string \| null/.test(routeView) && /intelligentType === "SWITCHBOARD"/.test(routeView)],
  ["phone next step displays number", /Call \$\{phone\}/.test(routeView)],
  ["alternative switchboard route displays channel value", /routeChannel === "SWITCHBOARD" && routeValue/.test(opportunity)],
  ["G5 selected switchboard route displays number", /selectedCommercialRouteDisplay/.test(opportunity) && /selectedCommercialRouteChannelValue/.test(opportunity)],
  ["G5 switchboard preview displays phone number", /outreach\.channel === "SWITCHBOARD"[\s\S]*Phone number/.test(opportunity)],
];

let failed = 0;
for (const [name, ok] of checks) {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}`);
  if (!ok) failed += 1;
}
console.log(`\n${checks.length - failed}/${checks.length} checks passed`);
if (failed) process.exit(1);
