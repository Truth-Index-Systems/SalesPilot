# Genesis G8.2 — Depth AI Job-Type Reconciliation

## Defect

Fresh G8.2 depth jobs could reach `RESEARCH_DISPATCH` and then fail at `reserve_ai_request` with PostgreSQL `P0001: invalid AI job type`.

The TypeScript governance contract and depth worker correctly use `GENESIS_G82_DEPTH`. Migration `0138` also introduced that job type correctly. A later migration (`0148`, capacity/backpressure hardening) redefined `reserve_ai_request` from an older allow-list and accidentally omitted `GENESIS_G82_DEPTH`.

This produced asymmetric behaviour: a resumed depth request with an existing AI ledger entry could continue through the idempotency fast path, while a fresh depth request requiring a new reservation failed before reaching OpenAI.

## Fix

Migration `0150_genesis_g82_depth_ai_job_type_reconciliation.sql` restores `GENESIS_G82_DEPTH` to every relevant governance set:

- `reserve_ai_request` valid job types;
- organisation heavy in-flight counting;
- campaign research eligibility/counting;
- `ai_governance_capacity_snapshot` heavy/campaign counts.

The 12-slot organisation cap, 3-slot campaign research cap, daily request/cost governance, reservation reconciliation, and all CIE/Truth/CE2 authority remain unchanged.

## Deployment

Apply migration `0150_genesis_g82_depth_ai_job_type_reconciliation.sql`, then deploy the application bundle.

No data reset or queue mutation is required. Retryable depth jobs can be reclaimed naturally by the existing worker.
