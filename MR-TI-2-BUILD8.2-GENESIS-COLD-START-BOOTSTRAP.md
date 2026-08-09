# MR-TI-2 Build 8.2 — Genesis Cold-Start Bootstrap

## Root cause

The Genesis reset correctly removed generated intelligence, but it also removed `genesis_g82_expansion_targets`. Those rows are bootstrap configuration for autonomous industry expansion. Their original seed lived only in migration `0123`, so the already-migrated production database did not recreate them. Consequently `ensure_genesis_g82_expansion_backlog()` ran successfully but had zero targets to iterate over and created zero jobs.

## Fix

Migration `0130_genesis_g82_mrti2_build8_2_cold_start_bootstrap.sql` replaces the backlog RPC with a self-healing version. On every invocation it idempotently ensures the canonical ten expansion targets exist, then performs the existing R6 exhausted-job cleanup and backlog replenishment.

The seed is safe to execute repeatedly because it uses `ON CONFLICT (industry_key) DO NOTHING`; existing target customisation is not overwritten.

## Cold-start contract

A zero-state database with:

- zero intelligence entities,
- zero expansion memberships,
- zero expansion jobs,
- and zero expansion targets

can recover automatically from the ordinary `/api/autonomy/genesis-g8/operate/run` heartbeat. The first backlog call restores targets, creates jobs, and the existing worker can claim them in the same invocation.

## Data classification correction

`genesis_g82_expansion_targets` is configuration/bootstrap state and must be retained during future intelligence resets. Membership and jobs remain generated runtime state and may be cleared.
