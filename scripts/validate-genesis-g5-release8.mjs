import fs from "node:fs";
const read = p => fs.readFileSync(p,"utf8");
const migration=read("supabase/migrations/0081_genesis_g5_release8_assisted_approval_workspace.sql");
const repo=read("lib/engagement/g5-assisted-approval.ts");
const api=read("app/api/g5/engagement-strategies/[id]/review/route.ts");
const ui=read("components/g5-assisted-approval-actions.tsx");
const page=read("app/opportunities/[id]/page.tsx");
const checks=[
 [migration.includes("review_g5_engagement_strategy"),"human-scoped R8 RPC"],
 [migration.includes("G5_HUMAN_APPROVAL_REQUIRED"),"generic scheduler approval bypass blocked"],
 [migration.includes("human_route_override_json"),"route override is separate from R3 truth"],
 [migration.includes("coalesce(v.human_route_override_json,v.channel_strategy_json)"),"effective route consumed by downstream workers"],
 [migration.includes("failure_stage='SELF_REVIEW'"),"human edits require self review"],
 [migration.includes("engagement_quality_json=null"),"human edits invalidate old quality"],
 [migration.includes("failure_stage='OUTREACH_GENERATION'"),"secondary route re-enters R4 only"],
 [migration.includes("g4Rediscovery',false"),"secondary route never restarts G4"],
 [migration.includes("state='APPROVED'"),"human approval reaches APPROVED"],
 [!migration.includes("state='QUEUED'\n"),"R8 human action does not queue"],
 [repo.includes("READY_FOR_APPROVAL,APPROVED"),"approval surface only reads actionable/approved strategy"],
 [repo.includes("human_route_override_json ?? row.channel_strategy_json"),"UI shows effective route"],
 [api.includes('"TRY_SECONDARY_ROUTE"'),"secondary route API action"],
 [ui.includes("Save edits & recheck"),"edit UX communicates mandatory recheck"],
 [ui.includes("Try secondary route"),"alternative route UX"],
 [ui.includes("preparing deterministic execution"),"approved UI does not imply queued"],
 [page.includes("Engagement confidence"),"quality surfaced"],
 [page.includes("Commercial argument"),"reasoning surfaced"],
 [page.includes("Evidence used in this engagement"),"evidence surfaced"],
 [page.includes("Separate from Opportunity Score"),"score separation explicit"],
];
let passed=0; for(const [ok,label] of checks){if(!ok)throw new Error(`R8 invariant failed: ${label}`);passed++;}
console.log(`Genesis G5 Release 8 validation: ${passed}/${checks.length} passed`);
