# MR-TI-2 Build 8.3.2 — Expansion / Repair AI Namespace Isolation

## Purpose
Autonomous expansion had been reusing `GENESIS_G8_REPAIR` as its governance and background-response identity. This allowed expansion and repair checkpoint histories to share one namespace and made expansion retries vulnerable to incompatible completed response history.

## Changes
- Added dedicated `GENESIS_G82_EXPANSION` AI job type and request task.
- Added a dedicated expansion workload/timeout profile.
- Expansion background-response recovery, submission, discard and retry now use only `GENESIS_G82_EXPANSION`.
- Expansion request scopes are versioned under `genesis-g82-expansion-v2:` so previously persisted repair-typed expansion checkpoints cannot be reused.
- Discovery repair remains exclusively `GENESIS_G8_REPAIR`.
- Migration 0133 extends the AI ledger constraint and reservation RPC to accept the new expansion type while retaining shared workspace spend and heavy-work parallelism limits.
- Capacity accounting includes both repair and expansion AI spend.

## Production requirement
Apply migration `0133_genesis_g82_mrti2_build8_3_2_expansion_repair_namespace_isolation.sql` after deployment.
