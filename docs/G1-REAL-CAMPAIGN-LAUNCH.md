# Genesis G1 — Real campaign creation

## What this release does

- Saves the approved Business DNA and its exact versioned payload.
- Saves the selected campaign as configuration version 1.
- Creates a customer timeline.
- writes one `CampaignCreated` outbox event.
- Uses a transactional Postgres RPC and advisory-lock idempotency.
- Replaces mock campaign list/detail data with persisted records.
- Does not begin company discovery.

## Local setup

1. Apply `supabase/migrations/0001_genesis_campaign_foundation.sql` to a development Supabase project.
2. Run `supabase/seed-dev.sql` and copy the organisation UUID.
3. Copy `.env.example` to `.env.local` and set:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `SALESPILOT_DEV_ORGANISATION_ID`
   - `SALESPILOT_ALLOW_DEV_PERSISTENCE=true`
4. Restart Next.js.

The service-role key is server-only. Never prefix it with `NEXT_PUBLIC_`.

## Production safety

Genesis does not yet contain the final signup/session flow. Production persistence therefore fails closed unless the explicit development flag is set. Before commercial release, replace the development workspace resolver with authenticated organisation membership and remove the flag.
