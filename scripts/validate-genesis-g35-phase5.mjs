import fs from "node:fs";

const read = path => fs.readFileSync(path, "utf8");
const migration = read("supabase/migrations/0032_genesis_g35_phase5_engagement_bridge.sql");
const scheduler = read("lib/pipeline/scheduler.ts");
const page = read("app/replies/page.tsx");
const repository = read("lib/engagement/repository.ts");
const domain = read("lib/engagement/domain.ts");

const assertions = [
  [migration.includes("create table if not exists public.opportunity_engagements"), "Engagement persistence is campaign and opportunity scoped"],
  [migration.includes("unique (organisation_id,campaign_id,opportunity_id)"), "Only one engagement bridge record can exist per opportunity"],
  [migration.includes("where o.status='APPROVED'"), "Only approved opportunities progress into Engagement"],
  [migration.includes("where o.status='REJECTED' and e.status not in ('SENT','CANCELLED')"), "Rejected opportunities cancel unsent engagement work"],
  [migration.includes("v_channel='NONE' then 'NEEDS_ROUTE' else 'READY_FOR_DRAFT'"), "Reachability determines the truthful handoff state"],
  [migration.includes("campaign_autonomy_policies"), "The bridge snapshots future Auto Mode policies"],
  [migration.includes("This migration does not generate or send outreach"), "G3.5 does not send email prematurely"],
  [scheduler.includes("syncOpportunityEngagementBridge(runId)"), "The single scheduler owns Opportunity to Engagement progression"],
  [scheduler.indexOf("scoreOpportunityIntelligence(runId)") < scheduler.indexOf("syncOpportunityEngagementBridge(runId)"), "Engagement is prepared only after opportunity scoring"],
  [repository.includes("opportunity_engagement_overview"), "Engagement repository reads persisted truth"],
  [domain.includes('"READY_FOR_DRAFT"') && domain.includes('"NEEDS_ROUTE"'), "Engagement has explicit readiness states"],
  [page.includes("Approved opportunities, ready for the next move"), "Engagement UI presents the approved opportunity handoff"],
  [page.includes("No email is sent during G3.5"), "Empty state communicates the G4 boundary"],
];

const failed = assertions.filter(([ok]) => !ok);
for (const [ok, label] of assertions) console.log(`${ok ? "✓" : "✗"} ${label}`);
if (failed.length) process.exit(1);
console.log("G3.5 Phase 5 Engagement bridge contract passed.");
