-- MarketRoute Forensic Build 3 — SQL Hotfix V2
-- Atomic rerun-safe migration. Changed RETURNS TABLE RPCs are dropped BEFORE any other DDL.
BEGIN;

-- PostgreSQL cannot CREATE OR REPLACE a function when OUT/RETURNS TABLE columns change.
-- Drop the exact old identities first, at the very start of the transaction.
DROP FUNCTION IF EXISTS public.get_cie_r6_contact_authority_context(uuid, integer);
DROP FUNCTION IF EXISTS public.get_cie_r7_research_context(uuid, integer);

DO $$
BEGIN
  IF to_regprocedure('public.get_cie_r6_contact_authority_context(uuid,integer)') IS NOT NULL THEN
    RAISE EXCEPTION 'BUILD3_V2_PREFLIGHT_R6_DROP_FAILED';
  END IF;
  IF to_regprocedure('public.get_cie_r7_research_context(uuid,integer)') IS NOT NULL THEN
    RAISE EXCEPTION 'BUILD3_V2_PREFLIGHT_R7_DROP_FAILED';
  END IF;
END $$;

-- MarketRoute Forensic Build 3 — State + Authority Invalidation Architecture
-- DEPLOY AFTER 0152 and before Build 3 application code.
--
-- Separates immutable production lineage from material downstream authority,
-- fixes READY -> BUILDING foundation regression, and makes R4/R6/R7 stale
-- deterministically when their exact governing inputs cease to be current.

alter table public.cie_r4_commercial_reality_productions
  add column if not exists authority_fingerprint text;

-- 0152 froze this table to the Build-2 producer literal. Preserve historical
-- rows while admitting only the audited Build-3 successor.
alter table public.cie_r4_commercial_reality_productions
  drop constraint if exists cie_r4_commercial_reality_productions_producer_version_check;
alter table public.cie_r4_commercial_reality_productions
  add constraint cie_r4_commercial_reality_productions_producer_version_check
  check(producer_version in ('MR-T8-FB2-1.0.0','MR-T8-FB3-1.0.0'));

alter table public.cie_r4_commercial_decisions
  add column if not exists authority_fingerprint text,
  add column if not exists last_validated_at timestamptz,
  add column if not exists next_validation_at timestamptz,
  add column if not exists invalidation_count integer not null default 0,
  add column if not exists last_invalidation_reason text;

alter table public.cie_r6_contact_decisions
  add column if not exists parent_r4_authority_fingerprint text,
  add column if not exists source_fingerprint text,
  add column if not exists authority_status text not null default 'ACTIVE',
  add column if not exists invalidated_at timestamptz,
  add column if not exists invalidation_reason text;

alter table public.cie_r6_contact_decisions drop constraint if exists cie_r6_contact_decisions_authority_status_check;
alter table public.cie_r6_contact_decisions add constraint cie_r6_contact_decisions_authority_status_check
  check(authority_status in ('ACTIVE','STALE'));

alter table public.cie_r7_research_directives
  add column if not exists r4_input_fingerprint text;

create table if not exists public.cie_authority_invalidation_events (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  authority_layer text not null check(authority_layer in ('R4','R6','R7')),
  previous_fingerprint text,
  next_fingerprint text,
  reason text not null,
  scheduler_run_id uuid,
  metadata_json jsonb not null default '{}'::jsonb check(jsonb_typeof(metadata_json)='object'),
  created_at timestamptz not null default now()
);
create index if not exists cie_authority_invalidation_opportunity_idx
  on public.cie_authority_invalidation_events(opportunity_id,created_at desc);
alter table public.cie_authority_invalidation_events enable row level security;
revoke all on public.cie_authority_invalidation_events from public,anon,authenticated;
grant select on public.cie_authority_invalidation_events to service_role;

-- Authority ledgers are RPC-write-only after Build 3. Security-definer functions
-- retain owner rights; application service-role code may inspect but not bypass
-- fingerprint/state invariants with direct DML.
revoke insert,update,delete on public.cie_r4_commercial_reality_productions from service_role;
revoke insert,update,delete on public.cie_r4_commercial_decisions from service_role;
revoke insert,update,delete on public.cie_r6_contact_decisions from service_role;
revoke insert,update,delete on public.cie_r7_research_directives from service_role;
revoke insert,update,delete on public.cie_authority_invalidation_events from service_role;
grant select on public.cie_r4_commercial_reality_productions,public.cie_r4_commercial_decisions,public.cie_r6_contact_decisions,public.cie_r7_research_directives to service_role;

-- Build 2 candidate discovery has no remaining writer and is removed from the
-- live service-role surface.
revoke execute on function public.get_cie_r4_commercial_reality_production_candidates(uuid,integer) from service_role;

-- Every Build-2 decision receives one conservative Build-3 revalidation. Existing
-- READY states are not demoted by migration alone; the fresh deterministic result
-- decides whether downstream authority is materially stale.
update public.cie_r4_commercial_decisions
set next_validation_at=now(),
    last_invalidation_reason=coalesce(last_invalidation_reason,'BUILD3_MIGRATION_REVALIDATION_REQUIRED')
where producer_version='MR-T8-FB2-1.0.0';

