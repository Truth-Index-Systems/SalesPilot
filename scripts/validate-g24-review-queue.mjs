import fs from "node:fs";

const required = [
  ["supabase/migrations/0008_genesis_g24_review_queue_freeze.sql", ["company_review_events", "review_salespilot_company", "bulk_review_salespilot_companies", "COMPANY_REVIEWED"]],
  ["components/company-review-queue.tsx", ["Approve selected", "review-bulk", "Select all on this page"]],
  ["components/company-review-actions.tsx", ["Review note", "Return to review"]],
  ["app/companies/page.tsx", ["Company research", "Search company, industry or country", "High confidence"]],
  ["app/companies/[id]/page.tsx", ["Review history", "review_history"]],
];
for (const [file, needles] of required) {
  const text = fs.readFileSync(file, "utf8");
  for (const needle of needles) if (!text.includes(needle)) throw new Error(`${file} missing ${needle}`);
}
console.log("Genesis G2.4 review queue validation passed");
