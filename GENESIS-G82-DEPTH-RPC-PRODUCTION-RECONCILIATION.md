# Genesis G8.2 Depth RPC Production Reconciliation

Production proved that application scheduling is now reaching the depth subsystem, but PostgREST returned `PGRST202` for both `ensure_genesis_g82_depth_backlog(p_limit)` and `claim_genesis_g82_depth_jobs(p_limit,p_worker_id,p_lease_seconds)`.

Root cause: migration `0136_genesis_g82_background_depth_enrichment.sql` existed in the application archive but had not been applied to the production Supabase database.

This reconciliation adds an idempotent migration `0137_genesis_g82_depth_rpc_production_reconciliation.sql`, recreating the queue table and all three service-role RPCs with signatures matching the production worker exactly. It also sends `NOTIFY pgrst, 'reload schema'` so PostgREST refreshes its schema cache immediately.

If Vercel deployment does not apply Supabase migrations automatically, run `APPLY-IN-SUPABASE-G8.2-DEPTH-RPC-RECONCILIATION.sql` once in the Supabase SQL Editor before validating the next cron run.

Expected next-run sequence:

1. `ensure_genesis_g82_depth_backlog` -> 2xx
2. `claim_genesis_g82_depth_jobs` -> 2xx
3. depth AI dispatch (if governed AI capacity is available)
4. `settle_genesis_g82_depth_job` -> 2xx
5. contact/route entity counts increase

Breadth expansion remains unchanged. `reserve_ai_request` remains the final AI-spend authority.
