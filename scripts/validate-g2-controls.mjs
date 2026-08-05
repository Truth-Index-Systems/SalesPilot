import fs from "node:fs";
const required = [
  ["components/campaign-control-actions.tsx", "Delete campaign"],
  ["app/api/campaigns/[id]/control/route.ts", "control_salespilot_campaign"],
  ["supabase/migrations/0009_genesis_g2_campaign_controls.sql", "PAUSED"],
  ["app/globals.css", ".confirm-dialog"],
  ["components/company-review-queue.tsx", "Open company report"],
];
for (const [file, text] of required) {
  const content = fs.readFileSync(file, "utf8");
  if (!content.includes(text)) throw new Error(`${file} missing ${text}`);
}
console.log("G2 campaign controls validation passed");
