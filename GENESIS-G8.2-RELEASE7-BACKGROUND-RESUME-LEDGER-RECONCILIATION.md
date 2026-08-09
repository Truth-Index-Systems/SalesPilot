# Genesis G8.2 R7 — Expansion Background Resume Identity & Ledger Reconciliation

R7 fixes a production resumability defect where a pending expansion request could be reclaimed with a different request fingerprint because lease attempt count and the mutable excluded-domain set were part of checkpoint identity. Completed provider responses then remained attached to `RESERVED` AI ledger rows while the worker searched for a different checkpoint, eventually occupying the heavy-work concurrency cap.

## Changes

- Expansion checkpoint fingerprint is now based on durable job identity, industry, genuine attempt cycle and search angle; mutable excluded domains are no longer part of provider-work identity.
- Before reserving new expansion work, Genesis reconciles completed background responses already attached to the same expansion job whose AI ledger is still `RESERVED`.
- A valid recovered response with companies is consumed and returned to the normal evidence/Truth persistence path, capped to the restored three-company envelope.
- Valid completed empty responses close their ledger so they cannot occupy capacity forever; normal recovery research can continue.
- Malformed completed responses are terminally recorded as failed rather than left reserved.
- `OPENAI_BACKGROUND_PENDING` lease releases no longer consume an expansion attempt. Genuine failures/empty-result retries still consume attempts and therefore still rotate search angle.

No Truth equation, evidence weighting, customer Discovery behaviour, cron cadence or capacity allocation is changed.
