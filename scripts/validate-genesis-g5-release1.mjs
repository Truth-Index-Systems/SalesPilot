import fs from 'node:fs';
const migration=fs.readFileSync('supabase/migrations/0074_genesis_g5_release1_canonical_engagement_state_machine.sql','utf8');
const ts=fs.readFileSync('lib/engagement/g5-state-machine.ts','utf8');
const requiredStates=['WAITING','REASONING','STRATEGY_READY','GENERATING','SELF_REVIEW','READY_FOR_APPROVAL','APPROVED','QUEUED','SENT','FAILED_RETRYABLE','FAILED_TERMINAL'];
for(const state of requiredStates){if(!migration.includes(`'${state}'`)||!ts.includes(`"${state}"`)) throw new Error(`Missing G5 state ${state}`);}
for(const fn of ['seed_g5_engagement_strategies','claim_g5_engagement_strategy','transition_g5_engagement_strategy','fail_g5_engagement_strategy']) if(!migration.includes(fn)) throw new Error(`Missing ${fn}`);
if(!migration.includes('G5_ENGAGEMENT_OWNERSHIP_LOST')) throw new Error('Ownership fencing missing');
if(!migration.includes("o.status='APPROVED'")) throw new Error('Approved Opportunity gate missing');
if(/update\s+public\.opportunities/i.test(migration)) throw new Error('G5 Release 1 must not mutate opportunities');
if(/update\s+public\.company_|update\s+public\.companies|update\s+public\.contact/i.test(migration)) throw new Error('G5 Release 1 must not mutate G4 truth');
console.log('Genesis G5 Release 1 validation passed: canonical state machine, ownership fencing, retry states and G4 immutability boundary present.');
