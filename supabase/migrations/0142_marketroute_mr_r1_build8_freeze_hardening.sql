-- MarketRoute MR-R1 Build 8 — freeze hardening.
-- Integration-layer hardening only. CE-R1 / CE-R2 remain frozen and untouched.

begin;

-- Build 6 completeness read policy must match neighbouring Genesis integration
-- tables: only ACTIVE organisation members may read campaign completeness.
drop policy if exists campaign_genesis_t8_business_dna_completeness_member_read
  on public.campaign_genesis_t8_business_dna_completeness;
create policy campaign_genesis_t8_business_dna_completeness_member_read
  on public.campaign_genesis_t8_business_dna_completeness
  for select to authenticated
  using (exists (
    select 1
    from public.organisation_memberships om
    where om.organisation_id = campaign_genesis_t8_business_dna_completeness.organisation_id
      and om.user_id = auth.uid()
      and om.status = 'ACTIVE'
  ));

-- Strengthen the immutable measurement boundary while touching it for freeze.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.campaign_genesis_t8_business_dna_completeness'::regclass
      and conname = 'campaign_genesis_t8_completeness_json_object_check'
  ) then
    alter table public.campaign_genesis_t8_business_dna_completeness
      add constraint campaign_genesis_t8_completeness_json_object_check
      check (jsonb_typeof(completeness_json) = 'object');
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.campaign_genesis_t8_business_dna_completeness'::regclass
      and conname = 'campaign_genesis_t8_completeness_fingerprint_check'
  ) then
    alter table public.campaign_genesis_t8_business_dna_completeness
      add constraint campaign_genesis_t8_completeness_fingerprint_check
      check (completeness_fingerprint ~ '^[0-9a-f]{64}$');
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.campaign_genesis_t8_business_dna_completeness'::regclass
      and conname = 'campaign_genesis_t8_completeness_seller_fingerprint_check'
  ) then
    alter table public.campaign_genesis_t8_business_dna_completeness
      add constraint campaign_genesis_t8_completeness_seller_fingerprint_check
      check (seller_context_fingerprint ~ '^[0-9a-f]{64}$');
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.campaign_genesis_t8_business_dna_completeness'::regclass
      and conname = 'campaign_genesis_t8_completeness_constraint_fingerprint_check'
  ) then
    alter table public.campaign_genesis_t8_business_dna_completeness
      add constraint campaign_genesis_t8_completeness_constraint_fingerprint_check
      check (constraint_fingerprint ~ '^[0-9a-f]{64}$');
  end if;
end $$;

comment on table public.campaign_genesis_t8_business_dna_completeness is
  'MR-R1 Build 6 immutable Business DNA completeness measurement, hardened at MR-R1 Build 8. Deterministic integration state; CE-R1/CE-R2 unchanged.';

commit;
