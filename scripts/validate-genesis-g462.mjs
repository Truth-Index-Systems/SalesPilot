import fs from "node:fs";
const read=p=>fs.readFileSync(new URL(`../${p}`,import.meta.url),"utf8");
const required=[
 ["lib/engagement/outreach-generation-schema.ts","engagement-channel-content/v1"],
 ["lib/engagement/outreach-generation-openai.ts","CHANNEL_STRATEGY_MISMATCH"],
 ["components/channel-engagement-content.tsx","Contact form message"],
 ["supabase/migrations/0049_genesis_g462_channel_specific_generation.sql","channel_content_json"],
 ["supabase/migrations/0049_genesis_g462_channel_specific_generation.sql","coalesce(e.primary_channel,e.channel_type)='EMAIL'"],
];
for(const [p,n] of required){if(!read(p).includes(n))throw new Error(`${p} missing ${n}`)}
console.log("Genesis G4.6.2 channel-specific generation validation passed.");
