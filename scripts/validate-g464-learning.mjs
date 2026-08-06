import fs from 'node:fs';
const migration=fs.readFileSync('supabase/migrations/0051_genesis_g464_channel_route_learning.sql','utf8');
const required=['engagement_outcomes','record_engagement_outcome','engagement_channel_learning','NO_RESPONSE','MEETING_BOOKED','route_quality','latest_outcome'];
for(const token of required) if(!migration.includes(token)) throw new Error(`Missing ${token}`);
for(const file of ['components/engagement-outcome-actions.tsx','app/api/engagements/[id]/outcome/route.ts']) if(!fs.existsSync(file)) throw new Error(`Missing ${file}`);
console.log('G4.6.4 channel and route learning validation passed.');
