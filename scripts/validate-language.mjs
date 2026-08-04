import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const customerFiles = [
  "app/page.tsx",
  "app/campaigns/page.tsx",
  "app/campaigns/[id]/page.tsx",
  "app/companies/page.tsx",
  "app/replies/page.tsx",
  "app/opportunities/page.tsx",
  "app/focus/page.tsx",
  "app/settings/page.tsx",
  "components/campaign-wizard.tsx",
  "components/shell.tsx"
];

const forbidden = [
  /\bagent\b/i,
  /\bworker\b/i,
  /\brepository\b/i,
  /\bqueue\b/i,
  /\bschema[- ]validated\b/i,
  /\bprompt version\b/i,
  /\bmodel outputs?\b/i,
  /\bautonomous engine\b/i,
  /\boperate(s|d|ing)? the engine\b/i,
  /\bthe machinery\b/i
];

for (const file of customerFiles) {
  const source = fs.readFileSync(path.join(root, file), "utf8")
    .replace(/^import\s[\s\S]*?;$/gm, "");
  for (const pattern of forbidden) {
    if (pattern.test(source)) throw new Error(`Customer language leak in ${file}: ${pattern}`);
  }
}

const presentation = fs.readFileSync(path.join(root, "lib/presentation/outcomes.ts"), "utf8");
for (const required of ["presentDomainEvent", "CustomerOutcome", "CampaignLaunched", "OpportunityCreated", "event.name"]) {
  if (!presentation.includes(required)) throw new Error(`Missing presentation boundary token: ${required}`);
}

console.log("SalesPilot customer-language validation passed.");