-- Build 3 candidate selection: missing/current-version authority, a newer Truth
-- snapshot, or periodic temporal reevaluation. Seller/constraint fingerprints are
-- compared even though the current MR-R1 contracts are immutable, so this remains
-- correct when those contracts become versioned later.
create or replace function public.get_cie_r4_commercial_reality_revalidation_candidates(
  p_scheduler_run_id uuid, p_limit integer default 12
) returns table(
  opportunity_id uuid, organisation_id uuid, campaign_id uuid, company_id uuid, revalidation_reason text
) language plpgsql security definer set search_path=public as $$
begin
  if not exists(select 1 from public.pipeline_scheduler_lease where singleton=true and run_id=p_scheduler_run_id and lease_expires_at>now())
  then raise exception 'PIPELINE_SCHEDULER_LEASE_NOT_HELD'; end if;

  return query
  select o.id,o.organisation_id,o.campaign_id,o.company_id,
    case
      when d.opportunity_id is null then 'MISSING_R4_AUTHORITY'
      when d.producer_version is distinct from 'MR-T8-FB3-1.0.0' then 'PRODUCER_VERSION_REVALIDATION'
      when d.authority_fingerprint is null then 'MISSING_MATERIAL_AUTHORITY_FINGERPRINT'
      when d.seller_context_fingerprint is distinct from sc.source_fingerprint then 'SELLER_CONTEXT_CHANGED'
      when d.constraint_fingerprint is distinct from cs.constraint_fingerprint then 'SELLER_CONSTRAINTS_CHANGED'
      when latest.id is not null and latest.id is distinct from d.target_truth_snapshot_id then 'NEWER_TRUTH_SNAPSHOT'
      else 'TEMPORAL_REVALIDATION_DUE'
    end
  from public.opportunities o
  join public.campaign_genesis_t8_seller_contexts sc
    on sc.campaign_id=o.campaign_id and sc.organisation_id=o.organisation_id
  join public.campaign_genesis_t8_constraint_sets cs
    on cs.campaign_id=o.campaign_id and cs.organisation_id=o.organisation_id
  left join public.cie_r4_commercial_decisions d on d.opportunity_id=o.id
  left join lateral (
    select s.id,s.calculated_at
    from public.genesis_g8_truth_v2_snapshots s
    where d.target_truth_entity_id is not null
      and s.entity_id=d.target_truth_entity_id
      and s.truth_semantics_version='MR-TI-2-TFR1'
    order by s.calculated_at desc,s.created_at desc,s.id desc
    limit 1
  ) latest on true
  where o.status not in ('APPROVED','REJECTED','ENGAGED')
    and (
      d.opportunity_id is null
      or d.producer_version is distinct from 'MR-T8-FB3-1.0.0'
      or d.authority_fingerprint is null
      or d.seller_context_fingerprint is distinct from sc.source_fingerprint
      or d.constraint_fingerprint is distinct from cs.constraint_fingerprint
      or (latest.id is not null and latest.id is distinct from d.target_truth_snapshot_id)
      or d.next_validation_at is null
      or d.next_validation_at<=now()
    )
  order by
    case when d.opportunity_id is null then 0
         when d.producer_version is distinct from 'MR-T8-FB3-1.0.0' then 1
         when latest.id is not null and latest.id is distinct from d.target_truth_snapshot_id then 2
         else 3 end,
    o.created_at,o.id
  limit greatest(1,least(coalesce(p_limit,12),25));
end $$;
revoke all on function public.get_cie_r4_commercial_reality_revalidation_candidates(uuid,integer) from public,anon,authenticated;
grant execute on function public.get_cie_r4_commercial_reality_revalidation_candidates(uuid,integer) to service_role;

-- Old Build-2 persistence signature must not remain as an executable authority path.
drop function if exists public.persist_cie_r4_commercial_reality_production(uuid,uuid,text,text,text,text,uuid,uuid,text,timestamptz,text,text,text,text,jsonb,jsonb,jsonb,jsonb,jsonb);
-- Build-3 signature too, so this migration is safe to rerun after a partial SQL-editor execution.
drop function if exists public.persist_cie_r4_commercial_reality_production(uuid,uuid,text,text,text,text,text,uuid,uuid,text,timestamptz,text,text,text,text,jsonb,jsonb,jsonb,jsonb,jsonb);

create function public.persist_cie_r4_commercial_reality_production(
  p_scheduler_run_id uuid,
  p_opportunity_id uuid,
  p_producer_version text,
  p_input_fingerprint text,
  p_authority_fingerprint text,
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
) returns table(material_changed boolean,r6_invalidated boolean,r7_retired integer)
language plpgsql security definer set search_path=public as $$
declare
  o public.opportunities%rowtype;
  s public.genesis_g8_truth_v2_snapshots%rowtype;
  prior public.cie_r4_commercial_decisions%rowtype;
  v_production_id uuid;
  v_material_changed boolean:=true;
  v_r6_invalidated boolean:=false;
  v_r7_retired integer:=0;
  v_rows integer:=0;
