# MarketRoute Genesis G5 — Release 9: Queue & Execution Engine

R9 owns only the deterministic execution boundary after human approval.

## Canonical flow

`APPROVED -> QUEUED -> SENT`

## Protections

- Revalidates approved G4 Opportunity and exact persisted commercial route before queueing.
- Campaign PAUSED/ARCHIVED blocks queueing.
- One queue row per G5 strategy; duplicate sends are structurally prevented.
- EMAIL requires a valid recipient and deterministic timezone.
- Unknown timezone creates a hold; MarketRoute never guesses.
- IANA timezone scheduling preserves DST and the 08:00–18:00 recipient-local first-outreach rule.
- Due work is lease-owned; stale workers cannot commit a send.
- SMTP transport failures retry the same approved content and never trigger regeneration.
- LinkedIn, Switchboard and Referral are `MANUAL_ACTION_REQUIRED`; R9 never falsely marks them SENT.
- Live email transport is opt-in and requires `OUTBOUND_EMAIL_TRANSPORT=SMTP` plus SMTP env configuration. No keys are included.

## Migration

`0082_genesis_g5_release9_queue_and_execution_engine.sql`
