import fs from "node:fs";
const read=p=>fs.readFileSync(p,"utf8");
const migration=read("supabase/migrations/0039_genesis_g4_phase6_human_review.sql");
const page=read("app/replies/page.tsx");const detail=read("app/replies/[id]/page.tsx");const actions=read("components/engagement-review-actions.tsx");
const checks=[
 [migration.includes("engagement_human_reviews"),"human review audit table"],
 [migration.includes("review_engagement_draft"),"tenant-scoped review RPC"],
 [migration.includes("bulk_review_engagement_drafts"),"bulk review RPC"],
 [migration.includes("APPROVED_TO_SEND"),"approval stops before sending"],
 [migration.includes("DRAFT_REGENERATION_REQUESTED"),"regeneration history"],
 [page.includes("EngagementReviewQueue"),"review queue"],
 [detail.includes("EngagementReviewActions"),"review detail actions"],
 [actions.includes('"EDITED"')&&actions.includes('"REGENERATE_REQUESTED"'),"edit and regenerate actions"],
 [!migration.includes("v_next:='QUEUED_FOR_SEND'")&&!migration.includes("v_next:='SENT'"),"no direct send transition in phase 6"],
];
const failed=checks.filter(([ok])=>!ok);if(failed.length){console.error(failed.map(([,n])=>`Missing: ${n}`).join("\n"));process.exit(1)}console.log("Genesis G4 Phase 6 passed");
