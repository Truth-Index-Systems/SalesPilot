# Genesis G4.7.9 — Company Discovery Freeze / Legacy Leak Hardening

## Root causes found

1. `prepare_pipeline_work()` still duplicated expired-worker recovery even though `recover_pipeline_jobs()` is the canonical recovery authority.
2. The duplicate recovery updated legacy `status` without canonical `job_state`, allowing impossible `FAILED + RUNNING` rows.
3. The G2 `retry_company_discovery()` RPC was still effective. It changed `status` to `QUEUED` without changing `job_state`, so terminal jobs could appear restarted but remain unclaimable.
4. Company replenishment reopen had the same split-state bug: `status='QUEUED'` without `job_state='QUEUED'`.
5. The campaign UI treated every Company Discovery terminal failure as campaign-blocking, including later replenishment cycles after a usable company batch had already been established.

## Changes

- Added migration `0071_genesis_g479_company_discovery_legacy_recovery_leak.sql`.
- `recover_pipeline_jobs()` remains the sole lease-expiry recovery authority.
- Repairs impossible legacy split-state rows.
- Replenishment reopen resets canonical job state and stale ownership fields.
- Replaces G2 manual discovery retry RPC with a canonical G4 retry.
- Campaign UI distinguishes initial blocking failure from later non-blocking replenishment failure.
- Once approved/pending companies exist, a failed background top-up cannot pull the main campaign journey backwards from Route Intelligence / Opportunities.
- Discovery readback is explicitly ordered by `updated_at desc`.

## Frozen behaviour preserved

No change to Company Discovery AI, deterministic planning, six-pass search order, evidence verification, confidence thresholds, saving, expansion logic, or company review semantics.
