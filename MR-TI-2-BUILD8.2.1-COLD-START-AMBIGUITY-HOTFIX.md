# MR-TI-2 Build 8.2.1 — Cold-Start `industry_key` Ambiguity Hotfix

## Production defect

The Build 8.2 cold-start RPC reached its target reseed path after the Genesis reset, but PostgreSQL returned `42702` because `industry_key` is both an output parameter of `ensure_genesis_g82_expansion_backlog` and a column of `genesis_g82_expansion_targets`. The unqualified `ON CONFLICT(industry_key)` was therefore ambiguous inside PL/pgSQL.

## Fix

The target reseed now uses the table's unique constraint explicitly:

```sql
on conflict on constraint genesis_g82_expansion_targets_industry_key_key do nothing
```

This is semantically identical to the intended upsert but cannot collide with the function's `industry_key` output variable.

Migration `0130` is corrected for clean installations, and migration `0131` repeats the `CREATE OR REPLACE FUNCTION` so production databases that already recorded 0130 as applied receive the fix.

No MR-TI-2 mathematics, evidence semantics, snapshot schema, or production Truth behaviour changes in this hotfix.