begin
  if not exists(select 1 from public.pipeline_scheduler_lease where singleton=true and run_id=p_scheduler_run_id and lease_expires_at>now())
  then raise exception 'PIPELINE_SCHEDULER_LEASE_NOT_HELD'; end if;
  if p_producer_version <> 'MR-T8-FB3-1.0.0' then raise exception 'CIE_R4_FB3_PRODUCER_VERSION_MISMATCH'; end if;
  if p_target_truth_semantics_version <> 'MR-TI-2-TFR1' then raise exception 'CIE_R4_FB3_TRUTH_SEMANTICS_REQUIRED'; end if;
  if p_input_fingerprint !~ '^[0-9a-f]{64}$' then raise exception 'CIE_R4_FB3_INPUT_FINGERPRINT_INVALID'; end if;
  if p_authority_fingerprint !~ '^[0-9a-f]{64}$' then raise exception 'CIE_R4_FB3_AUTHORITY_FINGERPRINT_INVALID'; end if;
  if p_seller_context_fingerprint !~ '^[0-9a-f]{64}$' then raise exception 'CIE_R4_FB3_SELLER_FINGERPRINT_INVALID'; end if;
  if p_constraint_fingerprint !~ '^[0-9a-f]{64}$' then raise exception 'CIE_R4_FB3_CONSTRAINT_FINGERPRINT_INVALID'; end if;
  if nullif(trim(coalesce(p_reality_id,'')),'') is null or nullif(trim(coalesce(p_target_entity_id,'')),'') is null then raise exception 'CIE_R4_FB3_REALITY_IDENTITY_REQUIRED'; end if;
  if jsonb_typeof(coalesce(p_propagation_json,'null'::jsonb)) <> 'object' then raise exception 'CIE_R4_FB3_PROPAGATION_INVALID'; end if;
  if jsonb_typeof(coalesce(p_constraint_contexts_json,'null'::jsonb)) <> 'array' then raise exception 'CIE_R4_FB3_CONSTRAINT_CONTEXTS_INVALID'; end if;
  if jsonb_typeof(coalesce(p_composition_json,'null'::jsonb)) <> 'object' then raise exception 'CIE_R4_FB3_COMPOSITION_INVALID'; end if;
  if jsonb_typeof(coalesce(p_decision_json,'null'::jsonb)) <> 'object' then raise exception 'CIE_R4_FB3_DECISION_INVALID'; end if;
  if jsonb_typeof(coalesce(p_deferred_seller_constraint_ids,'[]'::jsonb)) <> 'array' then raise exception 'CIE_R4_FB3_DEFERRED_CONSTRAINTS_INVALID'; end if;

  select * into o from public.opportunities where id=p_opportunity_id for update;
  if not found then raise exception 'CIE_R4_OPPORTUNITY_NOT_FOUND'; end if;
  if not exists(select 1 from public.campaign_genesis_t8_seller_contexts c where c.campaign_id=o.campaign_id and c.organisation_id=o.organisation_id and c.source_fingerprint=p_seller_context_fingerprint)
  then raise exception 'CIE_R4_FB3_SELLER_CONTEXT_FINGERPRINT_MISMATCH'; end if;
  if not exists(select 1 from public.campaign_genesis_t8_constraint_sets c where c.campaign_id=o.campaign_id and c.organisation_id=o.organisation_id and c.constraint_fingerprint=p_constraint_fingerprint and c.seller_context_fingerprint=p_seller_context_fingerprint)
  then raise exception 'CIE_R4_FB3_CONSTRAINT_FINGERPRINT_MISMATCH'; end if;

  if not exists(
    select 1 from public.genesis_g8_intelligence_entities e
    where e.id=p_target_truth_entity_id and e.entity_type='company' and e.status='ACTIVE'
      and (
        exists(select 1 from public.genesis_g8_campaign_knowledge_links l where l.organisation_id=o.organisation_id and l.campaign_id=o.campaign_id and l.company_id=o.company_id and l.genesis_g8_entity_id=e.id)
        or exists(select 1 from public.companies co where co.id=o.company_id and co.organisation_id=o.organisation_id and co.campaign_id=o.campaign_id
          and nullif(trim(coalesce(co.canonical_domain,'')),'') is not null and lower(trim(co.canonical_domain))=lower(trim(e.canonical_key)))
      )
  ) then raise exception 'CIE_R4_FB3_TARGET_TRUTH_COMPANY_LINEAGE_MISMATCH'; end if;

  select * into s from public.genesis_g8_truth_v2_snapshots where id=p_target_truth_snapshot_id;
  if not found then raise exception 'CIE_R4_FB3_TRUTH_SNAPSHOT_NOT_FOUND'; end if;
  if s.entity_id<>p_target_truth_entity_id then raise exception 'CIE_R4_FB3_TRUTH_ENTITY_MISMATCH'; end if;
  if s.truth_semantics_version<>p_target_truth_semantics_version then raise exception 'CIE_R4_FB3_TRUTH_SNAPSHOT_SEMANTICS_MISMATCH'; end if;
  if s.calculated_at<>p_reference_time then raise exception 'CIE_R4_FB3_REFERENCE_TIME_MISMATCH'; end if;

  if coalesce(p_decision_json->>'authorityMode','') <> 'AUTHORITATIVE' then raise exception 'CIE_R4_NON_AUTHORITATIVE_DECISION'; end if;
  if coalesce(p_decision_json->>'opportunityId','') <> p_opportunity_id::text then raise exception 'CIE_R4_OPPORTUNITY_ID_MISMATCH'; end if;
  if coalesce(p_decision_json->>'realityId','') <> p_reality_id then raise exception 'CIE_R4_REALITY_ID_MISMATCH'; end if;
  if coalesce(p_decision_json->>'targetEntityId','') <> p_target_entity_id then raise exception 'CIE_R4_TARGET_ID_MISMATCH'; end if;
  if coalesce(p_decision_json->>'realityState','') <> p_reality_state then raise exception 'CIE_R4_STATE_MISMATCH'; end if;
  if coalesce(p_decision_json->>'disposition','') <> p_disposition then raise exception 'CIE_R4_DISPOSITION_MISMATCH'; end if;
  if coalesce((p_decision_json->>'canUnlockEngagement')::boolean,true) then raise exception 'CIE_R4_MAY_NOT_UNLOCK_ENGAGEMENT'; end if;
  if coalesce(p_composition_json->>'authorityMode','') <> 'SHADOW' then raise exception 'CIE_R4_FB3_R3_COMPOSITION_MODE_INVALID'; end if;

  select * into prior from public.cie_r4_commercial_decisions where opportunity_id=o.id;
  if found then v_material_changed:=prior.authority_fingerprint is distinct from p_authority_fingerprint; end if;

  insert into public.cie_r4_commercial_reality_productions(
    opportunity_id,organisation_id,campaign_id,scheduler_run_id,producer_version,input_fingerprint,authority_fingerprint,
    seller_context_fingerprint,constraint_fingerprint,target_truth_entity_id,target_truth_snapshot_id,target_truth_semantics_version,
    reference_time,reality_id,target_entity_id,propagation_json,constraint_contexts_json,composition_json,decision_json,deferred_seller_constraint_ids
  ) values (
    o.id,o.organisation_id,o.campaign_id,p_scheduler_run_id,p_producer_version,p_input_fingerprint,p_authority_fingerprint,
    p_seller_context_fingerprint,p_constraint_fingerprint,p_target_truth_entity_id,p_target_truth_snapshot_id,p_target_truth_semantics_version,
    p_reference_time,p_reality_id,p_target_entity_id,p_propagation_json,coalesce(p_constraint_contexts_json,'[]'::jsonb),p_composition_json,p_decision_json,coalesce(p_deferred_seller_constraint_ids,'[]'::jsonb)
  ) on conflict(opportunity_id,input_fingerprint) do update set authority_fingerprint=excluded.authority_fingerprint
  returning id into v_production_id;
  if v_production_id is null then
    select id into v_production_id from public.cie_r4_commercial_reality_productions where opportunity_id=o.id and input_fingerprint=p_input_fingerprint;
  end if;

  if prior.opportunity_id is not null and prior.input_fingerprint is distinct from p_input_fingerprint then
    update public.cie_r7_research_directives set status='RETIRED',updated_at=now()
    where opportunity_id=o.id and status='ACTIVE';
    get diagnostics v_r7_retired=row_count;
    if v_r7_retired>0 then
      insert into public.cie_authority_invalidation_events(opportunity_id,organisation_id,campaign_id,authority_layer,previous_fingerprint,next_fingerprint,reason,scheduler_run_id,metadata_json)
      values(o.id,o.organisation_id,o.campaign_id,'R7',prior.input_fingerprint,p_input_fingerprint,'R4_EXACT_RESEARCH_BASIS_CHANGED',p_scheduler_run_id,jsonb_build_object('retiredDirectives',v_r7_retired));
    end if;
  end if;

  if prior.opportunity_id is not null and v_material_changed then
    update public.cie_r6_contact_decisions set authority_status='STALE',invalidated_at=now(),invalidation_reason='PARENT_R4_AUTHORITY_CHANGED',applied_at=null,updated_at=now()
    where opportunity_id=o.id and authority_status='ACTIVE';
    get diagnostics v_rows=row_count; v_r6_invalidated:=v_rows>0;

    update public.opportunities set status='BUILDING',primary_contact_id=null,opportunity_score=null,
      scoring_version='cie-r4-fb3-revalidation-pending',updated_at=now()
    where id=o.id and status not in ('APPROVED','REJECTED','ENGAGED');

    insert into public.cie_authority_invalidation_events(opportunity_id,organisation_id,campaign_id,authority_layer,previous_fingerprint,next_fingerprint,reason,scheduler_run_id,metadata_json)
    values(o.id,o.organisation_id,o.campaign_id,'R4',prior.authority_fingerprint,p_authority_fingerprint,'MATERIAL_COMMERCIAL_AUTHORITY_CHANGED',p_scheduler_run_id,
      jsonb_build_object('previousDisposition',prior.disposition,'nextDisposition',p_disposition,'previousRealityState',prior.reality_state,'nextRealityState',p_reality_state,'r6Invalidated',v_r6_invalidated));
  end if;

  insert into public.cie_r4_commercial_decisions(
    opportunity_id,organisation_id,campaign_id,scheduler_run_id,reality_id,target_entity_id,reality_state,disposition,
    authority_mode,decision_json,producer_version,input_fingerprint,authority_fingerprint,seller_context_fingerprint,constraint_fingerprint,
    target_truth_entity_id,target_truth_snapshot_id,target_truth_semantics_version,production_id,last_validated_at,next_validation_at,invalidation_count,last_invalidation_reason
  ) values (
    o.id,o.organisation_id,o.campaign_id,p_scheduler_run_id,p_reality_id,p_target_entity_id,p_reality_state,p_disposition,
    'AUTHORITATIVE',p_decision_json,p_producer_version,p_input_fingerprint,p_authority_fingerprint,p_seller_context_fingerprint,p_constraint_fingerprint,
    p_target_truth_entity_id,p_target_truth_snapshot_id,p_target_truth_semantics_version,v_production_id,p_reference_time,p_reference_time+interval '24 hours',
    case when prior.opportunity_id is not null and v_material_changed then prior.invalidation_count+1 else coalesce(prior.invalidation_count,0) end,
    case when prior.opportunity_id is not null and v_material_changed then 'MATERIAL_COMMERCIAL_AUTHORITY_CHANGED' else null end
  ) on conflict(opportunity_id) do update set
    scheduler_run_id=excluded.scheduler_run_id,reality_id=excluded.reality_id,target_entity_id=excluded.target_entity_id,
    reality_state=excluded.reality_state,disposition=excluded.disposition,authority_mode='AUTHORITATIVE',decision_json=excluded.decision_json,
    producer_version=excluded.producer_version,input_fingerprint=excluded.input_fingerprint,authority_fingerprint=excluded.authority_fingerprint,
    seller_context_fingerprint=excluded.seller_context_fingerprint,constraint_fingerprint=excluded.constraint_fingerprint,
    target_truth_entity_id=excluded.target_truth_entity_id,target_truth_snapshot_id=excluded.target_truth_snapshot_id,
    target_truth_semantics_version=excluded.target_truth_semantics_version,production_id=excluded.production_id,
    applied_at=case when v_material_changed then null else public.cie_r4_commercial_decisions.applied_at end,
    last_validated_at=excluded.last_validated_at,next_validation_at=excluded.next_validation_at,
    invalidation_count=case when v_material_changed then public.cie_r4_commercial_decisions.invalidation_count+1 else public.cie_r4_commercial_decisions.invalidation_count end,
    last_invalidation_reason=case when v_material_changed then 'MATERIAL_COMMERCIAL_AUTHORITY_CHANGED' else public.cie_r4_commercial_decisions.last_invalidation_reason end,
    updated_at=now();

  return query select v_material_changed,v_r6_invalidated,v_r7_retired;
