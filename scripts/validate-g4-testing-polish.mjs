import fs from "node:fs";
const read = p => fs.readFileSync(p,"utf8");
const timeline = read("components/timeline-box.tsx");
const campaign = read("app/campaigns/[id]/page.tsx");
const dashboard = read("app/dashboard/page.tsx");
const wizard = read("components/campaign-wizard.tsx");
const migration = read("supabase/migrations/0054_genesis_g4_testing_retry_and_timeline_polish.sql");
const required = [
  [timeline.includes('"today"') && timeline.includes('"week"') && timeline.includes('"month"') && timeline.includes('"all"'), "timeline ranges"],
  [timeline.includes("max-height") === false, "timeline height belongs in CSS"],
  [campaign.includes("<TimelineBox") && dashboard.includes("<TimelineBox dark"), "all product timelines use shared box"],
  [wizard.includes("Recommended first commercial approach"), "recommendation wording"],
  [wizard.includes("confirmation-details"), "collapsed unknowns"],
  [wizard.includes("Offer identified") && wizard.includes("Buyers identified"), "confidence evidence"],
  [campaign.includes("Company discovery retry is scheduled"), "consistent company discovery wording"],
  [migration.includes("interval '30 seconds'") && migration.includes("interval '2 minutes'"), "fast retry policy"],
];
const failures=required.filter(([ok])=>!ok).map(([,name])=>name);
if(failures.length){console.error("G4 testing polish validation failed:",failures);process.exit(1)}
console.log("G4 testing polish validation passed.");
