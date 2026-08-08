# Genesis Speed R3 — Controlled Parallel Execution

## Goal

Allow independent AI work to progress concurrently without weakening MarketRoute's deterministic state authority, spend governance, background resumability, or G4→G5 responsibility boundary.

## What changed

### 1. Parallel scheduler lanes

The pipeline scheduler now dispatches independent G4 research and already-eligible G5 work concurrently.

- G4 default dispatch width: 2 (configurable 1–3 with `SALESPILOT_R3_G4_DISPATCH_WIDTH`)
- G5 default dispatch width: 2 (configurable 1–3 with `SALESPILOT_R3_G5_DISPATCH_WIDTH`)
- Route Intelligence keeps priority over speculative Company Discovery when route work is due.
- Each G5 lane stops after the first state-changing executive it successfully claims. No single opportunity can chain multiple G5 state changes in one lane.

### 2. Database-enforced in-flight caps

Migration `0095_genesis_speed_r3_controlled_parallel_execution.sql` hardens the AI reservation transaction with an organisation-scoped advisory lock.

Hard limits:

- maximum 2 heavyweight AI requests in flight per organisation
- maximum 3 Company Discovery / Route Intelligence requests in flight per campaign

Only `RESERVED` AI ledger entries count as in flight. The cap is checked before a new reservation/provider submission can occur.

### 3. Capacity is a defer, never a failure

When a parallel lane reaches an in-flight limit, governance emits `AI_PARALLEL_CAPACITY:*` rather than a normal allowance failure. Company Discovery, Route Intelligence, and G5 R2/R3/R4/R6 release their lease without consuming an attempt and retry later.

This prevents concurrency backpressure from being misclassified as a model failure or customer allowance problem.

### 4. Parallel observability

`/api/autonomy/pipeline/run` now includes `parallelExecution`, containing:

- G4 dispatch kind and every lane result
- every G5 lane result and stage claimed
- active configured scheduler widths
- hard organisation/campaign caps

The endpoint returns 207 if any parallel G4 worker fails or any G5 lane ends `FAILED_RETRYABLE`.

## Preserved boundaries

Unchanged:

- R2 webhook-first provider completion
- polling only as recovery
- response-id persistence
- AI usage reservation and cost limits
- Route Intelligence authority
- Opportunity assembly/scoring authority
- G5 commercial reasoning → channel → outreach → self-review state order
- deterministic personalisation safety, quality, approval and execution stages
- stale-worker/lease fencing

## Deployment

1. Deploy this ZIP on top of Speed R2.
2. Run `supabase/migrations/0095_genesis_speed_r3_controlled_parallel_execution.sql`.
3. Keep the R2 OpenAI webhook and collector configuration unchanged.
4. No new environment variables are required. Optional tuning:
   - `SALESPILOT_R3_G4_DISPATCH_WIDTH=2`
   - `SALESPILOT_R3_G5_DISPATCH_WIDTH=2`
5. Do not raise either scheduler width above 3. The code clamps values to 1–3 regardless.

## Validation

- `npm run speed:r3-check` — 18/18 PASS
- `npm run speed:r2-check` — 18/18 PASS
- `npm run speed:r1-check` — PASS
- `npm run all-ai:background-resumability-check` — 36/36 PASS

A full production compile was not available in the patch workspace because the supplied ZIP intentionally excludes `node_modules`. Global TypeScript parsing reached the modified files and reported only missing installed dependency/type declarations (`next`, `zod`, `@types/node`), not an R3-specific syntax error.

## Expected effect

R1 removed blocking AI paths. R2 made provider completion event-driven. R3 now removes artificial global serialisation: two independent heavyweight jobs for the same organisation may be provider-owned simultaneously, while other organisations can also progress when claimed. Throughput should improve materially without turning concurrency into unbounded spend.