end $$;
revoke all on function public.persist_cie_r4_commercial_reality_production(uuid,uuid,text,text,text,text,text,uuid,uuid,text,timestamptz,text,text,text,text,jsonb,jsonb,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.persist_cie_r4_commercial_reality_production(uuid,uuid,text,text,text,text,text,uuid,uuid,text,timestamptz,text,text,text,text,jsonb,jsonb,jsonb,jsonb,jsonb) to service_role;

-- Foundation sync is now identity materialisation only. It never demotes a state
-- backed by a current R4 lineage. This closes the READY -> BUILDING cron regression.
create or replace function public.sync_cie_r4_opportunity_foundations(p_scheduler_run_id uuid)
returns table(created integer,updated integer,ranked integer,ready integer,"needsContact" integer)
language plpgsql security definer set search_path=public as $$
declare
  v_company record; v_existing public.opportunities%rowtype;
  v_created integer:=0; v_updated integer:=0; v_ranked integer:=0; v_opp_id uuid; v_has_authority boolean;
begin
  if not exists(select 1 from public.pipeline_scheduler_lease where singleton=true and run_id=p_scheduler_run_id and lease_expires_at>now())
  then raise exception 'PIPELINE_SCHEDULER_LEASE_NOT_HELD'; end if;

  for v_company in
    select co.* from public.companies co join public.campaigns ca on ca.id=co.campaign_id
    where co.review_status='APPROVED' and ca.status not in ('PAUSED','CANCELLED')
    order by co.campaign_id,co.created_at,co.id for update of co skip locked
  loop
    select * into v_existing from public.opportunities
    where organisation_id=v_company.organisation_id and campaign_id=v_company.campaign_id and company_id=v_company.id for update;

    if v_existing.id is null then
      insert into public.opportunities(organisation_id,campaign_id,company_id,primary_contact_id,status,rank,opportunity_score,scoring_version)
      values(v_company.organisation_id,v_company.campaign_id,v_company.id,null,'BUILDING',1,null,'cie-r4-awaiting-authoritative-decision') returning id into v_opp_id;
      v_created:=v_created+1;
      insert into public.opportunity_history(organisation_id,campaign_id,opportunity_id,event_type,next_status,next_rank,metadata_json)
      values(v_company.organisation_id,v_company.campaign_id,v_opp_id,'CREATED','BUILDING',1,jsonb_build_object('companyId',v_company.id,'schedulerRunId',p_scheduler_run_id,'authority','CIE-R4'));
    elsif v_existing.status not in ('APPROVED','REJECTED','ENGAGED') then
      select exists(select 1 from public.cie_r4_commercial_decisions d where d.opportunity_id=v_existing.id
        and d.production_id is not null and d.target_truth_semantics_version='MR-TI-2-TFR1'
        and d.producer_version in ('MR-T8-FB2-1.0.0','MR-T8-FB3-1.0.0')) into v_has_authority;
      if v_has_authority then
        if v_existing.opportunity_score is not null then
          update public.opportunities set opportunity_score=null,updated_at=now() where id=v_existing.id;
          v_updated:=v_updated+1;
        end if;
      elsif v_existing.status<>'BUILDING' or v_existing.opportunity_score is not null or coalesce(v_existing.scoring_version,'')<>'cie-r4-awaiting-authoritative-decision' then
        update public.opportunities set status='BUILDING',primary_contact_id=null,opportunity_score=null,scoring_version='cie-r4-awaiting-authoritative-decision',updated_at=now() where id=v_existing.id;
        v_updated:=v_updated+1;
      end if;
    end if;
    v_existing:=null;
  end loop;

  with ranked_rows as (
    select id,row_number() over(partition by organisation_id,campaign_id order by created_at,id)::integer as new_rank from public.opportunities
  ), changed as (
    update public.opportunities o set rank=r.new_rank,updated_at=case when o.rank<>r.new_rank then now() else o.updated_at end
    from ranked_rows r where o.id=r.id and o.rank<>r.new_rank returning o.id
  ) select count(*) into v_ranked from changed;
  return query select v_created,v_updated,v_ranked,0,0;
end $$;
revoke all on function public.sync_cie_r4_opportunity_foundations(uuid) from public,anon,authenticated;
grant execute on function public.sync_cie_r4_opportunity_foundations(uuid) to service_role;

create or replace function public.apply_cie_r4_commercial_decision_authority(p_scheduler_run_id uuid)
returns table(applied integer,rejected integer,held integer,"researchRequired" integer,candidates integer)
language plpgsql security definer set search_path=public as $$
declare r record; a integer:=0; x integer:=0; h integer:=0; q integer:=0; c integer:=0;
begin
  if not exists(select 1 from public.pipeline_scheduler_lease where singleton=true and run_id=p_scheduler_run_id and lease_expires_at>now())
  then raise exception 'PIPELINE_SCHEDULER_LEASE_NOT_HELD'; end if;
  for r in
    select d.* from public.cie_r4_commercial_decisions d
    where d.applied_at is null and d.producer_version='MR-T8-FB3-1.0.0' and d.production_id is not null
      and d.authority_fingerprint ~ '^[0-9a-f]{64}$' and d.target_truth_semantics_version='MR-TI-2-TFR1'
    order by d.updated_at,d.opportunity_id limit 100 for update skip locked
  loop
    update public.opportunities o set
      status=case when r.disposition='REJECT' then 'LOW_PRIORITY' when r.disposition in ('HOLD_TEMPORAL','RESEARCH_REQUIRED') then 'NEEDS_EVIDENCE' else 'BUILDING' end,
      primary_contact_id=null,opportunity_score=null,scoring_version='cie-r4-fb3-current-commercial-authority',updated_at=now()
    where o.id=r.opportunity_id and o.status not in ('APPROVED','REJECTED','ENGAGED');
    update public.cie_r4_commercial_decisions set applied_at=now(),updated_at=now(),scheduler_run_id=p_scheduler_run_id where opportunity_id=r.opportunity_id;
    a:=a+1;
    if r.disposition='REJECT' then x:=x+1; elsif r.disposition='HOLD_TEMPORAL' then h:=h+1; elsif r.disposition='RESEARCH_REQUIRED' then q:=q+1; else c:=c+1; end if;
  end loop;
  return query select a,x,h,q,c;
end $$;
revoke all on function public.apply_cie_r4_commercial_decision_authority(uuid) from public,anon,authenticated;
grant execute on function public.apply_cie_r4_commercial_decision_authority(uuid) to service_role;

-- R6 source/parent invalidation happens before its worker recomputes. Any failed
-- recomputation therefore leaves BUILDING, never a stale READY facade.
create or replace function public.invalidate_stale_cie_r6_authority(p_scheduler_run_id uuid)
returns table(invalidated integer) language plpgsql security definer set search_path=public as $$
declare r record; n integer:=0; reason text;
begin
  if not exists(select 1 from public.pipeline_scheduler_lease where singleton=true and run_id=p_scheduler_run_id and lease_expires_at>now())
  then raise exception 'PIPELINE_SCHEDULER_LEASE_NOT_HELD'; end if;
  for r in
    select d.opportunity_id,d.parent_r4_authority_fingerprint,d.source_fingerprint,d.updated_at,
      o.organisation_id,o.campaign_id,o.company_id,r4.authority_fingerprint as current_r4_fingerprint
    from public.cie_r6_contact_decisions d
    join public.opportunities o on o.id=d.opportunity_id
    left join public.cie_r4_commercial_decisions r4 on r4.opportunity_id=d.opportunity_id
    where d.authority_status='ACTIVE' and (
      r4.producer_version is distinct from 'MR-T8-FB3-1.0.0'
      or r4.authority_fingerprint is null
      or d.parent_r4_authority_fingerprint is distinct from r4.authority_fingerprint
      or exists(select 1 from public.commercial_routes cr where cr.organisation_id=o.organisation_id and cr.campaign_id=o.campaign_id and cr.company_id=o.company_id and cr.updated_at>d.updated_at)
      or exists(select 1 from public.commercial_route_evidence cre where cre.organisation_id=o.organisation_id and cre.campaign_id=o.campaign_id and cre.company_id=o.company_id and cre.created_at>d.updated_at)
      or exists(select 1 from public.contacts c where c.organisation_id=o.organisation_id and c.campaign_id=o.campaign_id and c.company_id=o.company_id and c.updated_at>d.updated_at)
      or exists(select 1 from public.contact_evidence e where e.organisation_id=o.organisation_id and e.campaign_id=o.campaign_id and e.company_id=o.company_id and e.created_at>d.updated_at)
    ) for update of d skip locked
  loop
    reason:=case
      when r.current_r4_fingerprint is null or r.parent_r4_authority_fingerprint is distinct from r.current_r4_fingerprint then 'PARENT_R4_AUTHORITY_CHANGED'
      else 'ROUTE_OR_CONTACT_SOURCE_CHANGED' end;
    update public.cie_r6_contact_decisions set authority_status='STALE',invalidated_at=now(),invalidation_reason=reason,applied_at=null,updated_at=now()
      where opportunity_id=r.opportunity_id;
    update public.opportunities set status='BUILDING',primary_contact_id=null,opportunity_score=null,scoring_version='cie-r6-stale-revalidation',updated_at=now()
      where id=r.opportunity_id and status not in ('APPROVED','REJECTED','ENGAGED');
    insert into public.cie_authority_invalidation_events(opportunity_id,organisation_id,campaign_id,authority_layer,previous_fingerprint,next_fingerprint,reason,scheduler_run_id,metadata_json)
      values(r.opportunity_id,r.organisation_id,r.campaign_id,'R6',r.source_fingerprint,r.current_r4_fingerprint,reason,p_scheduler_run_id,'{}'::jsonb);
    n:=n+1;
  end loop;
  return query select n;
end $$;
revoke all on function public.invalidate_stale_cie_r6_authority(uuid) from public,anon,authenticated;
grant execute on function public.invalidate_stale_cie_r6_authority(uuid) to service_role;

-- Return row type changed in Build 3 (adds r4_authority_fingerprint); PostgreSQL requires DROP before recreation.
create function public.get_cie_r6_contact_authority_context(p_scheduler_run_id uuid,p_limit integer default 40)
returns table(opportunity_id uuid,reality_id text,commercial_routes jsonb,contacts jsonb,r4_authority_fingerprint text)
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
      from public.contacts c where c.organisation_id=o.organisation_id and c.campaign_id=o.campaign_id and c.company_id=o.company_id),'[]'::jsonb),
    d.authority_fingerprint
  from public.opportunities o
  join public.cie_r4_commercial_decisions d on d.opportunity_id=o.id and d.disposition='COMMERCIAL_CANDIDATE'
    and d.producer_version='MR-T8-FB3-1.0.0' and d.production_id is not null and d.target_truth_semantics_version='MR-TI-2-TFR1'
    and d.authority_fingerprint ~ '^[0-9a-f]{64}$'
  left join public.cie_r6_contact_decisions cd on cd.opportunity_id=o.id
  where o.status='BUILDING' and (cd.opportunity_id is null or cd.authority_status='STALE' or cd.applied_at is null or cd.parent_r4_authority_fingerprint is distinct from d.authority_fingerprint)
  order by o.created_at,o.id limit greatest(1,least(coalesce(p_limit,40),100));
