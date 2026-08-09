# Genesis G8.2 Release 3 — Expansion Throughput & Founder Review Hardening

## Purpose

Increase autonomous knowledge-acquisition efficiency while repairing the founder-review database and hydration boundaries observed in production.

## Expansion throughput

- Autonomous expansion now returns up to **6 companies per governed AI research call** (previously 3).
- The model is instructed to reuse the same industry web-search context across the batch instead of repeating market-level research.
- Evidence quality remains authoritative: the model must not pad a batch with weak or duplicate companies.
- Existing canonical-domain deduplication remains in force before persistence.
- Each company may still include up to two evidenced contacts and one evidenced public route.
- Structured-output ceiling is raised to 10,000 tokens to accommodate the larger batch without reintroducing output-truncation failures.
- Governance reservation estimate defaults to $0.12 for the larger work unit; actual usage continues to be settled by the existing AI governance ledger.
- Truth Index, eligibility and review mathematics are unchanged.

## Founder review database repair

Migration `0125_genesis_g82_r3_review_resolver_and_expansion_throughput.sql` replaces the R11 resolver with a fully qualified implementation.

The old PL/pgSQL resolver used `review_task_id` in a `RETURNS TABLE` function without consistently qualifying the table column. PostgreSQL can resolve that identifier ambiguously against the output variable and raise a database error at review time.

R3:

- qualifies queue and receipt table references explicitly;
- keeps resolution idempotent;
- preserves immutable human-review receipts;
- never updates historical Truth snapshots;
- keeps rejection as suppression rather than deletion;
- cancels only queued repair work after a founder rejection;
- requires a persisted receipt before reporting success;
- reloads the PostgREST schema cache after migration.

## React hydration repair

The review workspace previously calculated relative times using `Date.now()` during render and formatted activity time using the executing environment's local timezone. Since client components are server-rendered before hydration, this could produce React hydration error #418.

R3 passes the server dashboard generation timestamp into the client and uses it as the deterministic relative-time reference. Activity time is rendered explicitly in `Europe/London` on both server and browser.

## Validation

- G8.2 R3 hardening: 16/16
- G8.2 R1 autonomous expansion: 32/32
- G8.2 R2 founder UX: 14/14
- G8.1 founder-review resolution: 22/22
- G8.1 R20 adaptive-default freeze: 27/27
- Modified TS/TSX syntax transpilation: passed

## Deployment

1. Apply migration `0125_genesis_g82_r3_review_resolver_and_expansion_throughput.sql`.
2. Deploy the R3 application bundle.
3. Refresh the Founder Dashboard.
4. Test one review action. A successful action should show immediate UI feedback and disappear from the open queue after refresh.
5. Observe the next autonomous expansion calls; completed jobs may now persist up to six companies per research response.
