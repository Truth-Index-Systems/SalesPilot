begin;
create table if not exists public.campaign_genesis_t8_business_dna_completeness (
 campaign_id uuid primary key references public.campaigns(id) on delete cascade,
 organisation_id uuid not null references public.organisations(id) on delete cascade,
 schema_version text not null, integration_version text not null,
 seller_context_fingerprint text not null, constraint_fingerprint text not null, completeness_fingerprint text not null,
 completeness_json jsonb not null, created_at timestamptz not null default now()
);
create index if not exists campaign_genesis_t8_business_dna_completeness_org_idx on public.campaign_genesis_t8_business_dna_completeness(organisation_id,created_at desc);
alter table public.campaign_genesis_t8_business_dna_completeness enable row level security;
drop policy if exists campaign_genesis_t8_business_dna_completeness_member_read on public.campaign_genesis_t8_business_dna_completeness;
create policy campaign_genesis_t8_business_dna_completeness_member_read on public.campaign_genesis_t8_business_dna_completeness for select to authenticated using (exists(select 1 from public.organisation_memberships om where om.organisation_id=campaign_genesis_t8_business_dna_completeness.organisation_id and om.user_id=auth.uid()));
create or replace function public.persist_campaign_genesis_t8_business_dna_completeness(p_campaign_id uuid,p_organisation_id uuid,p_schema_version text,p_integration_version text,p_seller_context_fingerprint text,p_constraint_fingerprint text,p_completeness_fingerprint text,p_completeness jsonb) returns void language plpgsql security definer set search_path=public as $$
declare ctx record; cs record; existing record;
begin
 select * into ctx from public.campaign_genesis_t8_seller_contexts where campaign_id=p_campaign_id and organisation_id=p_organisation_id;
 if ctx is null or ctx.source_fingerprint<>p_seller_context_fingerprint then raise exception 'GENESIS_COMPLETENESS_SELLER_CONTEXT_MISMATCH'; end if;
 select * into cs from public.campaign_genesis_t8_constraint_sets where campaign_id=p_campaign_id and organisation_id=p_organisation_id;
 if cs is null or cs.constraint_fingerprint<>p_constraint_fingerprint then raise exception 'GENESIS_COMPLETENESS_CONSTRAINT_MISMATCH'; end if;
 select * into existing from public.campaign_genesis_t8_business_dna_completeness where campaign_id=p_campaign_id;
 if existing is not null then
   if existing.completeness_fingerprint<>p_completeness_fingerprint then raise exception 'GENESIS_COMPLETENESS_IMMUTABLE'; end if; return;
 end if;
 insert into public.campaign_genesis_t8_business_dna_completeness(campaign_id,organisation_id,schema_version,integration_version,seller_context_fingerprint,constraint_fingerprint,completeness_fingerprint,completeness_json) values(p_campaign_id,p_organisation_id,p_schema_version,p_integration_version,p_seller_context_fingerprint,p_constraint_fingerprint,p_completeness_fingerprint,p_completeness);
end $$;
revoke all on function public.persist_campaign_genesis_t8_business_dna_completeness(uuid,uuid,text,text,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.persist_campaign_genesis_t8_business_dna_completeness(uuid,uuid,text,text,text,text,text,jsonb) to service_role;
comment on table public.campaign_genesis_t8_business_dna_completeness is 'MR-R1 Build 6 immutable measurement of seller Business DNA completeness, missing research, ontology ambiguity and research debt. Deterministic application integration state; no CE-R1/CE-R2 mutation.';
commit;
