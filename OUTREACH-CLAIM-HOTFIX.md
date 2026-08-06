# G4 Outreach Generation Claim Hotfix

Apply `supabase/migrations/0043_fix_outreach_generation_claim_ambiguity.sql` after migration 0042.

The function returned an output column named `engagement_id` while also using `ON CONFLICT (engagement_id)`, which PL/pgSQL treated as ambiguous. The hotfix targets the named unique constraint `engagement_drafts_engagement_id_key`.

No OpenAI, scheduler, customer-flow, or cost-optimisation behaviour is changed.
