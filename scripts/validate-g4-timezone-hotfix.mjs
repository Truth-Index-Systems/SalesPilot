import fs from "node:fs";
const read = p => fs.readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const dateTime = read("lib/date-time.ts");
const presentation = read("lib/pipeline/presentation.ts");
const campaign = read("app/campaigns/[id]/page.tsx");
const timeline = read("components/timeline-box.tsx");
const checks = [
  [dateTime.includes('Europe/London'), "IANA UK timezone"],
  [dateTime.includes('Intl.DateTimeFormat("en-GB"'), "central formatter"],
  [presentation.includes("formatDateTime(job.next_retry_at)"), "retry label formatter"],
  [campaign.includes("formatDateTime(entry.occurredAt)"), "campaign timeline formatter"],
  [timeline.includes("formatDateTime(entry.occurredAt)"), "shared timeline formatter"],
];
for (const [ok, label] of checks) if (!ok) throw new Error(`Missing ${label}`);
console.log("G4 UK timezone hotfix validation passed");
