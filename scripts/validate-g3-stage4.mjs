import fs from "node:fs";
const checks = [
  ["app/contacts/page.tsx", ["Company contact coverage", "SalesPilot activity", "Next autonomous stage", "Outreach"]],
  ["components/contact-review-queue.tsx", ["Recommended because", "Strong identity and role confidence"]],
  ["app/campaigns/[id]/page.tsx", ["contactCounts", "Contact Discovery", "campaign-contact-status", "Open campaign contacts"]],
  ["components/company-review-queue.tsx", ["company-contact-progress", "Contact research queued"]],
];
for (const [file, needles] of checks) {
  const text = fs.readFileSync(file, "utf8");
  for (const needle of needles) if (!text.includes(needle)) throw new Error(`${file} missing ${needle}`);
}
console.log("G3 Stage 4 campaign integration contract passed.");
