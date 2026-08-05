import fs from "node:fs";

const required = [
  ["lib/pipeline/presentation.ts", "resolvePersistedJobState"],
  ["app/contacts/page.tsx", "resolvePersistedJobState"],
  ["app/campaigns/[id]/page.tsx", "derivePipelineCampaignStage"],
  ["components/discovery-activity-ticker.tsx", "isJobActive"],
  ["docs/genesis-stabilisation/s8-ui-state-accuracy.md", "Persisted truth"],
];
for (const [file, marker] of required) {
  const text = fs.readFileSync(file, "utf8");
  if (!text.includes(marker)) throw new Error(`${file} missing ${marker}`);
}
console.log("Genesis stabilisation S8 contract passed.");