end $$;
revoke all on function public.get_cie_r6_contact_authority_context(uuid,integer) from public,anon,authenticated;
grant execute on function public.get_cie_r6_contact_authority_context(uuid,integer) to service_role;

-- Remove the old un-fingerprinted R6 write surface.
drop function if exists public.persist_cie_r6_contact_decision(uuid,uuid,jsonb,jsonb,jsonb);
-- Build-3 signature too, for safe reruns after partial execution.
drop function if exists public.persist_cie_r6_contact_decision(uuid,text,text,uuid,jsonb,jsonb,jsonb);
create function public.persist_cie_r6_contact_decision(
  p_opportunity_id uuid,
  p_parent_r4_authority_fingerprint text,
  p_source_fingerprint text,
  p_primary_contact_id uuid,
  p_contact_frontier_json jsonb,
  p_bindings_json jsonb,
  p_decision_json jsonb
) returns void language plpgsql security definer set search_path=public as $$
declare o public.opportunities%rowtype; r4 public.cie_r4_commercial_decisions%rowtype;
begin
  select * into o from public.opportunities where id=p_opportunity_id;
  if not found then raise exception 'CIE_R6_OPPORTUNITY_NOT_FOUND'; end if;
  select * into r4 from public.cie_r4_commercial_decisions where opportunity_id=o.id;
  if not found or r4.producer_version<>'MR-T8-FB3-1.0.0' or r4.authority_fingerprint is distinct from p_parent_r4_authority_fingerprint
  then raise exception 'CIE_R6_PARENT_R4_AUTHORITY_MISMATCH'; end if;
  if p_parent_r4_authority_fingerprint !~ '^[0-9a-f]{64}$' or p_source_fingerprint !~ '^[0-9a-f]{64}$' then raise exception 'CIE_R6_FINGERPRINT_INVALID'; end if;
  if coalesce(p_decision_json->>'authorityMode','') <> 'AUTHORITATIVE' then raise exception 'CIE_R6_NON_AUTHORITATIVE_DECISION'; end if;
  if coalesce((p_decision_json->>'canUnlockOpportunity')::boolean,false) is not true then raise exception 'CIE_R6_CANNOT_UNLOCK'; end if;
  if p_primary_contact_id is not null and not exists(select 1 from public.contacts c where c.id=p_primary_contact_id and c.organisation_id=o.organisation_id and c.campaign_id=o.campaign_id and c.company_id=o.company_id)
  then raise exception 'CIE_R6_CONTACT_SCOPE_MISMATCH'; end if;

  insert into public.cie_r6_contact_decisions(opportunity_id,organisation_id,campaign_id,parent_r4_authority_fingerprint,source_fingerprint,primary_contact_id,contact_frontier_json,bindings_json,decision_json,authority_status,invalidated_at,invalidation_reason)
  values(o.id,o.organisation_id,o.campaign_id,p_parent_r4_authority_fingerprint,p_source_fingerprint,p_primary_contact_id,coalesce(p_contact_frontier_json,'[]'::jsonb),coalesce(p_bindings_json,'[]'::jsonb),p_decision_json,'ACTIVE',null,null)
  on conflict(opportunity_id) do update set
    parent_r4_authority_fingerprint=excluded.parent_r4_authority_fingerprint,source_fingerprint=excluded.source_fingerprint,
    primary_contact_id=excluded.primary_contact_id,contact_frontier_json=excluded.contact_frontier_json,bindings_json=excluded.bindings_json,
    decision_json=excluded.decision_json,authority_status='ACTIVE',invalidated_at=null,invalidation_reason=null,applied_at=null,updated_at=now();
