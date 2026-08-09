# MR-TI-2 Build 8.3.6 — AI Governance Lease Reconciliation

This release replaces the historic two-hour `RESERVED` age window used for AI parallel capacity with explicit reservation leases and durable-background-checkpoint reconciliation.

A reservation receives a 10-minute lease. Queued/in-progress background checkpoints renew that lease. Completed/failed/cancelled/incomplete provider checkpoints immediately stop consuming parallel capacity. Expired reservations with no durable background checkpoint are failed as `AI_RESERVATION_LEASE_EXPIRED` and released.

`reserveAiRequest()` reconciles before its idempotency fast path, and `reserve_ai_request()` reconciles again under the organisation advisory transaction lock. This closes both the application-side stale fast-path and database-side concurrent reservation race.

The global heavy-AI cap remains 2 and campaign research cap remains 3. Build 8.3.6 does not increase spend capacity; it makes existing capacity truthful.

Capacity denials now emit `AI_GOVERNANCE_CAPACITY` with active/limit counts for organisation and campaign research lanes.

Migration required: `0134_genesis_g82_mrti2_build8_3_6_ai_governance_lease_reconciliation.sql`.
