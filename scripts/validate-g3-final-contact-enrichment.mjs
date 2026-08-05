import fs from "node:fs";
const required={
  "supabase/migrations/0015_genesis_g3_contact_channels_and_polish.sql":["email_status","linkedin_profile_url","OFFICIAL_LINKEDIN_PROFILE","save_contact_discovery_batch"],
  "lib/contacts/openai.ts":["contact-discovery/v3","Never invent","LIKELY","linkedin.com/in"],
  "lib/contacts/normalise.ts":["validCompanyEmail","linkedinProfile","emailEvidence","linkedinEvidence"],
  "app/contacts/page.tsx":["Outreach channel readiness","ContactAutoRefresh","Verified emails"],
  "app/contacts/[id]/page.tsx":["Contact information","No supportable email found","Matched profile"],
  "components/contact-review-queue.tsx":["contact-channel-strip","email_status","linkedin_profile_url"]
};
for(const [file,tokens] of Object.entries(required)){const text=fs.readFileSync(file,"utf8");for(const token of tokens)if(!text.includes(token))throw new Error(`${file} missing ${token}`)}
console.log("G3 final contact enrichment contract passed.");
