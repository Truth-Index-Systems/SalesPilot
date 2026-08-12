-- MarketRoute Forensic Build 2 — Live Commercial Reality Producer
-- DEPLOY AFTER 0151 and before Build 2 application code.
-- Establishes one auditable production lineage:
-- TFR1 Truth snapshot + immutable seller context -> CE-R2 -> R3 -> R4.

alter table public.cie_r4_commercial_decisions
  add column if not exists producer_version text,
  add column if not exists input_fingerprint text,
  add column if not exists seller_context_fingerprint text,
  add column if not exists constraint_fingerprint text,
  add column if not exists target_truth_entity_id uuid references public.genesis_g8_intelligence_entities(id) on delete restrict,
  add column if not exists target_truth_snapshot_id uuid references public.genesis_g8_truth_v2_snapshots(id) on delete restrict,
  add column if not exists target_truth_semantics_version text,
  add column if not exists production_id uuid;

create table if not exists public.cie_r4_commercial_reality_productions (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  scheduler_run_id uuid,
  producer_version text not null check (producer_version='MR-T8-FB2-1.0.0'),
  input_fingerprint text not null check (input_fingerprint ~ '^[0-9a-f]{64}$'),
  seller_context_fingerprint text not null,
  constraint_fingerprint text not null,
  target_truth_entity_id uuid not null references public.genesis_g8_intelligence_entities(id) on delete restrict,
  target_truth_snapshot_id uuid not null references public.genesis_g8_truth_v2_snapshots(id) on delete restrict,
  target_truth_semantics_version text not null check (target_truth_semantics_version='MR-TI-2-TFR1'),
  reference_time timestamptz not null,
  reality_id text not null,
  target_entity_id text not null,
  propagation_json jsonb not null,
  constraint_contexts_json jsonb not null,
  composition_json jsonb not null,
  decision_json jsonb not null,
  deferred_seller_constraint_ids jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  unique(opportunity_id,input_fingerprint)
);

alter table public.cie_r4_commercial_decisions
  drop constraint if exists cie_r4_commercial_decisions_production_id_fkey;
alter table public.cie_r4_commercial_decisions
  add constraint cie_r4_commercial_decisions_production_id_fkey
  foreign key(production_id) references public.cie_r4_commercial_reality_productions(id) on delete restrict;

create index if not exists cie_r4_reality_production_opportunity_idx
  on public.cie_r4_commercial_reality_productions(opportunity_id,created_at desc);
create index if not exists cie_r4_reality_production_truth_idx
  on public.cie_r4_commercial_reality_productions(target_truth_entity_id,target_truth_snapshot_id);

alter table public.cie_r4_commercial_reality_productions enable row level security;
revoke all on public.cie_r4_commercial_reality_productions from public,anon,authenticated;
grant select,insert on public.cie_r4_commercial_reality_productions to service_role;

create or replace function public.get_cie_r4_commercial_reality_production_candidates(
  p_scheduler_run_id uuid, p_limit integer default 12
) returns table(opportunity_id uuid,organisation_id uuid,campaign_id uuid,company_id uuid)
language plpgsql security definer set search_path=public as $$
begin
  if not exists(select 1 from public.pipeline_scheduler_lease where singleton=true and run_id=p_scheduler_run_id and lease_expires_at>now())
  then raise exception 'PIPELINE_SCHEDULER_LEASE_NOT_HELD'; end if;
  return query
    select o.id,o.organisation_id,o.campaign_id,o.company_id
    from public.opportunities o
    where o.status not in ('APPROVED','REJECTED','ENGAGED')
      and not exists(
        select 1 from public.cie_r4_commercial_reality_productions p
        where p.opportunity_id=o.id and p.producer_version='MR-T8-FB2-1.0.0'
      )
    order by o.created_at,o.id
    limit greatest(1,least(coalesce(p_limit,12),25));
end $$;

revoke all on function public.get_cie_r4_commercial_reality_production_candidates(uuid,integer) from public,anon,authenticated;
grant execute on function public.get_cie_r4_commercial_reality_production_candidates(uuid,integer) to service_role;

