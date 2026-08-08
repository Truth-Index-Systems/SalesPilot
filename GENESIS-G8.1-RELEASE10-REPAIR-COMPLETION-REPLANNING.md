# Genesis G8.1 Release 10 — Repair Completion & Replanning Loop

R10 closes the iterative autonomous loop after R9 exact Discovery repair.

## Flow

1. R9 finishes an exact claim repair and persists sourced evidence only.
2. Repair completion atomically creates a durable R10 replan job.
3. R10 rehydrates the entity through MR-TI-1.0 at current time.
4. Eligibility is recalculated from Truth, coverage, review state and current gaps.
5. R6 produces the next deterministic dual-channel plan.
6. R7 creates execution instructions and R8 dispatches them.
7. READY stops research; HUMAN_REVIEW stops at the founder; NOT_USABLE falls back to full Discovery; remaining exact gaps can create another bounded repair cycle.

## Loop safety

- Replan jobs are leased and retry-safe.
- Material Truth/gap state is fingerprinted.
- `(entity_id,state_fingerprint)` is unique, preventing an unchanged state from looping forever.
- No-verifiable-evidence on blocking work escalates to human review rather than spending another AI call.
- No-verifiable-evidence on non-blocking work leaves otherwise-usable Knowledge available and closes the repair cycle.
- R10 scopes new repair/review dispatch keys by state fingerprint so a genuinely changed state can create a legitimate next repair without defeating R7/R8 idempotency.

## Boundaries

R10 does not research, invent facts, change the Truth equation, or replace Discovery Intelligence. It only re-evaluates and dispatches the next deterministic action.