end $$;
revoke all on function public.persist_cie_r6_contact_decision(uuid,text,text,uuid,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.persist_cie_r6_contact_decision(uuid,text,text,uuid,jsonb,jsonb,jsonb) to service_role;

create or replace function public.apply_cie_r6_contact_authority()
returns table(applied integer,ready integer,organisational integer)
language plpgsql security definer set search_path=public as $$
declare r record; a integer:=0; rd integer:=0; org integer:=0;
begin
  for r in
    select d.*,r4.disposition,r4.authority_fingerprint as current_r4_fingerprint
    from public.cie_r6_contact_decisions d
    join public.cie_r4_commercial_decisions r4 on r4.opportunity_id=d.opportunity_id
      and r4.producer_version='MR-T8-FB3-1.0.0' and r4.production_id is not null and r4.target_truth_semantics_version='MR-TI-2-TFR1'
    where d.applied_at is null and d.authority_status='ACTIVE' and r4.disposition='COMMERCIAL_CANDIDATE'
      and d.parent_r4_authority_fingerprint=r4.authority_fingerprint
    order by d.updated_at,d.opportunity_id for update of d skip locked
  loop
    update public.opportunities o set primary_contact_id=r.primary_contact_id,status='READY',opportunity_score=null,
      scoring_version='cie-r6-fb3-current-route-contact-authority',updated_at=now()
    where o.id=r.opportunity_id and o.status not in ('APPROVED','REJECTED','ENGAGED');
    update public.cie_r6_contact_decisions set applied_at=now(),updated_at=now() where opportunity_id=r.opportunity_id;
    a:=a+1; rd:=rd+1; if r.primary_contact_id is null then org:=org+1; end if;
  end loop;
  return query select a,rd,org;
end $$;
revoke all on function public.apply_cie_r6_contact_authority() from public,anon,authenticated;
grant execute on function public.apply_cie_r6_contact_authority() to service_role;

-- R7 exact research basis follows R4 input lineage, not only material R4 state.
-- Return row type changed in Build 3 (adds r4_input_fingerprint); PostgreSQL requires DROP before recreation.
create function public.get_cie_r7_research_context(p_scheduler_run_id uuid,p_limit integer default 100)
returns table(opportunity_id uuid,reality_id text,repair_id uuid,claim_id uuid,claim_key text,objective text,repair_mode text,blocking_mode text,stability_json jsonb,r4_input_fingerprint text)
language plpgsql security definer set search_path=public as $$
begin
  if not exists(select 1 from public.pipeline_scheduler_lease where singleton=true and run_id=p_scheduler_run_id and lease_expires_at>now()) then raise exception 'PIPELINE_SCHEDULER_LEASE_NOT_HELD'; end if;
  return query
  select o.id,r4.reality_id,q.id,q.claim_id,q.claim_key,q.objective,q.repair_mode,q.blocking_mode,r4.decision_json->'stability',r4.input_fingerprint
  from public.opportunities o
  join public.cie_r4_commercial_decisions r4 on r4.opportunity_id=o.id and r4.producer_version='MR-T8-FB3-1.0.0'
    and r4.production_id is not null and r4.target_truth_semantics_version='MR-TI-2-TFR1' and r4.authority_fingerprint is not null
  join public.genesis_g8_discovery_repair_queue q on q.company_id=o.company_id and q.status in ('QUEUED','CLAIMED')
  where r4.disposition in ('RESEARCH_REQUIRED','COMMERCIAL_CANDIDATE') and r4.decision_json ? 'stability'
  order by o.created_at,o.id,q.created_at,q.id limit greatest(1,least(coalesce(p_limit,100),250));
end $$;
revoke all on function public.get_cie_r7_research_context(uuid,integer) from public,anon,authenticated;
grant execute on function public.get_cie_r7_research_context(uuid,integer) to service_role;

drop function if exists public.replace_cie_r7_research_directives(uuid,text,jsonb);
-- Build-3 signature too, for safe reruns after partial execution.
drop function if exists public.replace_cie_r7_research_directives(uuid,text,text,jsonb);
create function public.replace_cie_r7_research_directives(p_opportunity_id uuid,p_reality_id text,p_r4_input_fingerprint text,p_directives_json jsonb)
returns void language plpgsql security definer set search_path=public as $$
declare d jsonb; rid uuid; r4 public.cie_r4_commercial_decisions%rowtype;
begin
  if p_r4_input_fingerprint !~ '^[0-9a-f]{64}$' then raise exception 'CIE_R7_R4_INPUT_FINGERPRINT_INVALID'; end if;
  select * into r4 from public.cie_r4_commercial_decisions where opportunity_id=p_opportunity_id;
  if not found or r4.producer_version<>'MR-T8-FB3-1.0.0' or r4.input_fingerprint is distinct from p_r4_input_fingerprint or r4.reality_id is distinct from p_reality_id
  then raise exception 'CIE_R7_R4_RESEARCH_BASIS_STALE'; end if;
  if jsonb_typeof(coalesce(p_directives_json,'[]'::jsonb))<>'array' then raise exception 'CIE_R7_DIRECTIVES_MUST_BE_ARRAY'; end if;
  update public.cie_r7_research_directives set status='RETIRED',updated_at=now() where opportunity_id=p_opportunity_id and status='ACTIVE';
  for d in select value from jsonb_array_elements(p_directives_json) loop
    if coalesce(d->>'authorityMode','')<>'AUTHORITATIVE' then raise exception 'CIE_R7_NON_AUTHORITATIVE_RESEARCH_DIRECTIVE'; end if;
    rid=(d->>'repairId')::uuid;
    if not exists(select 1 from public.genesis_g8_discovery_repair_queue q where q.id=rid and q.claim_id=(d->>'claimId')::uuid) then raise exception 'CIE_R7_REPAIR_CLAIM_MISMATCH'; end if;
    insert into public.cie_r7_research_directives(repair_id,opportunity_id,reality_id,claim_id,claim_key,impact_class,impact_precedence,order_index,directive_json,status,r4_input_fingerprint)
    values(rid,p_opportunity_id,p_reality_id,(d->>'claimId')::uuid,d->>'claimKey',d->>'impactClass',(d->>'impactPrecedence')::integer,(d->>'orderIndex')::integer,d,'ACTIVE',p_r4_input_fingerprint)
    on conflict(repair_id) do update set opportunity_id=excluded.opportunity_id,reality_id=excluded.reality_id,claim_id=excluded.claim_id,claim_key=excluded.claim_key,
      impact_class=excluded.impact_class,impact_precedence=excluded.impact_precedence,order_index=excluded.order_index,directive_json=excluded.directive_json,
      status='ACTIVE',r4_input_fingerprint=excluded.r4_input_fingerprint,updated_at=now();
  end loop;
end $$;
revoke all on function public.replace_cie_r7_research_directives(uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.replace_cie_r7_research_directives(uuid,text,text,jsonb) to service_role;

create or replace function public.retire_stale_cie_r7_research_directives()
returns table(retired integer) language plpgsql security definer set search_path=public as $$
declare n integer;
begin
  update public.cie_r7_research_directives d set status='RETIRED',updated_at=now()
  where d.status='ACTIVE' and (
    not exists(select 1 from public.genesis_g8_discovery_repair_queue q where q.id=d.repair_id and q.status in ('QUEUED','CLAIMED'))
    or not exists(select 1 from public.cie_r4_commercial_decisions r4 where r4.opportunity_id=d.opportunity_id and r4.producer_version='MR-T8-FB3-1.0.0' and r4.input_fingerprint=d.r4_input_fingerprint)
  );
  get diagnostics n=row_count; return query select n;
end $$;
revoke all on function public.retire_stale_cie_r7_research_directives() from public,anon,authenticated;
grant execute on function public.retire_stale_cie_r7_research_directives() to service_role;

comment on column public.cie_r4_commercial_decisions.authority_fingerprint is
'Forensic Build 3 material R4 authority identity. Exact Truth snapshot/reference-time churn lives in input_fingerprint and does not automatically invalidate R6.';
comment on column public.cie_r6_contact_decisions.parent_r4_authority_fingerprint is
'R4 material authority fingerprint this R6 route/contact decision was derived under. Mismatch makes R6 stale.';
comment on table public.cie_authority_invalidation_events is
'Append-only Build 3 audit trail for deterministic R4/R6/R7 authority invalidation. Workflow state and authority validity are distinct.';

notify pgrst, 'reload schema';

COMMIT;