create or replace function public.persist_cie_r4_commercial_reality_production(
  p_scheduler_run_id uuid,
  p_opportunity_id uuid,
  p_producer_version text,
  p_input_fingerprint text,
  p_seller_context_fingerprint text,
  p_constraint_fingerprint text,
  p_target_truth_entity_id uuid,
  p_target_truth_snapshot_id uuid,
  p_target_truth_semantics_version text,
  p_reference_time timestamptz,
  p_reality_id text,
  p_target_entity_id text,
  p_reality_state text,
  p_disposition text,
  p_propagation_json jsonb,
  p_constraint_contexts_json jsonb,
  p_composition_json jsonb,
  p_decision_json jsonb,
  p_deferred_seller_constraint_ids jsonb
) returns void language plpgsql security definer set search_path=public as $$
declare
  o public.opportunities%rowtype;
  s public.genesis_g8_truth_v2_snapshots%rowtype;
  v_production_id uuid;
begin
  if not exists(select 1 from public.pipeline_scheduler_lease where singleton=true and run_id=p_scheduler_run_id and lease_expires_at>now())
  then raise exception 'PIPELINE_SCHEDULER_LEASE_NOT_HELD'; end if;
  if p_producer_version <> 'MR-T8-FB2-1.0.0' then raise exception 'CIE_R4_FB2_PRODUCER_VERSION_MISMATCH'; end if;
  if p_target_truth_semantics_version <> 'MR-TI-2-TFR1' then raise exception 'CIE_R4_FB2_TRUTH_SEMANTICS_REQUIRED'; end if;
  if p_input_fingerprint !~ '^[0-9a-f]{64}$' then raise exception 'CIE_R4_FB2_INPUT_FINGERPRINT_INVALID'; end if;
  if p_seller_context_fingerprint !~ '^[0-9a-f]{64}$' then raise exception 'CIE_R4_FB2_SELLER_FINGERPRINT_INVALID'; end if;
  if p_constraint_fingerprint !~ '^[0-9a-f]{64}$' then raise exception 'CIE_R4_FB2_CONSTRAINT_FINGERPRINT_INVALID'; end if;
  if nullif(trim(coalesce(p_reality_id,'')),'') is null or nullif(trim(coalesce(p_target_entity_id,'')),'') is null then raise exception 'CIE_R4_FB2_REALITY_IDENTITY_REQUIRED'; end if;
  if jsonb_typeof(coalesce(p_propagation_json,'null'::jsonb)) <> 'object' then raise exception 'CIE_R4_FB2_PROPAGATION_INVALID'; end if;
  if jsonb_typeof(coalesce(p_constraint_contexts_json,'null'::jsonb)) <> 'array' then raise exception 'CIE_R4_FB2_CONSTRAINT_CONTEXTS_INVALID'; end if;
  if jsonb_typeof(coalesce(p_composition_json,'null'::jsonb)) <> 'object' then raise exception 'CIE_R4_FB2_COMPOSITION_INVALID'; end if;
  if jsonb_typeof(coalesce(p_decision_json,'null'::jsonb)) <> 'object' then raise exception 'CIE_R4_FB2_DECISION_INVALID'; end if;
  if jsonb_typeof(coalesce(p_deferred_seller_constraint_ids,'[]'::jsonb)) <> 'array' then raise exception 'CIE_R4_FB2_DEFERRED_CONSTRAINTS_INVALID'; end if;

  select * into o from public.opportunities where id=p_opportunity_id;
  if not found then raise exception 'CIE_R4_OPPORTUNITY_NOT_FOUND'; end if;
  if not exists(select 1 from public.campaign_genesis_t8_seller_contexts c where c.campaign_id=o.campaign_id and c.organisation_id=o.organisation_id and c.source_fingerprint=p_seller_context_fingerprint)
  then raise exception 'CIE_R4_FB2_SELLER_CONTEXT_FINGERPRINT_MISMATCH'; end if;
  if not exists(select 1 from public.campaign_genesis_t8_constraint_sets c where c.campaign_id=o.campaign_id and c.organisation_id=o.organisation_id and c.constraint_fingerprint=p_constraint_fingerprint and c.seller_context_fingerprint=p_seller_context_fingerprint)
  then raise exception 'CIE_R4_FB2_CONSTRAINT_FINGERPRINT_MISMATCH'; end if;
  if not exists(
    select 1
    from public.genesis_g8_intelligence_entities e
    where e.id=p_target_truth_entity_id and e.entity_type='company' and e.status='ACTIVE'
      and (
        exists(
          select 1 from public.genesis_g8_campaign_knowledge_links l
          where l.organisation_id=o.organisation_id and l.campaign_id=o.campaign_id
            and l.company_id=o.company_id and l.genesis_g8_entity_id=e.id
        )
        or exists(
          select 1 from public.companies co
          where co.id=o.company_id and co.organisation_id=o.organisation_id and co.campaign_id=o.campaign_id
            and nullif(trim(coalesce(co.canonical_domain,'')),'') is not null
            and lower(trim(co.canonical_domain))=lower(trim(e.canonical_key))
        )
      )
  ) then raise exception 'CIE_R4_FB2_TARGET_TRUTH_COMPANY_LINEAGE_MISMATCH'; end if;

  select * into s from public.genesis_g8_truth_v2_snapshots where id=p_target_truth_snapshot_id;
  if not found then raise exception 'CIE_R4_FB2_TRUTH_SNAPSHOT_NOT_FOUND'; end if;
  if s.entity_id<>p_target_truth_entity_id then raise exception 'CIE_R4_FB2_TRUTH_ENTITY_MISMATCH'; end if;
  if s.truth_semantics_version<>p_target_truth_semantics_version then raise exception 'CIE_R4_FB2_TRUTH_SNAPSHOT_SEMANTICS_MISMATCH'; end if;
  if s.calculated_at<>p_reference_time then raise exception 'CIE_R4_FB2_REFERENCE_TIME_MISMATCH'; end if;

  if coalesce(p_decision_json->>'authorityMode','') <> 'AUTHORITATIVE' then raise exception 'CIE_R4_NON_AUTHORITATIVE_DECISION'; end if;
  if coalesce(p_decision_json->>'opportunityId','') <> p_opportunity_id::text then raise exception 'CIE_R4_OPPORTUNITY_ID_MISMATCH'; end if;
  if coalesce(p_decision_json->>'realityId','') <> p_reality_id then raise exception 'CIE_R4_REALITY_ID_MISMATCH'; end if;
  if coalesce(p_decision_json->>'targetEntityId','') <> p_target_entity_id then raise exception 'CIE_R4_TARGET_ID_MISMATCH'; end if;
  if coalesce(p_decision_json->>'realityState','') <> p_reality_state then raise exception 'CIE_R4_STATE_MISMATCH'; end if;
  if coalesce(p_decision_json->>'disposition','') <> p_disposition then raise exception 'CIE_R4_DISPOSITION_MISMATCH'; end if;
  if coalesce((p_decision_json->>'canUnlockEngagement')::boolean,true) then raise exception 'CIE_R4_MAY_NOT_UNLOCK_ENGAGEMENT'; end if;
  if coalesce(p_composition_json->>'authorityMode','') <> 'SHADOW' then raise exception 'CIE_R4_FB2_R3_COMPOSITION_MODE_INVALID'; end if;
  if coalesce(p_composition_json->'reality'->>'realityId','') <> p_reality_id then raise exception 'CIE_R4_FB2_COMPOSITION_REALITY_MISMATCH'; end if;

  insert into public.cie_r4_commercial_reality_productions(
    opportunity_id,organisation_id,campaign_id,scheduler_run_id,producer_version,input_fingerprint,
    seller_context_fingerprint,constraint_fingerprint,target_truth_entity_id,target_truth_snapshot_id,
    target_truth_semantics_version,reference_time,reality_id,target_entity_id,propagation_json,
    constraint_contexts_json,composition_json,decision_json,deferred_seller_constraint_ids
  ) values (
    o.id,o.organisation_id,o.campaign_id,p_scheduler_run_id,p_producer_version,p_input_fingerprint,
    p_seller_context_fingerprint,p_constraint_fingerprint,p_target_truth_entity_id,p_target_truth_snapshot_id,
    p_target_truth_semantics_version,p_reference_time,p_reality_id,p_target_entity_id,p_propagation_json,
    coalesce(p_constraint_contexts_json,'[]'::jsonb),p_composition_json,p_decision_json,coalesce(p_deferred_seller_constraint_ids,'[]'::jsonb)
  ) on conflict(opportunity_id,input_fingerprint) do nothing
  returning id into v_production_id;

  if v_production_id is null then
    select id into v_production_id from public.cie_r4_commercial_reality_productions
    where opportunity_id=o.id and input_fingerprint=p_input_fingerprint;
  end if;

  insert into public.cie_r4_commercial_decisions(
    opportunity_id,organisation_id,campaign_id,scheduler_run_id,reality_id,target_entity_id,reality_state,disposition,
    authority_mode,decision_json,producer_version,input_fingerprint,seller_context_fingerprint,constraint_fingerprint,
    target_truth_entity_id,target_truth_snapshot_id,target_truth_semantics_version,production_id
  ) values (
    o.id,o.organisation_id,o.campaign_id,p_scheduler_run_id,p_reality_id,p_target_entity_id,p_reality_state,p_disposition,
    'AUTHORITATIVE',p_decision_json,p_producer_version,p_input_fingerprint,p_seller_context_fingerprint,p_constraint_fingerprint,
    p_target_truth_entity_id,p_target_truth_snapshot_id,p_target_truth_semantics_version,v_production_id
  ) on conflict(opportunity_id) do update set
    scheduler_run_id=excluded.scheduler_run_id,reality_id=excluded.reality_id,target_entity_id=excluded.target_entity_id,
    reality_state=excluded.reality_state,disposition=excluded.disposition,authority_mode='AUTHORITATIVE',decision_json=excluded.decision_json,
    producer_version=excluded.producer_version,input_fingerprint=excluded.input_fingerprint,
    seller_context_fingerprint=excluded.seller_context_fingerprint,constraint_fingerprint=excluded.constraint_fingerprint,
    target_truth_entity_id=excluded.target_truth_entity_id,target_truth_snapshot_id=excluded.target_truth_snapshot_id,
    target_truth_semantics_version=excluded.target_truth_semantics_version,production_id=excluded.production_id,
    applied_at=null,updated_at=now();
