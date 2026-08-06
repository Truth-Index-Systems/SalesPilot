import fs from "node:fs";
const required = {
  "lib/pipeline/scheduler.ts": ["syncEngagementStrategies(runId)", "reconcileEngagementFailures(runId)", "engagementStrategy"],
  "lib/engagement/strategy.ts": ["sync_engagement_strategies", "record_engagement_pipeline_stage", "reconcile_engagement_pipeline_failures"],
  "lib/engagement/commercial-reasoning.ts": ["COMMERCIAL_REASONING", "CHANNEL_CONTENT_GENERATION"],
  "lib/engagement/outreach-generation.ts": ["CHANNEL_CONTENT_GENERATION", "AI_QUALITY_REVIEW"],
  "lib/engagement/self-review.ts": ["AI_QUALITY_REVIEW", "HUMAN_REVIEW"],
  "supabase/migrations/0048_genesis_g461_channel_aware_engagement_foundation.sql": ["primary_channel", "WEBSITE_FORM", "engagement_pipeline_events", "NEEDS_ATTENTION", "engagement_pipeline_timeline"],
  "app/replies/[id]/page.tsx": ["Recommended engagement", "Pipeline status", "Primary channel"],
};
for (const [file, tokens] of Object.entries(required)) {
  if (!fs.existsSync(file)) throw new Error(`Missing ${file}`);
  const text = fs.readFileSync(file, "utf8");
  for (const token of tokens) if (!text.includes(token)) throw new Error(`${file} missing ${token}`);
}
console.log("Genesis G4.6.1 validation passed.");
