import fs from "node:fs";

const required = [
  "app/opportunities/page.tsx",
  "app/opportunities/[id]/page.tsx",
  "components/opportunity-review-queue.tsx",
  "components/opportunity-review-actions.tsx",
  "app/api/opportunities/[id]/review/route.ts",
  "app/api/opportunities/review-bulk/route.ts",
  "supabase/migrations/0031_genesis_g35_phase3_opportunity_review.sql",
];
for (const file of required) {
  if (!fs.existsSync(file)) throw new Error(`Missing ${file}`);
}
const page = fs.readFileSync("app/opportunities/page.tsx", "utf8");
const detail = fs.readFileSync("app/opportunities/[id]/page.tsx", "utf8");
const migration = fs.readFileSync("supabase/migrations/0031_genesis_g35_phase3_opportunity_review.sql", "utf8");
if (!page.includes("OpportunityReviewQueue")) throw new Error("Opportunity review queue is not wired");
if (!page.includes("Nothing discovered is hidden")) throw new Error("Transparency principle missing");
if (!detail.includes("Opportunity score explained")) throw new Error("Score explanation missing");
if (!migration.includes("bulk_review_salespilot_opportunities_scoped")) throw new Error("Bulk review RPC missing");
if (!migration.includes("company_evidence")) throw new Error("Unified evidence view missing");
console.log("Genesis G3.5 Phase 3 opportunity review contract passed.");