end $$;

-- Direct decision persistence is no longer a production authority path.
revoke all on function public.persist_cie_r4_commercial_decision(uuid,uuid,text,text,text,text,jsonb) from service_role;
revoke all on function public.persist_cie_r4_commercial_reality_production(uuid,uuid,text,text,text,text,uuid,uuid,text,timestamptz,text,text,text,text,jsonb,jsonb,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.persist_cie_r4_commercial_reality_production(uuid,uuid,text,text,text,text,uuid,uuid,text,timestamptz,text,text,text,text,jsonb,jsonb,jsonb,jsonb,jsonb) to service_role;

-- R4 application now ignores every pre-Build-2/orphan decision record.
create or replace function public.apply_cie_r4_commercial_decision_authority(p_scheduler_run_id uuid)
returns table(applied integer,rejected integer,held integer,"researchRequired" integer,candidates integer)
language plpgsql security definer set search_path=public as $$
declare r record; a integer:=0; x integer:=0; h integer:=0; q integer:=0; c integer:=0;
begin
  if not exists(select 1 from public.pipeline_scheduler_lease where singleton=true and run_id=p_scheduler_run_id and lease_expires_at>now())
  then raise exception 'PIPELINE_SCHEDULER_LEASE_NOT_HELD'; end if;
  for r in
    select d.* from public.cie_r4_commercial_decisions d
    where d.applied_at is null
      and d.producer_version='MR-T8-FB2-1.0.0'
      and d.production_id is not null
      and d.target_truth_semantics_version='MR-TI-2-TFR1'
    order by d.created_at,d.opportunity_id limit 100 for update skip locked
  loop
    update public.opportunities o set
      status=case when r.disposition='REJECT' then 'LOW_PRIORITY' when r.disposition in ('HOLD_TEMPORAL','RESEARCH_REQUIRED') then 'NEEDS_EVIDENCE' else 'BUILDING' end,
      opportunity_score=null,scoring_version='cie-r4-fb2-commercial-reality',updated_at=now()
    where o.id=r.opportunity_id and o.status not in ('APPROVED','REJECTED','ENGAGED');
    update public.cie_r4_commercial_decisions set applied_at=now(),updated_at=now(),scheduler_run_id=p_scheduler_run_id where opportunity_id=r.opportunity_id;
    a:=a+1;
    if r.disposition='REJECT' then x:=x+1; elsif r.disposition='HOLD_TEMPORAL' then h:=h+1; elsif r.disposition='RESEARCH_REQUIRED' then q:=q+1; else c:=c+1; end if;
  end loop;
  return query select a,x,h,q,c;
end $$;

-- R6 may consume only Build-2-provenanced R4 candidates. Contact evidence itself
-- remains a later forensic build; this closes only the upstream authority lineage.
create or replace function public.get_cie_r6_contact_authority_context(p_scheduler_run_id uuid,p_limit integer default 40)
returns table(opportunity_id uuid,reality_id text,commercial_routes jsonb,contacts jsonb)
language plpgsql security definer set search_path=public as $$
begin
  if not exists(select 1 from public.pipeline_scheduler_lease where singleton=true and run_id=p_scheduler_run_id and lease_expires_at>now()) then raise exception 'PIPELINE_SCHEDULER_LEASE_NOT_HELD'; end if;
  return query
  select o.id,d.reality_id,
    coalesce((select jsonb_agg(jsonb_build_object('id',r.id::text,'contactName',r.contact_name,'contactRole',r.contact_role,'targetRole',r.target_role,'channelType',r.channel_type,'channelValue',r.channel_value,'isViable',r.is_viable) order by r.id)
      from public.commercial_routes r where r.organisation_id=o.organisation_id and r.campaign_id=o.campaign_id and r.company_id=o.company_id),'[]'::jsonb),
    coalesce((select jsonb_agg(jsonb_build_object('id',c.id::text,'full_name',c.full_name,'role_title',c.role_title,'department',c.department,'email_address',c.email_address,'email_status',c.email_status,'linkedin_profile_url',c.linkedin_profile_url,'linkedin_status',c.linkedin_status,'review_status',c.review_status,
      'verified_identity_evidence',(select count(*) from public.contact_evidence e where e.contact_id=c.id and e.evidence_type='IDENTITY' and e.verified=true),
      'verified_role_evidence',(select count(*) from public.contact_evidence e where e.contact_id=c.id and e.evidence_type='ROLE' and e.verified=true)) order by c.id)
      from public.contacts c where c.organisation_id=o.organisation_id and c.campaign_id=o.campaign_id and c.company_id=o.company_id),'[]'::jsonb)
  from public.opportunities o
  join public.cie_r4_commercial_decisions d on d.opportunity_id=o.id and d.disposition='COMMERCIAL_CANDIDATE'
    and d.producer_version='MR-T8-FB2-1.0.0' and d.production_id is not null and d.target_truth_semantics_version='MR-TI-2-TFR1'
  left join public.cie_r6_contact_decisions cd on cd.opportunity_id=o.id
  where o.status='BUILDING' and (cd.opportunity_id is null or cd.applied_at is null)
  order by o.created_at,o.id limit greatest(1,least(coalesce(p_limit,40),100));
end $$;

create or replace function public.apply_cie_r6_contact_authority()
returns table(applied integer,ready integer,organisational integer)
language plpgsql security definer set search_path=public as $$
declare r record; a integer:=0; rd integer:=0; org integer:=0;
begin
  for r in
    select d.*,r4.disposition from public.cie_r6_contact_decisions d
    join public.cie_r4_commercial_decisions r4 on r4.opportunity_id=d.opportunity_id
      and r4.producer_version='MR-T8-FB2-1.0.0' and r4.production_id is not null and r4.target_truth_semantics_version='MR-TI-2-TFR1'
    where d.applied_at is null and r4.disposition='COMMERCIAL_CANDIDATE'
    order by d.created_at,d.opportunity_id for update of d skip locked
  loop
    update public.opportunities o set primary_contact_id=r.primary_contact_id,status='READY',opportunity_score=null,scoring_version='cie-r6-authoritative-commercial-route-contact',updated_at=now()
    where o.id=r.opportunity_id and o.status not in ('APPROVED','REJECTED','ENGAGED');
    update public.cie_r6_contact_decisions set applied_at=now(),updated_at=now() where opportunity_id=r.opportunity_id;
    a:=a+1; rd:=rd+1; if r.primary_contact_id is null then org:=org+1; end if;
  end loop;
  return query select a,rd,org;
end $$;

-- R7 likewise cannot derive research value from orphaned historical R4 decisions.
create or replace function public.get_cie_r7_research_context(p_scheduler_run_id uuid,p_limit integer default 100)
returns table(opportunity_id uuid,reality_id text,repair_id uuid,claim_id uuid,claim_key text,objective text,repair_mode text,blocking_mode text,stability_json jsonb)
language plpgsql security definer set search_path=public as $$
begin
  if not exists(select 1 from public.pipeline_scheduler_lease where singleton=true and run_id=p_scheduler_run_id and lease_expires_at>now()) then raise exception 'PIPELINE_SCHEDULER_LEASE_NOT_HELD'; end if;
  return query
  select o.id,r4.reality_id,q.id,q.claim_id,q.claim_key,q.objective,q.repair_mode,q.blocking_mode,r4.decision_json->'stability'
  from public.opportunities o
  join public.cie_r4_commercial_decisions r4 on r4.opportunity_id=o.id
    and r4.producer_version='MR-T8-FB2-1.0.0' and r4.production_id is not null and r4.target_truth_semantics_version='MR-TI-2-TFR1'
  join public.genesis_g8_discovery_repair_queue q on q.company_id=o.company_id and q.status in ('QUEUED','CLAIMED')
  where r4.disposition in ('RESEARCH_REQUIRED','COMMERCIAL_CANDIDATE') and r4.decision_json ? 'stability'
  order by o.created_at,o.id,q.created_at,q.id limit greatest(1,least(coalesce(p_limit,100),250));
end $$;

revoke all on function public.apply_cie_r4_commercial_decision_authority(uuid) from public,anon,authenticated;
grant execute on function public.apply_cie_r4_commercial_decision_authority(uuid) to service_role;
revoke all on function public.get_cie_r6_contact_authority_context(uuid,integer) from public,anon,authenticated;
grant execute on function public.get_cie_r6_contact_authority_context(uuid,integer) to service_role;
revoke all on function public.apply_cie_r6_contact_authority() from public,anon,authenticated;
grant execute on function public.apply_cie_r6_contact_authority() to service_role;
revoke all on function public.get_cie_r7_research_context(uuid,integer) from public,anon,authenticated;
grant execute on function public.get_cie_r7_research_context(uuid,integer) to service_role;

comment on table public.cie_r4_commercial_reality_productions is
'Forensic Build 2 immutable lineage ledger: repaired TFR1 Truth + immutable seller constraints through CE-R2/R3 into authoritative R4. No legacy opportunity/fit/route/contact score is an input.';
comment on column public.cie_r4_commercial_decisions.producer_version is
'Only MR-T8-FB2-1.0.0 records are live R4 authority after migration 0152. Null identifies historical/orphaned R4 decisions.';


notify pgrst, 'reload schema';
