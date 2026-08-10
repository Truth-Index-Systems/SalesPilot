-- MarketRoute MR-R1 Build 5 — immutable seller constraint contracts.
-- Application integration state only. CE-R1 and CE-R2 frozen kernels are not modified.

create table if not exists public.campaign_genesis_t8_constraint_sets (
  campaign_id uuid primary key references public.campaigns(id) on delete cascade,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  schema_version text not null,
  integration_version text not null,
  seller_context_fingerprint text not null check (seller_context_fingerprint ~ '^[0-9a-f]{64}$'),
  constraint_fingerprint text not null check (constraint_fingerprint ~ '^[0-9a-f]{64}$'),
  constraint_set_json jsonb not null check (jsonb_typeof(constraint_set_json)='object'),
  created_at timestamptz not null default now()
);

create index if not exists campaign_genesis_t8_constraint_sets_org_idx
  on public.campaign_genesis_t8_constraint_sets(organisation_id, created_at desc);
create unique index if not exists campaign_genesis_t8_constraint_sets_fingerprint_idx
  on public.campaign_genesis_t8_constraint_sets(campaign_id, constraint_fingerprint);

alter table public.campaign_genesis_t8_constraint_sets enable row level security;
drop policy if exists campaign_genesis_t8_constraint_sets_member_read on public.campaign_genesis_t8_constraint_sets;
create policy campaign_genesis_t8_constraint_sets_member_read on public.campaign_genesis_t8_constraint_sets
for select using (exists (
  select 1 from public.organisation_memberships om
  where om.organisation_id=campaign_genesis_t8_constraint_sets.organisation_id
    and om.user_id=auth.uid() and om.status='ACTIVE'
));

create or replace function public.persist_campaign_genesis_t8_constraint_set(
  p_campaign_id uuid,
  p_organisation_id uuid,
  p_schema_version text,
  p_integration_version text,
  p_seller_context_fingerprint text,
  p_constraint_fingerprint text,
  p_constraint_set jsonb
) returns boolean language plpgsql security definer set search_path=public as $$
declare
  existing record;
  context_fingerprint text;
begin
  if not exists(select 1 from public.campaigns c where c.id=p_campaign_id and c.organisation_id=p_organisation_id) then
    raise exception 'GENESIS_T8_CONSTRAINT_SET_CAMPAIGN_MISMATCH';
  end if;
  if p_constraint_set is null or jsonb_typeof(p_constraint_set) <> 'object' then
    raise exception 'GENESIS_T8_CONSTRAINT_SET_INVALID';
  end if;

  select source_fingerprint into context_fingerprint
  from public.campaign_genesis_t8_seller_contexts
  where campaign_id=p_campaign_id and organisation_id=p_organisation_id;
  if context_fingerprint is null then raise exception 'GENESIS_T8_CONSTRAINT_SET_SELLER_CONTEXT_REQUIRED'; end if;
  if context_fingerprint <> p_seller_context_fingerprint then raise exception 'GENESIS_T8_CONSTRAINT_SET_SOURCE_MISMATCH'; end if;

  select * into existing from public.campaign_genesis_t8_constraint_sets where campaign_id=p_campaign_id;
  if found then
    if existing.organisation_id <> p_organisation_id
      or existing.schema_version <> p_schema_version
      or existing.integration_version <> p_integration_version
      or existing.seller_context_fingerprint <> p_seller_context_fingerprint
      or existing.constraint_fingerprint <> p_constraint_fingerprint
      or existing.constraint_set_json <> p_constraint_set then
      raise exception 'GENESIS_T8_CONSTRAINT_SET_IMMUTABILITY_VIOLATION';
    end if;
    return true;
  end if;

  insert into public.campaign_genesis_t8_constraint_sets(
    campaign_id,organisation_id,schema_version,integration_version,
    seller_context_fingerprint,constraint_fingerprint,constraint_set_json
  ) values (
    p_campaign_id,p_organisation_id,p_schema_version,p_integration_version,
    p_seller_context_fingerprint,p_constraint_fingerprint,p_constraint_set
  );
  return true;
end $$;

revoke all on function public.persist_campaign_genesis_t8_constraint_set(uuid,uuid,text,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.persist_campaign_genesis_t8_constraint_set(uuid,uuid,text,text,text,text,jsonb) to service_role;

comment on table public.campaign_genesis_t8_constraint_sets is 'MR-R1 Build 5 immutable campaign-scoped seller constraint contracts derived deterministically from persisted GenesisSellerContext. Application integration state; frozen CE-R1/CE-R2 kernels are unchanged.';
comment on function public.persist_campaign_genesis_t8_constraint_set(uuid,uuid,text,text,text,text,jsonb) is 'Persists one immutable Build 5 seller constraint set per campaign after verifying its source Genesis seller-context fingerprint.';

notify pgrst, 'reload schema';
