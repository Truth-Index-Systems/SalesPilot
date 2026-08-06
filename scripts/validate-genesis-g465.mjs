import fs from 'node:fs';
const must=[
  ['supabase/migrations/0052_genesis_g465_controlled_learning_activation.sql','sync_engagement_learning_guidance'],
  ['lib/pipeline/scheduler.ts','engagementLearningGuidance'],
  ['app/replies/[id]/page.tsx','Market evidence'],
  ['lib/engagement/review-types.ts','learning_signal_strength'],
];
for(const [file,text] of must){const body=fs.readFileSync(file,'utf8');if(!body.includes(text))throw new Error(`${file} missing ${text}`)}
console.log('Genesis G4.6.5 validation passed');
