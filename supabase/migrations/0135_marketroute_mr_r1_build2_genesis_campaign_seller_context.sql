-- MarketRoute MR-R1 Build 2 — durable Genesis T8 seller context per campaign.
-- This table is application integration state. It does not alter the frozen
-- Genesis T8 CKR or UDOSIB kernels.

create table if not exists public.campaign_genesis_t8_seller_contexts (
  campaign_id uuid primary key references public.campaigns(id) on delete cascade,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  schema_version text not null,
  integration_version text not null,
  genesis_entity_id text not null,
  source_fingerprint text not null check (source_fingerprint ~ '^[0-9a-f]{64}$'),
  context_json jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists campaign_genesis_t8_seller_contexts_org_idx
  on public.campaign_genesis_t8_seller_contexts(organisation_id, created_at desc);
create index if not exists campaign_genesis_t8_seller_contexts_entity_idx
  on public.campaign_genesis_t8_seller_contexts(genesis_entity_id);

alter table public.campaign_genesis_t8_seller_contexts enable row level security;
drop policy if exists campaign_genesis_t8_seller_contexts_member_read on public.campaign_genesis_t8_seller_contexts;
create policy campaign_genesis_t8_seller_contexts_member_read on public.campaign_genesis_t8_seller_contexts
for select using (exists (
  select 1 from public.organisation_memberships om
  where om.organisation_id=campaign_genesis_t8_seller_contexts.organisation_id
    and om.user_id=auth.uid() and om.status='ACTIVE'
));

create or replace function public.persist_campaign_genesis_t8_seller_context(
  p_campaign_id uuid,
  p_organisation_id uuid,
  p_schema_version text,
  p_integration_version text,
  p_genesis_entity_id text,
  p_source_fingerprint text,
  p_context jsonb
) returns boolean language plpgsql security definer set search_path=public as $$
declare existing_fingerprint text;
begin
  if not exists(select 1 from public.campaigns c where c.id=p_campaign_id and c.organisation_id=p_organisation_id) then
    raise exception 'GENESIS_T8_CAMPAIGN_CONTEXT_CAMPAIGN_MISMATCH';
  end if;
  if p_context is null or jsonb_typeof(p_context) <> 'object' then raise exception 'GENESIS_T8_CAMPAIGN_CONTEXT_INVALID'; end if;

  select source_fingerprint into existing_fingerprint
  from public.campaign_genesis_t8_seller_contexts where campaign_id=p_campaign_id;

  if existing_fingerprint is not null then
    if existing_fingerprint <> p_source_fingerprint then raise exception 'GENESIS_T8_CAMPAIGN_CONTEXT_IMMUTABILITY_VIOLATION'; end if;
    return true;
  end if;

  insert into public.campaign_genesis_t8_seller_contexts(
    campaign_id,organisation_id,schema_version,integration_version,genesis_entity_id,source_fingerprint,context_json
  ) values (
    p_campaign_id,p_organisation_id,p_schema_version,p_integration_version,p_genesis_entity_id,p_source_fingerprint,p_context
  );
  return true;
end $$;

revoke all on function public.persist_campaign_genesis_t8_seller_context(uuid,uuid,text,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.persist_campaign_genesis_t8_seller_context(uuid,uuid,text,text,text,text,jsonb) to service_role;

comment on table public.campaign_genesis_t8_seller_contexts is 'Immutable MarketRoute campaign-scoped Genesis T8 seller-understanding snapshot. Application integration state; not part of frozen CKR/UDOSIB kernels.';
