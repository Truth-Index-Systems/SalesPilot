# MarketRoute Genesis G4 Phase 7 — Approval & Queue

## Purpose
Convert human-approved outreach into durable send instructions without sending messages.

## Migration
Apply `supabase/migrations/0040_genesis_g4_phase7_approval_queue.sql` after `0039`.

## Behaviour
- Scheduler-owned queue builder runs after AI self review.
- Only `APPROVED_TO_SEND` engagements are inspected.
- Completed draft and supported recipient route are required.
- Recipient timezone priority: recognised contact work location, then unambiguous company-country fallback.
- Sending window is fixed to 08:00–18:00 in the recipient timezone with DST handled by IANA timezone names.
- Unknown/ambiguous timezone cases remain `APPROVED_TO_SEND` and receive a safe hold record.
- Valid records move to `QUEUED_FOR_SEND` with `scheduled_for` set to now or the next permitted 08:00.
- No email, LinkedIn message, scheduling provider, or dispatch worker is invoked.

## Validate
```bash
npm install
npm run genesis:g4-phase7-check
npm run typecheck
npm run build
```
