BEGIN;

-- MarketRoute Forensic Build 8 — Constitutional Hardening + Adversarial Certification
-- Functional architecture from Builds 1-7 is preserved. This migration adds a
-- mandatory R4 boundary constitution and central current-authority gates used by
-- read, route, contact, approval, queue and send-time execution paths.

alter table public.cie_r4_commercial_reality_productions
  add column if not exists boundary_constitution_version text,
  add column if not exists boundary_completeness_json jsonb;

alter table public.cie_r4_commercial_decisions
  add column if not exists boundary_constitution_version text,
  add column if not exists boundary_completeness_json jsonb;

comment on column public.cie_r4_commercial_decisions.boundary_constitution_version is
'Forensic Build 8 mandatory-boundary constitution. Current value MR-T8-FB8-BOUNDARY-1.0.0.';
comment on column public.cie_r4_commercial_decisions.boundary_completeness_json is
'Categorical R4 boundary completeness. A COMMERCIAL_CANDIDATE requires complete=true; missing/unresolved mandatory questions fail closed.';

-- Central currentness gates. These are the constitutional runtime source of truth
-- for temporal validity and parent lineage. They deliberately contain no score.
create or replace function public.cie_r4_authority_current(p_opportunity_id uuid)
returns boolean language sql stable set search_path=public as $$
  select exists(
    select 1
    from public.cie_r4_commercial_decisions d
    join public.cie_r4_commercial_reality_productions p on p.id=d.production_id and p.opportunity_id=d.opportunity_id
    join public.genesis_g8_truth_v2_snapshots ts on ts.id=d.target_truth_snapshot_id and ts.entity_id=d.target_truth_entity_id
    where d.opportunity_id=p_opportunity_id
      and d.authority_mode='AUTHORITATIVE'
      and d.producer_version='MR-T8-FB3-1.0.0'
      and d.target_truth_semantics_version='MR-TI-2-TFR1'
      and ts.truth_semantics_version='MR-TI-2-TFR1'
      and d.authority_fingerprint ~ '^[0-9a-f]{64}$'
      and p.authority_fingerprint=d.authority_fingerprint
      and d.applied_at is not null
      and d.next_validation_at is not null and d.next_validation_at>now()
      and d.boundary_constitution_version='MR-T8-FB8-BOUNDARY-1.0.0'
      and p.boundary_constitution_version='MR-T8-FB8-BOUNDARY-1.0.0'
      and jsonb_typeof(d.boundary_completeness_json)='object'
      and jsonb_typeof(p.boundary_completeness_json)='object'
      and d.boundary_completeness_json=p.boundary_completeness_json
      and (
        d.disposition<>'COMMERCIAL_CANDIDATE'
        or coalesce((d.boundary_completeness_json->>'complete')::boolean,false)=true
      )
  );
$$;
revoke all on function public.cie_r4_authority_current(uuid) from public,anon,authenticated;
grant execute on function public.cie_r4_authority_current(uuid) to service_role;

create or replace function public.cie_r5_authority_current(p_opportunity_id uuid)
returns boolean language sql stable set search_path=public as $$
  select exists(
    select 1 from public.cie_r5_route_decisions r5
    join public.cie_r4_commercial_decisions r4 on r4.opportunity_id=r5.opportunity_id
    where r5.opportunity_id=p_opportunity_id
      and public.cie_r4_authority_current(p_opportunity_id)
      and r4.disposition='COMMERCIAL_CANDIDATE'
      and r5.authority_status='ACTIVE'
      and r5.producer_version='MR-T8-FB5-R5-1.0.0'
      and r5.authority_fingerprint ~ '^[0-9a-f]{64}$'
      and r5.parent_r4_authority_fingerprint=r4.authority_fingerprint
      and r5.applied_at is not null
  );
$$;
revoke all on function public.cie_r5_authority_current(uuid) from public,anon,authenticated;
grant execute on function public.cie_r5_authority_current(uuid) to service_role;

create or replace function public.cie_r6_authority_current(p_opportunity_id uuid)
returns boolean language sql stable set search_path=public as $$
  select exists(
    select 1 from public.cie_r6_contact_decisions r6
    join public.cie_r5_route_decisions r5 on r5.opportunity_id=r6.opportunity_id
    join public.cie_r4_commercial_decisions r4 on r4.opportunity_id=r6.opportunity_id
    where r6.opportunity_id=p_opportunity_id
      and public.cie_r5_authority_current(p_opportunity_id)
      and r6.authority_status='ACTIVE'
      and r6.producer_version='MR-T8-FB6-R6-1.0.0'
      and r6.contact_truth_fingerprint ~ '^[0-9a-f]{64}$'
      and r6.parent_r4_authority_fingerprint=r4.authority_fingerprint
      and r6.parent_r5_authority_fingerprint=r5.authority_fingerprint
      and r6.applied_at is not null
      and (r6.primary_contact_id is null or (r6.next_revalidation_at is not null and r6.next_revalidation_at>now()))
  );
$$;
revoke all on function public.cie_r6_authority_current(uuid) from public,anon,authenticated;
grant execute on function public.cie_r6_authority_current(uuid) to service_role;

-- Existing pre-Build-8 authority is not constitution-certified. Revalidation is
-- mandatory before it can be displayed or executed as current.
update public.cie_r6_contact_decisions d set
  authority_status='STALE',invalidated_at=now(),invalidation_reason='R4_BOUNDARY_CONSTITUTION_UPGRADE',applied_at=null,updated_at=now()
where d.authority_status='ACTIVE'
  and exists(select 1 from public.cie_r4_commercial_decisions r4 where r4.opportunity_id=d.opportunity_id and coalesce(r4.boundary_constitution_version,'')<>'MR-T8-FB8-BOUNDARY-1.0.0');

update public.cie_r5_route_decisions d set
  authority_status='STALE',invalidated_at=now(),invalidation_reason='R4_BOUNDARY_CONSTITUTION_UPGRADE',applied_at=null,updated_at=now()
where d.authority_status='ACTIVE'
  and exists(select 1 from public.cie_r4_commercial_decisions r4 where r4.opportunity_id=d.opportunity_id and coalesce(r4.boundary_constitution_version,'')<>'MR-T8-FB8-BOUNDARY-1.0.0');

update public.cie_r4_commercial_decisions set
  applied_at=null,next_validation_at=now(),last_invalidation_reason='BOUNDARY_CONSTITUTION_REVALIDATION_REQUIRED',updated_at=now()
where coalesce(boundary_constitution_version,'')<>'MR-T8-FB8-BOUNDARY-1.0.0';

update public.opportunities o set status='BUILDING',primary_contact_id=null,opportunity_score=null,
  scoring_version='cie-fb8-boundary-constitution-revalidation',updated_at=now()
where o.status not in ('APPROVED','REJECTED','ENGAGED')
  and exists(select 1 from public.cie_r4_commercial_decisions r4 where r4.opportunity_id=o.id and coalesce(r4.boundary_constitution_version,'')<>'MR-T8-FB8-BOUNDARY-1.0.0');

-- Revalidation candidate discovery itself understands the Build-8 constitution,
-- rather than relying on the one-time migration update above.
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
      when coalesce(d.boundary_constitution_version,'')<>'MR-T8-FB8-BOUNDARY-1.0.0' then 'BOUNDARY_CONSTITUTION_REVALIDATION'
      when d.authority_fingerprint is null then 'MISSING_MATERIAL_AUTHORITY_FINGERPRINT'
      when d.seller_context_fingerprint is distinct from sc.source_fingerprint then 'SELLER_CONTEXT_CHANGED'
      when d.constraint_fingerprint is distinct from cs.constraint_fingerprint then 'SELLER_CONSTRAINTS_CHANGED'
      when latest.id is not null and latest.id is distinct from d.target_truth_snapshot_id then 'NEWER_TRUTH_SNAPSHOT'
      else 'TEMPORAL_REVALIDATION_DUE'
    end
  from public.opportunities o
  join public.campaign_genesis_t8_seller_contexts sc on sc.campaign_id=o.campaign_id and sc.organisation_id=o.organisation_id
  join public.campaign_genesis_t8_constraint_sets cs on cs.campaign_id=o.campaign_id and cs.organisation_id=o.organisation_id
  left join public.cie_r4_commercial_decisions d on d.opportunity_id=o.id
  left join lateral (
    select s.id,s.calculated_at from public.genesis_g8_truth_v2_snapshots s
    where d.target_truth_entity_id is not null and s.entity_id=d.target_truth_entity_id and s.truth_semantics_version='MR-TI-2-TFR1'
    order by s.calculated_at desc,s.created_at desc,s.id desc limit 1
  ) latest on true
  where o.status not in ('APPROVED','REJECTED','ENGAGED')
    and (
      d.opportunity_id is null
      or d.producer_version is distinct from 'MR-T8-FB3-1.0.0'
      or coalesce(d.boundary_constitution_version,'')<>'MR-T8-FB8-BOUNDARY-1.0.0'
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
         when coalesce(d.boundary_constitution_version,'')<>'MR-T8-FB8-BOUNDARY-1.0.0' then 2
         when latest.id is not null and latest.id is distinct from d.target_truth_snapshot_id then 3
         else 4 end,
    o.created_at,o.id
  limit greatest(1,least(coalesce(p_limit,12),25));
end $$;
revoke all on function public.get_cie_r4_commercial_reality_revalidation_candidates(uuid,integer) from public,anon,authenticated;
grant execute on function public.get_cie_r4_commercial_reality_revalidation_candidates(uuid,integer) to service_role;

-- R4 persistence now carries Build-8 boundary certification.
create or replace function public.persist_cie_r4_commercial_reality_production(
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
  if coalesce(p_decision_json->>'boundaryConstitutionVersion','') <> 'MR-T8-FB8-BOUNDARY-1.0.0' then raise exception 'CIE_R4_FB8_BOUNDARY_CONSTITUTION_VERSION_INVALID'; end if;
  if jsonb_typeof(coalesce(p_decision_json->'boundaryCompleteness','null'::jsonb)) <> 'object' then raise exception 'CIE_R4_FB8_BOUNDARY_COMPLETENESS_INVALID'; end if;
  if coalesce(p_decision_json#>>'{boundaryCompleteness,schema}','') <> 'marketroute_fb8_boundary_completeness/v1' then raise exception 'CIE_R4_FB8_BOUNDARY_SCHEMA_INVALID'; end if;
  if coalesce(p_decision_json#>>'{boundaryCompleteness,constitutionVersion}','') <> 'MR-T8-FB8-BOUNDARY-1.0.0' then raise exception 'CIE_R4_FB8_BOUNDARY_COMPLETENESS_VERSION_INVALID'; end if;
  if coalesce(p_decision_json#>>'{boundaryCompleteness,realityClass}','') <> 'SELLER_TO_TARGET_COMMERCIAL_ENGAGEMENT' then raise exception 'CIE_R4_FB8_BOUNDARY_REALITY_CLASS_INVALID'; end if;
  if jsonb_typeof(coalesce(p_decision_json#>'{boundaryCompleteness,requiredBoundaryKeys}','null'::jsonb)) <> 'array'
     or jsonb_array_length(p_decision_json#>'{boundaryCompleteness,requiredBoundaryKeys}') <> 5
     or not (p_decision_json#>'{boundaryCompleteness,requiredBoundaryKeys}' @> '["seller.has_persisted_commercial_offering","seller.selected_commercial_objective","target.identity","target.canonical_domain","target.current_operation"]'::jsonb)
  then raise exception 'CIE_R4_FB8_REQUIRED_BOUNDARY_SET_INCOMPLETE'; end if;
  if jsonb_typeof(coalesce(p_decision_json#>'{boundaryCompleteness,representedBoundaryKeys}','null'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_decision_json#>'{boundaryCompleteness,unresolvedBoundaryKeys}','null'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_decision_json#>'{boundaryCompleteness,missingMandatoryBoundaryKeys}','null'::jsonb)) <> 'array'
  then raise exception 'CIE_R4_FB8_BOUNDARY_CLASSIFICATION_INVALID'; end if;
  if p_disposition='COMMERCIAL_CANDIDATE' and (
       coalesce((p_decision_json#>>'{boundaryCompleteness,complete}')::boolean,false) is not true
       or jsonb_array_length(p_decision_json#>'{boundaryCompleteness,representedBoundaryKeys}') <> 5
       or jsonb_array_length(p_decision_json#>'{boundaryCompleteness,unresolvedBoundaryKeys}') <> 0
       or jsonb_array_length(p_decision_json#>'{boundaryCompleteness,missingMandatoryBoundaryKeys}') <> 0
     ) then raise exception 'CIE_R4_FB8_CANDIDATE_BOUNDARY_INCOMPLETE'; end if;

  select * into prior from public.cie_r4_commercial_decisions where opportunity_id=o.id;
  if found then v_material_changed:=prior.authority_fingerprint is distinct from p_authority_fingerprint; end if;

  insert into public.cie_r4_commercial_reality_productions(
    opportunity_id,organisation_id,campaign_id,scheduler_run_id,producer_version,input_fingerprint,authority_fingerprint,
    seller_context_fingerprint,constraint_fingerprint,target_truth_entity_id,target_truth_snapshot_id,target_truth_semantics_version,
    reference_time,reality_id,target_entity_id,propagation_json,constraint_contexts_json,composition_json,decision_json,deferred_seller_constraint_ids,boundary_constitution_version,boundary_completeness_json
  ) values (
    o.id,o.organisation_id,o.campaign_id,p_scheduler_run_id,p_producer_version,p_input_fingerprint,p_authority_fingerprint,
    p_seller_context_fingerprint,p_constraint_fingerprint,p_target_truth_entity_id,p_target_truth_snapshot_id,p_target_truth_semantics_version,
    p_reference_time,p_reality_id,p_target_entity_id,p_propagation_json,coalesce(p_constraint_contexts_json,'[]'::jsonb),p_composition_json,p_decision_json,coalesce(p_deferred_seller_constraint_ids,'[]'::jsonb),
    p_decision_json->>'boundaryConstitutionVersion',p_decision_json->'boundaryCompleteness'
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
    target_truth_entity_id,target_truth_snapshot_id,target_truth_semantics_version,production_id,last_validated_at,next_validation_at,invalidation_count,last_invalidation_reason,boundary_constitution_version,boundary_completeness_json
  ) values (
    o.id,o.organisation_id,o.campaign_id,p_scheduler_run_id,p_reality_id,p_target_entity_id,p_reality_state,p_disposition,
    'AUTHORITATIVE',p_decision_json,p_producer_version,p_input_fingerprint,p_authority_fingerprint,p_seller_context_fingerprint,p_constraint_fingerprint,
    p_target_truth_entity_id,p_target_truth_snapshot_id,p_target_truth_semantics_version,v_production_id,p_reference_time,p_reference_time+interval '24 hours',
    case when prior.opportunity_id is not null and v_material_changed then prior.invalidation_count+1 else coalesce(prior.invalidation_count,0) end,
    case when prior.opportunity_id is not null and v_material_changed then 'MATERIAL_COMMERCIAL_AUTHORITY_CHANGED' else null end,
    p_decision_json->>'boundaryConstitutionVersion',p_decision_json->'boundaryCompleteness'
  ) on conflict(opportunity_id) do update set
    scheduler_run_id=excluded.scheduler_run_id,reality_id=excluded.reality_id,target_entity_id=excluded.target_entity_id,
    reality_state=excluded.reality_state,disposition=excluded.disposition,authority_mode='AUTHORITATIVE',decision_json=excluded.decision_json,
    producer_version=excluded.producer_version,input_fingerprint=excluded.input_fingerprint,authority_fingerprint=excluded.authority_fingerprint,
    seller_context_fingerprint=excluded.seller_context_fingerprint,constraint_fingerprint=excluded.constraint_fingerprint,
    target_truth_entity_id=excluded.target_truth_entity_id,target_truth_snapshot_id=excluded.target_truth_snapshot_id,
    target_truth_semantics_version=excluded.target_truth_semantics_version,production_id=excluded.production_id,
    boundary_constitution_version=excluded.boundary_constitution_version,boundary_completeness_json=excluded.boundary_completeness_json,
    applied_at=case when v_material_changed then null else public.cie_r4_commercial_decisions.applied_at end,
    last_validated_at=excluded.last_validated_at,next_validation_at=excluded.next_validation_at,
    invalidation_count=case when v_material_changed then public.cie_r4_commercial_decisions.invalidation_count+1 else public.cie_r4_commercial_decisions.invalidation_count end,
    last_invalidation_reason=case when v_material_changed then 'MATERIAL_COMMERCIAL_AUTHORITY_CHANGED' else public.cie_r4_commercial_decisions.last_invalidation_reason end,
    updated_at=now();

  return query select v_material_changed,v_r6_invalidated,v_r7_retired;
end $$;


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
      and d.boundary_constitution_version='MR-T8-FB8-BOUNDARY-1.0.0' and jsonb_typeof(d.boundary_completeness_json)='object'
      and (d.disposition<>'COMMERCIAL_CANDIDATE' or coalesce((d.boundary_completeness_json->>'complete')::boolean,false)=true)
    order by d.updated_at,d.opportunity_id limit 100 for update skip locked
  loop
    update public.opportunities o set
      status=case when r.disposition='REJECT' then 'LOW_PRIORITY' when r.disposition in ('HOLD_TEMPORAL','RESEARCH_REQUIRED') then 'NEEDS_EVIDENCE' else 'BUILDING' end,
      primary_contact_id=null,opportunity_score=null,scoring_version='cie-r4-fb8-boundary-certified-authority',updated_at=now()
    where o.id=r.opportunity_id and o.status not in ('APPROVED','REJECTED','ENGAGED');
    update public.cie_r4_commercial_decisions set applied_at=now(),updated_at=now(),scheduler_run_id=p_scheduler_run_id where opportunity_id=r.opportunity_id;
    a:=a+1;
    if r.disposition='REJECT' then x:=x+1; elsif r.disposition='HOLD_TEMPORAL' then h:=h+1; elsif r.disposition='RESEARCH_REQUIRED' then q:=q+1; else c:=c+1; end if;
  end loop;
  return query select a,x,h,q,c;
end $$;


create or replace function public.get_cie_r5_canonical_relationship_context(p_scheduler_run_id uuid)
returns table(opportunity_id uuid,canonical_relationships jsonb)
language plpgsql security definer set search_path=public as $$
begin
  perform public.assert_active_pipeline_scheduler_run(p_scheduler_run_id);
  return query
  select o.id,
    coalesce((select jsonb_agg(jsonb_build_object(
      'id',r.id::text,'relationType',r.relation_type,'edgeClass',r.edge_class,'direction',r.direction,
      'fromNodeId',r.from_node_id,'fromEntityKind',r.from_entity_kind,'fromLabel',r.from_label,'fromCanonicalDomain',r.from_canonical_domain,
      'toNodeId',r.to_node_id,'toEntityKind',r.to_entity_kind,'toLabel',r.to_label,'toCanonicalDomain',r.to_canonical_domain,
      'authorityState',r.authority_state,'evidence',r.evidence_json,'sourceFingerprint',r.source_fingerprint
    ) order by r.id) from public.genesis_t8_canonical_relationship_assertions r
      where r.organisation_id=o.organisation_id and r.campaign_id=o.campaign_id and r.company_id=o.company_id and r.authority_status='ACTIVE'),'[]'::jsonb)
  from public.opportunities o
  join public.cie_r4_commercial_decisions r4 on r4.opportunity_id=o.id and r4.disposition='COMMERCIAL_CANDIDATE' and r4.producer_version='MR-T8-FB3-1.0.0'
  where o.status='BUILDING' and public.cie_r4_authority_current(o.id);
end $$;


create or replace function public.persist_cie_r5_relationship_graph_decision(
  p_opportunity_id uuid,p_parent_r4_authority_fingerprint text,p_source_fingerprint text,p_authority_fingerprint text,
  p_selected_route_ids jsonb,p_route_states_json jsonb,p_relationship_states_json jsonb,p_path_provenance_json jsonb,p_strategy_json jsonb,p_graph_assessment_json jsonb
) returns void language plpgsql security definer set search_path=public as $$
declare o public.opportunities%rowtype; r4 public.cie_r4_commercial_decisions%rowtype; prior public.cie_r5_route_decisions%rowtype; rid text; path jsonb; rel jsonb; changed boolean:=false;
begin
  select * into o from public.opportunities where id=p_opportunity_id; if not found then raise exception 'CIE_R5_OPPORTUNITY_NOT_FOUND'; end if;
  select * into r4 from public.cie_r4_commercial_decisions where opportunity_id=o.id;
  if not found or r4.producer_version<>'MR-T8-FB3-1.0.0' or r4.disposition<>'COMMERCIAL_CANDIDATE' or r4.authority_fingerprint is distinct from p_parent_r4_authority_fingerprint then raise exception 'CIE_R5_PARENT_R4_AUTHORITY_MISMATCH'; end if;
  if not public.cie_r4_authority_current(o.id) then raise exception 'CIE_R5_PARENT_R4_NOT_CONSTITUTION_CURRENT'; end if;
  if p_parent_r4_authority_fingerprint !~ '^[0-9a-f]{64}$' or p_source_fingerprint !~ '^[0-9a-f]{64}$' or p_authority_fingerprint !~ '^[0-9a-f]{64}$' then raise exception 'CIE_R5_FINGERPRINT_INVALID'; end if;
  if jsonb_typeof(coalesce(p_selected_route_ids,'[]'::jsonb))<>'array' or jsonb_array_length(coalesce(p_selected_route_ids,'[]'::jsonb))<1 then raise exception 'CIE_R5_SELECTED_ROUTES_REQUIRED'; end if;
  if coalesce(p_strategy_json->>'promptVersion','')<>'cie-r5-route-authority/v3' then raise exception 'CIE_R5_STRATEGY_VERSION_INVALID'; end if;
  if coalesce(p_relationship_states_json,'[]'::jsonb)::text ~* '"(strength|confidence|score|weight|rank)"\s*:' then raise exception 'CIE_R5_RELATIONSHIP_NUMERIC_AUTHORITY_FORBIDDEN'; end if;

  for rid in select jsonb_array_elements_text(p_selected_route_ids) loop
    if not exists(select 1 from public.commercial_routes cr where cr.id=rid::uuid and cr.organisation_id=o.organisation_id and cr.campaign_id=o.campaign_id and cr.company_id=o.company_id and public.cie_r5_route_fact_state(cr.id)='OPEN') then raise exception 'CIE_R5_SELECTED_ROUTE_NOT_CHANNEL_EVIDENCE_QUALIFIED:%',rid; end if;
    if not exists(select 1 from jsonb_array_elements(coalesce(p_route_states_json,'[]'::jsonb)) rs where rs->>'id'=rid and rs->>'edgeState'='OPEN') then raise exception 'CIE_R5_SELECTED_ROUTE_RELATIONSHIP_PATH_NOT_OPEN:%',rid; end if;
    if not exists(select 1 from jsonb_array_elements(coalesce(p_path_provenance_json,'[]'::jsonb)) pp where pp->>'routeId'=rid and pp->>'pathState'='OPEN' and jsonb_array_length(coalesce(pp->'edgeIds','[]'::jsonb))>=2 and jsonb_array_length(coalesce(pp->'canonicalRelations','[]'::jsonb))=jsonb_array_length(coalesce(pp->'edgeIds','[]'::jsonb))) then raise exception 'CIE_R5_SELECTED_ROUTE_MULTI_HOP_PROVENANCE_REQUIRED:%',rid; end if;
  end loop;
  if not (p_selected_route_ids ? coalesce(p_strategy_json#>>'{primary,routeId}','')) then raise exception 'CIE_R5_PRIMARY_NOT_IN_SELECTED_FRONTIER'; end if;

  for path in select value from jsonb_array_elements(coalesce(p_path_provenance_json,'[]'::jsonb)) loop
    for rel in select value from jsonb_array_elements(coalesce(path->'canonicalRelations','[]'::jsonb)) loop
      if public.genesis_t8_relation_edge_class(coalesce(rel->>'relationType','')) is distinct from rel->>'edgeClass' or public.genesis_t8_relation_direction(coalesce(rel->>'relationType','')) is distinct from rel->>'direction' then raise exception 'CIE_R5_CANONICAL_RELATION_DEFINITION_MISMATCH'; end if;
      if coalesce(rel->>'sourceRelationshipId','') !~ '^route:' and coalesce(rel->>'sourceRelationshipId','') ~ '^[0-9a-fA-F-]{36}$' and not exists(select 1 from public.genesis_t8_canonical_relationship_assertions a where a.id=(rel->>'sourceRelationshipId')::uuid and a.organisation_id=o.organisation_id and a.campaign_id=o.campaign_id and a.company_id=o.company_id and a.authority_status='ACTIVE' and a.authority_state='OPEN') then raise exception 'CIE_R5_CANONICAL_RELATIONSHIP_SOURCE_NOT_ACTIVE'; end if;
    end loop;
  end loop;

  select * into prior from public.cie_r5_route_decisions where opportunity_id=o.id for update;
  changed:=prior.opportunity_id is not null and prior.authority_fingerprint is distinct from p_authority_fingerprint;
  if changed then
    update public.cie_r6_contact_decisions set authority_status='STALE',invalidated_at=now(),invalidation_reason='PARENT_R5_AUTHORITY_CHANGED',applied_at=null,updated_at=now() where opportunity_id=o.id and authority_status='ACTIVE';
    update public.opportunities set status='BUILDING',primary_contact_id=null,opportunity_score=null,scoring_version='cie-r5-fb5-authority-changed',updated_at=now() where id=o.id and status not in ('APPROVED','REJECTED','ENGAGED');
    insert into public.cie_authority_invalidation_events(opportunity_id,organisation_id,campaign_id,authority_layer,previous_fingerprint,next_fingerprint,reason,metadata_json)
      values(o.id,o.organisation_id,o.campaign_id,'R5',prior.authority_fingerprint,p_authority_fingerprint,'MATERIAL_RELATIONSHIP_GRAPH_AUTHORITY_CHANGED',jsonb_build_object('previousSelectedRoutes',prior.selected_route_ids,'nextSelectedRoutes',p_selected_route_ids));
  end if;

  insert into public.cie_r5_route_decisions(opportunity_id,organisation_id,campaign_id,parent_r4_authority_fingerprint,source_fingerprint,authority_fingerprint,selected_route_ids,route_states_json,relationship_states_json,path_provenance_json,strategy_json,graph_assessment_json,authority_status,invalidated_at,invalidation_reason,applied_at,producer_version)
  values(o.id,o.organisation_id,o.campaign_id,p_parent_r4_authority_fingerprint,p_source_fingerprint,p_authority_fingerprint,p_selected_route_ids,coalesce(p_route_states_json,'[]'::jsonb),coalesce(p_relationship_states_json,'[]'::jsonb),coalesce(p_path_provenance_json,'[]'::jsonb),p_strategy_json,p_graph_assessment_json,'ACTIVE',null,null,now(),'MR-T8-FB5-R5-1.0.0')
  on conflict(opportunity_id) do update set parent_r4_authority_fingerprint=excluded.parent_r4_authority_fingerprint,source_fingerprint=excluded.source_fingerprint,authority_fingerprint=excluded.authority_fingerprint,selected_route_ids=excluded.selected_route_ids,route_states_json=excluded.route_states_json,relationship_states_json=excluded.relationship_states_json,path_provenance_json=excluded.path_provenance_json,strategy_json=excluded.strategy_json,graph_assessment_json=excluded.graph_assessment_json,authority_status='ACTIVE',invalidated_at=null,invalidation_reason=null,applied_at=now(),producer_version='MR-T8-FB5-R5-1.0.0',updated_at=now();
end $$;


create or replace function public.get_cie_r5_route_authority_for_engagement_owned(
  p_strategy_id uuid,
  p_scheduler_run_id uuid,
  p_lease_token uuid
)
returns table(strategy_json jsonb,authority_fingerprint text,source_fingerprint text)
language plpgsql security definer set search_path=public as $$
declare s public.engagement_strategies%rowtype; r5 public.cie_r5_route_decisions%rowtype; r4 public.cie_r4_commercial_decisions%rowtype;
begin
  perform public.assert_active_pipeline_scheduler_run(p_scheduler_run_id);
  select * into s from public.engagement_strategies where id=p_strategy_id;
  if s.id is null then raise exception 'G5_ENGAGEMENT_MISSING'; end if;
  if s.state<>'STRATEGY_READY' then raise exception 'G5_ENGAGEMENT_STATE_CHANGED'; end if;
  if s.scheduler_run_id is distinct from p_scheduler_run_id or s.lease_token is distinct from p_lease_token
     or s.lease_expires_at is null or s.lease_expires_at<now() then raise exception 'G5_ENGAGEMENT_OWNERSHIP_LOST'; end if;

  select * into r5 from public.cie_r5_route_decisions where opportunity_id=s.opportunity_id;
  select * into r4 from public.cie_r4_commercial_decisions where opportunity_id=s.opportunity_id;
  if r5.opportunity_id is null or r5.authority_status<>'ACTIVE' or r5.producer_version<>'MR-T8-FB5-R5-1.0.0'
     or r5.authority_fingerprint !~ '^[0-9a-f]{64}$' then raise exception 'CIE_R5_PERSISTED_AUTHORITY_MISSING'; end if;
  if r4.opportunity_id is null or r4.authority_fingerprint is distinct from r5.parent_r4_authority_fingerprint
     or r4.producer_version<>'MR-T8-FB3-1.0.0' or not public.cie_r4_authority_current(s.opportunity_id) or not public.cie_r5_authority_current(s.opportunity_id) then raise exception 'CIE_R5_PARENT_R4_AUTHORITY_STALE'; end if;
  if coalesce(r5.strategy_json->>'promptVersion','')<>'cie-r5-route-authority/v3' then raise exception 'CIE_R5_PERSISTED_AUTHORITY_VERSION_INVALID'; end if;

  return query select r5.strategy_json,r5.authority_fingerprint,r5.source_fingerprint;
end $$;


create or replace function public.get_cie_r6_contact_authority_context(p_scheduler_run_id uuid,p_limit integer default 40)
returns table(opportunity_id uuid,reality_id text,commercial_routes jsonb,contacts jsonb,r4_authority_fingerprint text)
language plpgsql security definer set search_path=public as $$
begin
  if not exists(select 1 from public.pipeline_scheduler_lease where singleton=true and run_id=p_scheduler_run_id and lease_expires_at>now()) then raise exception 'PIPELINE_SCHEDULER_LEASE_NOT_HELD'; end if;
  return query
  select o.id,d.reality_id,
    coalesce((select jsonb_agg(jsonb_build_object(
      'id',r.id::text,'routeType',r.route_type,'label',r.label,'entryRole',r.entry_role,'department',r.department,'contactName',r.contact_name,'contactRole',r.contact_role,'targetRole',r.target_role,
      'channelType',r.channel_type,'channelValue',r.channel_value,'routeSemanticsVersion',r.route_semantics_version,
      'evidence',coalesce((select jsonb_agg(jsonb_build_object('evidenceType',e.evidence_type,'claim',e.claim,'sourceUrl',e.source_url,'excerpt',e.excerpt,'verified',e.verified,'excerptMatched',e.excerpt_matched) order by e.created_at,e.id) from public.commercial_route_evidence e where e.route_id=r.id),'[]'::jsonb)
    ) order by r.id) from public.commercial_routes r where r.organisation_id=o.organisation_id and r.campaign_id=o.campaign_id and r.company_id=o.company_id),'[]'::jsonb),
    coalesce((select jsonb_agg(jsonb_build_object(
      'id',c.id::text,'full_name',c.full_name,'role_title',c.role_title,'department',c.department,'email_address',c.email_address,'email_status',c.email_status,'linkedin_profile_url',c.linkedin_profile_url,'linkedin_status',c.linkedin_status,'review_status',c.review_status,
      'company_name',co.company_name,'company_domain',co.canonical_domain,
      'evidence',coalesce((select jsonb_agg(jsonb_build_object(
        'id',e.id::text,'evidenceType',e.evidence_type,'claim',e.claim,'sourceUrl',e.source_url,'sourceTitle',e.source_title,'excerpt',e.excerpt,
        'sourceKind',e.source_kind,'sourceDomain',e.source_domain,'excerptMatched',e.excerpt_matched,'retrievedAt',e.retrieved_at,
        'sourcePublishedAt',e.source_published_at,'truthPolarity',e.truth_polarity
      ) order by e.created_at,e.id) from public.contact_evidence e where e.contact_id=c.id),'[]'::jsonb)
    ) order by c.id)
      from public.contacts c join public.companies co on co.id=c.company_id
      where c.organisation_id=o.organisation_id and c.campaign_id=o.campaign_id and c.company_id=o.company_id),'[]'::jsonb),
    d.authority_fingerprint
  from public.opportunities o join public.cie_r4_commercial_decisions d on d.opportunity_id=o.id and d.disposition='COMMERCIAL_CANDIDATE'
    and d.producer_version='MR-T8-FB3-1.0.0' and d.production_id is not null and d.target_truth_semantics_version='MR-TI-2-TFR1' and d.authority_fingerprint ~ '^[0-9a-f]{64}$'
  left join public.cie_r6_contact_decisions cd on cd.opportunity_id=o.id
  left join public.cie_r5_route_decisions r5 on r5.opportunity_id=o.id
  where o.status='BUILDING' and public.cie_r4_authority_current(o.id) and (
    r5.opportunity_id is null or r5.authority_status='STALE' or r5.producer_version is distinct from 'MR-T8-FB5-R5-1.0.0' or r5.parent_r4_authority_fingerprint is distinct from d.authority_fingerprint
    or cd.opportunity_id is null or cd.authority_status='STALE' or cd.applied_at is null or cd.producer_version is distinct from 'MR-T8-FB6-R6-1.0.0'
    or cd.parent_r4_authority_fingerprint is distinct from d.authority_fingerprint or cd.parent_r5_authority_fingerprint is distinct from r5.authority_fingerprint
  ) order by o.created_at,o.id limit greatest(1,least(coalesce(p_limit,40),100));
end $$;


create or replace function public.persist_cie_r6_contact_decision(
  p_opportunity_id uuid,p_parent_r4_authority_fingerprint text,p_parent_r5_authority_fingerprint text,p_source_fingerprint text,
  p_primary_contact_id uuid,p_contact_truth_json jsonb,p_contact_truth_fingerprint text,p_next_revalidation_at timestamptz,
  p_contact_frontier_json jsonb,p_bindings_json jsonb,p_decision_json jsonb
) returns void language plpgsql security definer set search_path=public as $$
declare o public.opportunities%rowtype; r4 public.cie_r4_commercial_decisions%rowtype; r5 public.cie_r5_route_decisions%rowtype; b jsonb; t jsonb;
begin
  select * into o from public.opportunities where id=p_opportunity_id; if not found then raise exception 'CIE_R6_OPPORTUNITY_NOT_FOUND'; end if;
  select * into r4 from public.cie_r4_commercial_decisions where opportunity_id=o.id;
  select * into r5 from public.cie_r5_route_decisions where opportunity_id=o.id;
  if r5.opportunity_id is null or r5.authority_status<>'ACTIVE' or r5.producer_version<>'MR-T8-FB5-R5-1.0.0' or r5.authority_fingerprint is distinct from p_parent_r5_authority_fingerprint then raise exception 'CIE_R6_PARENT_R5_AUTHORITY_MISMATCH'; end if;
  if r4.producer_version<>'MR-T8-FB3-1.0.0' or r4.authority_fingerprint is distinct from p_parent_r4_authority_fingerprint or r5.parent_r4_authority_fingerprint is distinct from r4.authority_fingerprint then raise exception 'CIE_R6_PARENT_R4_AUTHORITY_MISMATCH'; end if;
  if not public.cie_r4_authority_current(o.id) or not public.cie_r5_authority_current(o.id) then raise exception 'CIE_R6_PARENT_AUTHORITY_NOT_CONSTITUTION_CURRENT'; end if;
  if p_parent_r4_authority_fingerprint !~ '^[0-9a-f]{64}$' or p_parent_r5_authority_fingerprint !~ '^[0-9a-f]{64}$' or p_source_fingerprint !~ '^[0-9a-f]{64}$' or p_contact_truth_fingerprint !~ '^[0-9a-f]{64}$' then raise exception 'CIE_R6_FINGERPRINT_INVALID'; end if;
  if p_source_fingerprint is distinct from p_contact_truth_fingerprint then raise exception 'CIE_R6_CONTACT_TRUTH_FINGERPRINT_MISMATCH'; end if;
  if jsonb_typeof(coalesce(p_contact_truth_json,'[]'::jsonb))<>'array' then raise exception 'CIE_R6_CONTACT_TRUTH_ARRAY_REQUIRED'; end if;
  if coalesce(p_decision_json->>'authorityMode','')<>'AUTHORITATIVE' or coalesce((p_decision_json->>'canUnlockOpportunity')::boolean,false) is not true then raise exception 'CIE_R6_NON_EXECUTABLE_DECISION'; end if;
  if p_primary_contact_id is not null and not exists(select 1 from public.contacts c where c.id=p_primary_contact_id and c.organisation_id=o.organisation_id and c.campaign_id=o.campaign_id and c.company_id=o.company_id) then raise exception 'CIE_R6_CONTACT_SCOPE_MISMATCH'; end if;
  if p_primary_contact_id is not null and not exists(select 1 from jsonb_array_elements(p_contact_truth_json) x where x->>'contactId'=p_primary_contact_id::text and x->>'semanticsVersion'='MR-T8-FB6-CONTACT-TRUTH-1.0.0' and coalesce((x->>'authorityReady')::boolean,false)=true) then raise exception 'CIE_R6_PRIMARY_CONTACT_NOT_TRUTH_QUALIFIED'; end if;
  for b in select value from jsonb_array_elements(coalesce(p_bindings_json,'[]'::jsonb)) loop if not (r5.selected_route_ids ? coalesce(b->>'routeId','')) then raise exception 'CIE_R6_BINDING_NOT_ON_R5_FRONTIER'; end if; end loop;

  insert into public.cie_r6_contact_decisions(opportunity_id,organisation_id,campaign_id,parent_r4_authority_fingerprint,parent_r5_authority_fingerprint,source_fingerprint,primary_contact_id,contact_frontier_json,bindings_json,decision_json,authority_status,invalidated_at,invalidation_reason,contact_truth_json,contact_truth_fingerprint,next_revalidation_at,producer_version)
  values(o.id,o.organisation_id,o.campaign_id,p_parent_r4_authority_fingerprint,p_parent_r5_authority_fingerprint,p_source_fingerprint,p_primary_contact_id,coalesce(p_contact_frontier_json,'[]'::jsonb),coalesce(p_bindings_json,'[]'::jsonb),p_decision_json,'ACTIVE',null,null,p_contact_truth_json,p_contact_truth_fingerprint,p_next_revalidation_at,'MR-T8-FB6-R6-1.0.0')
  on conflict(opportunity_id) do update set parent_r4_authority_fingerprint=excluded.parent_r4_authority_fingerprint,parent_r5_authority_fingerprint=excluded.parent_r5_authority_fingerprint,source_fingerprint=excluded.source_fingerprint,primary_contact_id=excluded.primary_contact_id,contact_frontier_json=excluded.contact_frontier_json,bindings_json=excluded.bindings_json,decision_json=excluded.decision_json,contact_truth_json=excluded.contact_truth_json,contact_truth_fingerprint=excluded.contact_truth_fingerprint,next_revalidation_at=excluded.next_revalidation_at,producer_version='MR-T8-FB6-R6-1.0.0',authority_status='ACTIVE',invalidated_at=null,invalidation_reason=null,applied_at=null,updated_at=now();

  for t in select value from jsonb_array_elements(p_contact_truth_json) loop
    if coalesce(t->>'contactId','') ~ '^[0-9a-fA-F-]{36}$' then
      insert into public.genesis_t8_contact_truth_snapshots(opportunity_id,organisation_id,campaign_id,company_id,contact_id,semantics_version,r5_authority_fingerprint,source_fingerprint,snapshot_json,authority_ready,next_revalidation_at)
      values(o.id,o.organisation_id,o.campaign_id,o.company_id,(t->>'contactId')::uuid,'MR-T8-FB6-CONTACT-TRUTH-1.0.0',p_parent_r5_authority_fingerprint,p_contact_truth_fingerprint,t,coalesce((t->>'authorityReady')::boolean,false),nullif(t->>'nextRevalidationAt','')::timestamptz);
    end if;
  end loop;
end $$;


create or replace function public.apply_cie_r6_contact_authority()
returns table(applied integer,ready integer,organisational integer) language plpgsql security definer set search_path=public as $$
declare r record; a integer:=0; rd integer:=0; org integer:=0;
begin
  for r in select d.*,r4.disposition from public.cie_r6_contact_decisions d
    join public.cie_r4_commercial_decisions r4 on r4.opportunity_id=d.opportunity_id and r4.producer_version='MR-T8-FB3-1.0.0' and r4.production_id is not null and r4.target_truth_semantics_version='MR-TI-2-TFR1'
    join public.cie_r5_route_decisions r5 on r5.opportunity_id=d.opportunity_id and r5.authority_status='ACTIVE' and r5.producer_version='MR-T8-FB5-R5-1.0.0'
    where d.applied_at is null and d.authority_status='ACTIVE' and public.cie_r4_authority_current(d.opportunity_id) and public.cie_r5_authority_current(d.opportunity_id) and d.producer_version='MR-T8-FB6-R6-1.0.0' and r4.disposition='COMMERCIAL_CANDIDATE'
      and d.contact_truth_fingerprint ~ '^[0-9a-f]{64}$' and (d.next_revalidation_at is null or d.next_revalidation_at>now())
      and d.parent_r4_authority_fingerprint=r4.authority_fingerprint and d.parent_r5_authority_fingerprint=r5.authority_fingerprint
    order by d.updated_at,d.opportunity_id for update of d skip locked
  loop
    update public.opportunities set primary_contact_id=r.primary_contact_id,status='READY',opportunity_score=null,scoring_version='cie-r6-fb6-contact-truth-authority',updated_at=now() where id=r.opportunity_id and status not in ('APPROVED','REJECTED','ENGAGED');
    update public.cie_r6_contact_decisions set applied_at=now(),updated_at=now() where opportunity_id=r.opportunity_id;
    a:=a+1;rd:=rd+1;if r.primary_contact_id is null then org:=org+1;end if;
  end loop; return query select a,rd,org;
end $$;


create or replace function public.get_cie_r7_research_context(p_scheduler_run_id uuid,p_limit integer default 100)
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
  where public.cie_r4_authority_current(o.id) and r4.disposition in ('RESEARCH_REQUIRED','COMMERCIAL_CANDIDATE') and r4.decision_json ? 'stability'
  order by o.created_at,o.id,q.created_at,q.id limit greatest(1,least(coalesce(p_limit,100),250));
end $$;


create or replace function public.replace_cie_r7_research_directives(p_opportunity_id uuid,p_reality_id text,p_r4_input_fingerprint text,p_directives_json jsonb)
returns void language plpgsql security definer set search_path=public as $$
declare d jsonb; rid uuid; r4 public.cie_r4_commercial_decisions%rowtype;
begin
  if p_r4_input_fingerprint !~ '^[0-9a-f]{64}$' then raise exception 'CIE_R7_R4_INPUT_FINGERPRINT_INVALID'; end if;
  select * into r4 from public.cie_r4_commercial_decisions where opportunity_id=p_opportunity_id;
  if not found or r4.producer_version<>'MR-T8-FB3-1.0.0' or r4.input_fingerprint is distinct from p_r4_input_fingerprint or r4.reality_id is distinct from p_reality_id
  then raise exception 'CIE_R7_R4_RESEARCH_BASIS_STALE'; end if;
  if not public.cie_r4_authority_current(p_opportunity_id) then raise exception 'CIE_R7_R4_NOT_CONSTITUTION_CURRENT'; end if;
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


create or replace function public.retire_stale_cie_r7_research_directives()
returns table(retired integer) language plpgsql security definer set search_path=public as $$
declare n integer;
begin
  update public.cie_r7_research_directives d set status='RETIRED',updated_at=now()
  where d.status='ACTIVE' and (
    not exists(select 1 from public.genesis_g8_discovery_repair_queue q where q.id=d.repair_id and q.status in ('QUEUED','CLAIMED'))
    or not exists(select 1 from public.cie_r4_commercial_decisions r4 where r4.opportunity_id=d.opportunity_id and r4.producer_version='MR-T8-FB3-1.0.0' and r4.input_fingerprint=d.r4_input_fingerprint)
    or not public.cie_r4_authority_current(d.opportunity_id)
  );
  get diagnostics n=row_count; return query select n;
end $$;


-- Build 8: categorical communication-quality authority (numeric scores are telemetry only).

-- Forensic Build 8 communication-quality constitution.
-- Old numeric-threshold review artefacts may remain as telemetry/history, but they
-- cannot remain executable. Pending/approved/queued strategies are sent back
-- through categorical v4 self-review and v2 diagnostic quality.
insert into public.g5_engagement_execution_holds(organisation_id,campaign_id,strategy_id,opportunity_id,reason_code,reason_message,metadata_json,last_checked_at)
select q.organisation_id,q.campaign_id,q.strategy_id,q.opportunity_id,
  'FB8_CATEGORICAL_QUALITY_REVALIDATION_REQUIRED',
  'A pre-Build8 unsent execution item was revoked so categorical communication-quality authority can be re-established.',
  jsonb_build_object('queueId',q.id,'previousStatus',q.status,'previousLastError',q.last_error),now()
from public.g5_engagement_execution_queue q
join public.engagement_strategies s on s.id=q.strategy_id
where q.status<>'SENT'
  and (coalesce(s.self_review_prompt_version,'')<>'g5-self-review/v4-fb8-categorical-quality'
       or coalesce(s.engagement_quality_policy_version,'')<>'g5-engagement-quality/fb8-categorical-v2')
on conflict(strategy_id,reason_code) do update set metadata_json=excluded.metadata_json,last_checked_at=now(),resolved_at=null;

delete from public.g5_engagement_execution_queue q
using public.engagement_strategies s
where s.id=q.strategy_id and q.status<>'SENT'
  and (coalesce(s.self_review_prompt_version,'')<>'g5-self-review/v4-fb8-categorical-quality'
       or coalesce(s.engagement_quality_policy_version,'')<>'g5-engagement-quality/fb8-categorical-v2');

update public.engagement_strategies
set previous_state=state,state='SELF_REVIEW',failure_stage=null,failure_reason=null,next_retry_at=null,
    self_review_json=null,self_review_schema_version=null,self_review_prompt_version=null,self_review_model=null,self_review_outcome=null,self_review_confidence=null,self_review_source_fingerprint=null,self_reviewed_at=null,
    engagement_quality_json=null,engagement_quality_schema_version=null,engagement_quality_policy_version=null,engagement_confidence=null,engagement_quality_source_fingerprint=null,engagement_quality_scored_at=null,
    autopilot_approved_at=null,autopilot_policy_version=null,autopilot_confidence_threshold=null,
    lease_token=null,lease_expires_at=null,claimed_at=null,scheduler_run_id=null,updated_at=now()
where state in ('READY_FOR_APPROVAL','APPROVED','QUEUED')
  and outreach_generation_json is not null and personalisation_safety_json is not null
  and (coalesce(self_review_prompt_version,'')<>'g5-self-review/v4-fb8-categorical-quality'
       or coalesce(engagement_quality_policy_version,'')<>'g5-engagement-quality/fb8-categorical-v2');
create or replace function public.claim_g5_self_review(p_scheduler_run_id uuid,p_lease_seconds integer default 300)
returns table(strategy_id uuid,lease_token uuid,opportunity_id uuid)
language plpgsql security definer set search_path=public as $$
declare v_id uuid; v_token uuid:=gen_random_uuid(); v_previous text;
begin
  perform public.assert_active_pipeline_scheduler_run(p_scheduler_run_id);
  select s.id,s.state into v_id,v_previous
  from public.engagement_strategies s
  join public.opportunities o on o.id=s.opportunity_id and o.status='APPROVED'
  join public.campaigns c on c.id=s.campaign_id and c.status not in ('PAUSED','ARCHIVED')
  where ((s.state='SELF_REVIEW') or (s.state='FAILED_RETRYABLE' and s.failure_stage='SELF_REVIEW' and coalesce(s.next_retry_at,now())<=now()))
    and s.outreach_generation_json is not null
    and s.personalisation_safety_json is not null
    and public.cie_r4_authority_current(s.opportunity_id)
    and public.cie_r5_authority_current(s.opportunity_id)
    and public.cie_r6_authority_current(s.opportunity_id)
    and (s.lease_expires_at is null or s.lease_expires_at<now())
  order by s.created_at
  for update of s skip locked limit 1;
  if v_id is null then return; end if;
  update public.engagement_strategies s set previous_state=v_previous,state='SELF_REVIEW',scheduler_run_id=p_scheduler_run_id,lease_token=v_token,claimed_at=now(),lease_expires_at=now()+make_interval(secs=>greatest(30,p_lease_seconds)),attempt_count=s.attempt_count+1,failure_stage=null,failure_reason=null,next_retry_at=null,updated_at=now() where s.id=v_id;
  insert into public.engagement_strategy_events(organisation_id,campaign_id,strategy_id,opportunity_id,scheduler_run_id,event_type,previous_state,next_state,lease_token,metadata_json)
  select organisation_id,campaign_id,id,opportunity_id,p_scheduler_run_id,'CLAIMED',v_previous,'SELF_REVIEW',v_token,jsonb_build_object('release','FORENSIC_BUILD8','qualityPolicy','categorical-v4','worker','SELF_REVIEW','rewriteCount',rewrite_count,'immutableG4',true) from public.engagement_strategies where id=v_id;
  return query select s.id,s.lease_token,s.opportunity_id from public.engagement_strategies s where s.id=v_id;
end $$;

create or replace function public.get_g5_self_review_context_owned(p_strategy_id uuid,p_scheduler_run_id uuid,p_lease_token uuid)
returns table(organisation_id uuid,campaign_id uuid,commercial_reasoning_json jsonb,channel_strategy_json jsonb,source_snapshot_json jsonb,personalisation_safety_json jsonb,outreach_generation_json jsonb,rewrite_count integer)
language plpgsql security definer set search_path=public as $$
declare v public.engagement_strategies%rowtype;
begin
  perform public.assert_active_pipeline_scheduler_run(p_scheduler_run_id); select * into v from public.engagement_strategies where id=p_strategy_id;
  if v.id is null then raise exception 'G5_ENGAGEMENT_MISSING'; end if; if v.state<>'SELF_REVIEW' then raise exception 'G5_ENGAGEMENT_STATE_CHANGED'; end if;
  if v.scheduler_run_id is distinct from p_scheduler_run_id or v.lease_token is distinct from p_lease_token or v.lease_expires_at is null or v.lease_expires_at<now() then raise exception 'G5_ENGAGEMENT_OWNERSHIP_LOST'; end if;
  if not public.cie_r4_authority_current(v.opportunity_id) or not public.cie_r5_authority_current(v.opportunity_id) or not public.cie_r6_authority_current(v.opportunity_id) then raise exception 'G5_SELF_REVIEW_AUTHORITY_NOT_CURRENT'; end if;
  if v.outreach_generation_json is null then raise exception 'G5_SELF_REVIEW_OUTREACH_MISSING'; end if; if v.personalisation_safety_json is null then raise exception 'G5_SELF_REVIEW_SAFETY_MISSING'; end if;
  return query select v.organisation_id,v.campaign_id,v.commercial_reasoning_json,coalesce(v.human_route_override_json,v.channel_strategy_json),v.commercial_reasoning_source_snapshot_json,v.personalisation_safety_json,v.outreach_generation_json,v.rewrite_count;
end $$;

create or replace function public.complete_g5_self_review_owned(
 p_strategy_id uuid,p_scheduler_run_id uuid,p_lease_token uuid,p_review_json jsonb,p_schema_version text,p_prompt_version text,p_model text,p_outcome text,p_confidence integer,p_source_fingerprint text)
returns public.engagement_strategies
language plpgsql security definer set search_path=public as $$
declare v public.engagement_strategies%rowtype; v_next text; v_event text;
begin
  perform public.assert_active_pipeline_scheduler_run(p_scheduler_run_id);
  select * into v from public.engagement_strategies where id=p_strategy_id for update;
  if v.id is null then raise exception 'G5_ENGAGEMENT_MISSING'; end if;
  if v.state<>'SELF_REVIEW' then raise exception 'G5_ENGAGEMENT_STATE_CHANGED'; end if;
  if v.scheduler_run_id is distinct from p_scheduler_run_id or v.lease_token is distinct from p_lease_token or v.lease_expires_at is null or v.lease_expires_at<now() then raise exception 'G5_ENGAGEMENT_OWNERSHIP_LOST'; end if;
  if p_outcome not in ('PASS','REWRITE','BLOCK') then raise exception 'G5_SELF_REVIEW_INVALID_OUTCOME'; end if;
  if p_confidence<0 or p_confidence>100 then raise exception 'G5_SELF_REVIEW_CONFIDENCE_TELEMETRY_INVALID'; end if;
  if p_prompt_version<>'g5-self-review/v4-fb8-categorical-quality' or coalesce(p_review_json->>'promptVersion','')<>'g5-self-review/v4-fb8-categorical-quality' then raise exception 'G5_SELF_REVIEW_FB8_POLICY_REQUIRED'; end if;
  if coalesce(p_review_json->>'outcome','')<>p_outcome then raise exception 'G5_SELF_REVIEW_OUTCOME_MISMATCH'; end if;
  if jsonb_typeof(coalesce(p_review_json->'unsupportedClaims','null'::jsonb))<>'array' or jsonb_typeof(coalesce(p_review_json->'blockedReasons','null'::jsonb))<>'array' then raise exception 'G5_SELF_REVIEW_FINDINGS_ARRAY_REQUIRED'; end if;
  if p_outcome='PASS' and (jsonb_array_length(p_review_json->'unsupportedClaims')<>0 or jsonb_array_length(p_review_json->'blockedReasons')<>0) then raise exception 'G5_SELF_REVIEW_PASS_HAS_UNSAFE_FINDINGS'; end if;
  if not public.cie_r4_authority_current(v.opportunity_id) or not public.cie_r5_authority_current(v.opportunity_id) or not public.cie_r6_authority_current(v.opportunity_id) then raise exception 'G5_SELF_REVIEW_AUTHORITY_NOT_CURRENT'; end if;
  insert into public.engagement_strategy_reviews(organisation_id,campaign_id,strategy_id,opportunity_id,scheduler_run_id,rewrite_number,outcome,review_json,schema_version,prompt_version,model,confidence,source_fingerprint)
  values(v.organisation_id,v.campaign_id,v.id,v.opportunity_id,p_scheduler_run_id,v.rewrite_count,p_outcome,p_review_json,p_schema_version,p_prompt_version,p_model,p_confidence,p_source_fingerprint);

  if p_outcome='PASS' then
    v_next:='READY_FOR_APPROVAL'; v_event:='SELF_REVIEW_PASS';
    update public.engagement_strategies set previous_state='SELF_REVIEW',state=v_next,self_review_json=p_review_json,self_review_schema_version=p_schema_version,self_review_prompt_version=p_prompt_version,self_review_model=p_model,self_review_outcome=p_outcome,self_review_confidence=p_confidence,self_review_source_fingerprint=p_source_fingerprint,self_reviewed_at=now(),outreach_rewrite_instruction_json=null,lease_token=null,lease_expires_at=null,claimed_at=null,scheduler_run_id=null,updated_at=now() where id=v.id returning * into v;
  elsif p_outcome='REWRITE' then
    if v.rewrite_count>=2 then raise exception 'G5_SELF_REVIEW_REWRITE_LIMIT_REQUIRES_BLOCK'; end if;
    v_next:='FAILED_RETRYABLE'; v_event:='SELF_REVIEW_REWRITE';
    update public.engagement_strategies set previous_state='SELF_REVIEW',state=v_next,failure_stage='OUTREACH_GENERATION',failure_reason='AI self review requested rewrite',next_retry_at=now(),rewrite_count=v.rewrite_count+1,self_review_json=p_review_json,self_review_schema_version=p_schema_version,self_review_prompt_version=p_prompt_version,self_review_model=p_model,self_review_outcome=p_outcome,self_review_confidence=p_confidence,self_review_source_fingerprint=p_source_fingerprint,self_reviewed_at=now(),outreach_rewrite_instruction_json=jsonb_build_object('review',p_review_json,'rewriteNumber',v.rewrite_count+1),outreach_generation_json=null,outreach_generation_schema_version=null,outreach_generation_prompt_version=null,outreach_generation_model=null,outreach_generation_confidence=null,outreach_generation_source_fingerprint=null,outreach_generated_at=null,lease_token=null,lease_expires_at=null,claimed_at=null,scheduler_run_id=null,updated_at=now() where id=v.id returning * into v;
  else
    v_next:='FAILED_TERMINAL'; v_event:='SELF_REVIEW_BLOCK';
    update public.engagement_strategies set previous_state='SELF_REVIEW',state=v_next,failure_stage='SELF_REVIEW',failure_reason='AI self review blocked outreach',next_retry_at=null,self_review_json=p_review_json,self_review_schema_version=p_schema_version,self_review_prompt_version=p_prompt_version,self_review_model=p_model,self_review_outcome=p_outcome,self_review_confidence=p_confidence,self_review_source_fingerprint=p_source_fingerprint,self_reviewed_at=now(),lease_token=null,lease_expires_at=null,claimed_at=null,scheduler_run_id=null,updated_at=now() where id=v.id returning * into v;
  end if;

  insert into public.engagement_strategy_events(organisation_id,campaign_id,strategy_id,opportunity_id,scheduler_run_id,event_type,previous_state,next_state,lease_token,metadata_json)
  values(v.organisation_id,v.campaign_id,v.id,v.opportunity_id,p_scheduler_run_id,v_event,'SELF_REVIEW',v_next,p_lease_token,jsonb_build_object('release','FORENSIC_BUILD8','qualityPolicy','categorical-v4','outcome',p_outcome,'confidenceTelemetry',p_confidence,'rewriteCount',v.rewrite_count,'immutableG4',true));
  insert into public.campaign_timeline(organisation_id,campaign_id,event_type,title,description,visibility,metadata_json)
  values(v.organisation_id,v.campaign_id,'G5_SELF_REVIEW_'||p_outcome,
    case p_outcome when 'PASS' then 'Outreach passed independent review' when 'REWRITE' then 'Outreach is being improved' else 'Outreach blocked by safety review' end,
    case p_outcome when 'PASS' then 'MarketRoute checked factual accuracy, evidence, route alignment and message quality. The outreach is ready for approval.' when 'REWRITE' then 'MarketRoute found issues in the draft and is automatically rewriting it before showing it for approval.' else 'MarketRoute found issues that should not progress to approval.' end,
    'CUSTOMER',jsonb_build_object('strategyId',v.id,'opportunityId',v.opportunity_id,'outcome',p_outcome,'rewriteCount',v.rewrite_count));
  return v;
end $$;

create or replace function public.claim_g5_engagement_quality(p_scheduler_run_id uuid,p_lease_seconds integer default 120)
returns table(strategy_id uuid,lease_token uuid,opportunity_id uuid)
language plpgsql security definer set search_path=public as $$
declare v_id uuid; v_token uuid:=gen_random_uuid();
begin
  perform public.assert_active_pipeline_scheduler_run(p_scheduler_run_id);
  select s.id into v_id
  from public.engagement_strategies s
  join public.opportunities o on o.id=s.opportunity_id and o.status='APPROVED'
  join public.campaigns c on c.id=s.campaign_id and c.status not in ('PAUSED','ARCHIVED')
  where (
    (s.state='READY_FOR_APPROVAL' and (s.engagement_quality_json is null or coalesce(s.engagement_quality_policy_version,'')<>'g5-engagement-quality/fb8-categorical-v2'))
    or (s.state='FAILED_RETRYABLE' and s.failure_stage='ENGAGEMENT_QUALITY' and coalesce(s.next_retry_at,now())<=now())
  )
    and s.self_review_outcome='PASS'
    and s.self_review_prompt_version='g5-self-review/v4-fb8-categorical-quality'
    and s.self_review_json is not null
    and s.channel_strategy_json is not null
    and s.personalisation_safety_json is not null
    and s.outreach_generation_json is not null
    and public.cie_r4_authority_current(s.opportunity_id)
    and public.cie_r5_authority_current(s.opportunity_id)
    and public.cie_r6_authority_current(s.opportunity_id)
    and (s.lease_expires_at is null or s.lease_expires_at<now())
  order by s.created_at
  for update of s skip locked limit 1;
  if v_id is null then return; end if;

  update public.engagement_strategies set
    previous_state=case when state='FAILED_RETRYABLE' then state else previous_state end,
    state='READY_FOR_APPROVAL',
    scheduler_run_id=p_scheduler_run_id,
    lease_token=v_token,
    claimed_at=now(),
    lease_expires_at=now()+make_interval(secs=>greatest(30,p_lease_seconds)),
    failure_stage=null,failure_reason=null,next_retry_at=null,
    updated_at=now()
  where id=v_id;

  return query select s.id,s.lease_token,s.opportunity_id from public.engagement_strategies s where s.id=v_id;
end $$;

create or replace function public.get_g5_engagement_quality_context_owned(p_strategy_id uuid,p_scheduler_run_id uuid,p_lease_token uuid)
returns table(self_review_json jsonb,self_review_outcome text,self_review_confidence integer,channel_strategy_json jsonb,personalisation_safety_json jsonb,rewrite_count integer)
language plpgsql security definer set search_path=public as $$
declare v public.engagement_strategies%rowtype;
begin
  perform public.assert_active_pipeline_scheduler_run(p_scheduler_run_id); select * into v from public.engagement_strategies where id=p_strategy_id;
  if v.id is null then raise exception 'G5_ENGAGEMENT_MISSING'; end if; if v.state<>'READY_FOR_APPROVAL' then raise exception 'G5_ENGAGEMENT_STATE_CHANGED'; end if;
  if v.scheduler_run_id is distinct from p_scheduler_run_id or v.lease_token is distinct from p_lease_token or v.lease_expires_at is null or v.lease_expires_at<now() then raise exception 'G5_ENGAGEMENT_OWNERSHIP_LOST'; end if;
  if not public.cie_r4_authority_current(v.opportunity_id) or not public.cie_r5_authority_current(v.opportunity_id) or not public.cie_r6_authority_current(v.opportunity_id) then raise exception 'G5_ENGAGEMENT_QUALITY_AUTHORITY_NOT_CURRENT'; end if;
  if v.self_review_prompt_version<>'g5-self-review/v4-fb8-categorical-quality' then raise exception 'G5_ENGAGEMENT_QUALITY_REQUIRES_FB8_CATEGORICAL_REVIEW'; end if;
  if v.self_review_outcome<>'PASS' or v.self_review_json is null or v.channel_strategy_json is null or v.personalisation_safety_json is null or v.outreach_generation_json is null then raise exception 'G5_ENGAGEMENT_QUALITY_CONTEXT_INVALID'; end if;
  return query select v.self_review_json,v.self_review_outcome,v.self_review_confidence,coalesce(v.human_route_override_json,v.channel_strategy_json),v.personalisation_safety_json,v.rewrite_count;
end $$;

create or replace function public.complete_g5_engagement_quality_owned(
  p_strategy_id uuid,p_scheduler_run_id uuid,p_lease_token uuid,p_quality_json jsonb,p_schema_version text,p_policy_version text,p_engagement_confidence integer,p_source_fingerprint text)
returns public.engagement_strategies
language plpgsql security definer set search_path=public as $$
declare v public.engagement_strategies%rowtype;
begin
  perform public.assert_active_pipeline_scheduler_run(p_scheduler_run_id);
  if p_engagement_confidence<0 or p_engagement_confidence>100 then raise exception 'G5_ENGAGEMENT_QUALITY_TELEMETRY_INVALID'; end if;
  if p_policy_version<>'g5-engagement-quality/fb8-categorical-v2' or coalesce(p_quality_json->>'policyVersion','')<>'g5-engagement-quality/fb8-categorical-v2' then raise exception 'G5_ENGAGEMENT_QUALITY_FB8_POLICY_REQUIRED'; end if;
  select * into v from public.engagement_strategies where id=p_strategy_id for update;
  if v.id is null then raise exception 'G5_ENGAGEMENT_MISSING'; end if;
  if v.state<>'READY_FOR_APPROVAL' then raise exception 'G5_ENGAGEMENT_STATE_CHANGED'; end if;
  if v.scheduler_run_id is distinct from p_scheduler_run_id or v.lease_token is distinct from p_lease_token or v.lease_expires_at is null or v.lease_expires_at<now() then raise exception 'G5_ENGAGEMENT_OWNERSHIP_LOST'; end if;
  if v.self_review_outcome<>'PASS' or v.self_review_prompt_version<>'g5-self-review/v4-fb8-categorical-quality' then raise exception 'G5_ENGAGEMENT_QUALITY_REQUIRES_FB8_CATEGORICAL_PASS'; end if;
  if not public.cie_r4_authority_current(v.opportunity_id) or not public.cie_r5_authority_current(v.opportunity_id) or not public.cie_r6_authority_current(v.opportunity_id) then raise exception 'G5_ENGAGEMENT_QUALITY_AUTHORITY_NOT_CURRENT'; end if;

  insert into public.engagement_quality_assessments(organisation_id,campaign_id,strategy_id,opportunity_id,scheduler_run_id,engagement_confidence,quality_json,schema_version,policy_version,source_fingerprint)
  values(v.organisation_id,v.campaign_id,v.id,v.opportunity_id,p_scheduler_run_id,p_engagement_confidence,p_quality_json,p_schema_version,p_policy_version,p_source_fingerprint);

  update public.engagement_strategies set
    engagement_quality_json=p_quality_json,
    engagement_quality_schema_version=p_schema_version,
    engagement_quality_policy_version=p_policy_version,
    engagement_confidence=p_engagement_confidence,
    engagement_quality_source_fingerprint=p_source_fingerprint,
    engagement_quality_scored_at=now(),
    lease_token=null,lease_expires_at=null,claimed_at=null,scheduler_run_id=null,updated_at=now()
  where id=v.id returning * into v;

  insert into public.engagement_strategy_events(organisation_id,campaign_id,strategy_id,opportunity_id,scheduler_run_id,event_type,previous_state,next_state,lease_token,metadata_json)
  values(v.organisation_id,v.campaign_id,v.id,v.opportunity_id,p_scheduler_run_id,'ENGAGEMENT_QUALITY_SCORED','READY_FOR_APPROVAL','READY_FOR_APPROVAL',p_lease_token,jsonb_build_object('release','FORENSIC_BUILD8','engagementConfidenceTelemetry',p_engagement_confidence,'policyVersion',p_policy_version,'immutableG4',true));
  return v;
end $$;

create or replace function public.review_g5_engagement_strategy(
  p_organisation_id uuid,
  p_user_id uuid,
  p_strategy_id uuid,
  p_action text,
  p_note text default null,
  p_edit_json jsonb default null
)
returns public.engagement_strategies
language plpgsql security definer set search_path=public as $$
declare
  v public.engagement_strategies%rowtype;
  v_channel text;
  v_content jsonb;
  v_body text;
  v_subject text;
  v_cta text;
  v_old_primary jsonb;
  v_new_primary jsonb;
  v_old_secondary jsonb;
  v_old_fallback jsonb;
begin
  if p_action not in ('APPROVE','EDIT','REJECT','TRY_SECONDARY_ROUTE') then
    raise exception 'G5_INVALID_HUMAN_REVIEW_ACTION';
  end if;
  if not exists (
    select 1 from public.organisation_memberships m
    where m.organisation_id=p_organisation_id and m.user_id=p_user_id and m.status='ACTIVE' and m.role<>'VIEWER'
  ) then raise exception 'G5_HUMAN_REVIEW_FORBIDDEN'; end if;

  select * into v from public.engagement_strategies
  where id=p_strategy_id and organisation_id=p_organisation_id for update;
  if v.id is null then raise exception 'G5_ENGAGEMENT_MISSING'; end if;
  if v.state not in ('READY_FOR_APPROVAL','APPROVED') then raise exception 'G5_ENGAGEMENT_NOT_APPROVABLE'; end if;
  if v.state='APPROVED' and p_action<>'APPROVE' then raise exception 'G5_ENGAGEMENT_ALREADY_APPROVED'; end if;
  if p_action='APPROVE' then
    if v.self_review_outcome<>'PASS' or v.self_review_prompt_version<>'g5-self-review/v4-fb8-categorical-quality'
       or v.engagement_quality_json is null or v.engagement_quality_policy_version<>'g5-engagement-quality/fb8-categorical-v2' then
      raise exception 'G5_FB8_CATEGORICAL_QUALITY_REQUIRED';
    end if;
    if not public.cie_r4_authority_current(v.opportunity_id) or not public.cie_r5_authority_current(v.opportunity_id) or not public.cie_r6_authority_current(v.opportunity_id) then
      raise exception 'G5_APPROVAL_AUTHORITY_NOT_CURRENT';
    end if;
    if v.state='APPROVED' then return v; end if;
    update public.engagement_strategies set
      previous_state='READY_FOR_APPROVAL', state='APPROVED',
      human_reviewed_at=now(), human_reviewed_by=p_user_id,
      human_review_note=nullif(trim(coalesce(p_note,'')),''), human_review_action='APPROVE',
      lease_token=null,lease_expires_at=null,claimed_at=null,scheduler_run_id=null,updated_at=now()
    where id=v.id returning * into v;

    insert into public.engagement_strategy_events(organisation_id,campaign_id,strategy_id,opportunity_id,event_type,previous_state,next_state,metadata_json)
    values(v.organisation_id,v.campaign_id,v.id,v.opportunity_id,'HUMAN_APPROVED','READY_FOR_APPROVAL','APPROVED',jsonb_build_object('release','FORENSIC_BUILD8','userId',p_user_id,'note',nullif(trim(coalesce(p_note,'')),''),'engagementConfidenceTelemetry',v.engagement_confidence,'queueActivated',false,'immutableG4',true));
    insert into public.campaign_timeline(organisation_id,campaign_id,event_type,title,description,visibility,metadata_json)
    values(v.organisation_id,v.campaign_id,'G5_ENGAGEMENT_APPROVED','Engagement approved','The first-touch strategy has been approved. Execution remains locked until the queue release is active.','CUSTOMER',jsonb_build_object('strategyId',v.id,'opportunityId',v.opportunity_id,'engagementConfidenceTelemetry',v.engagement_confidence,'queueActivated',false));
    return v;
  end if;

  if p_action='EDIT' then
    if p_edit_json is null or jsonb_typeof(p_edit_json)<>'object' then raise exception 'G5_EDIT_REQUIRED'; end if;
    v_channel:=v.outreach_generation_json->>'channel';
    v_body:=nullif(trim(coalesce(p_edit_json->>'body','')),'');
    v_subject:=nullif(trim(coalesce(p_edit_json->>'subject','')),'');
    v_cta:=nullif(trim(coalesce(p_edit_json->>'callToAction','')),'');
    if v_body is null or v_cta is null then raise exception 'G5_EDIT_INVALID'; end if;
    v_content:=coalesce(v.outreach_generation_json->'content','{}'::jsonb);
    if v_channel='EMAIL' then
      v_content:=jsonb_set(v_content,'{emailBody}',to_jsonb(v_body),true);
      v_content:=jsonb_set(v_content,'{subject}',case when v_subject is null then 'null'::jsonb else to_jsonb(v_subject) end,true);
    elsif v_channel='LINKEDIN' then
      v_content:=jsonb_set(v_content,'{linkedinMessage}',to_jsonb(v_body),true);
    elsif v_channel='SWITCHBOARD' then
      v_content:=jsonb_set(v_content,'{switchboardOpening}',to_jsonb(v_body),true);
    elsif v_channel='REFERRAL' then
      v_content:=jsonb_set(v_content,'{referralRequest}',to_jsonb(v_body),true);
    else raise exception 'G5_EDIT_CHANNEL_UNSUPPORTED'; end if;

    update public.engagement_strategies set
      previous_state='READY_FOR_APPROVAL', state='FAILED_RETRYABLE', failure_stage='SELF_REVIEW',
      failure_reason='Human edited outreach requires mandatory self review', next_retry_at=now(),
      outreach_generation_json=jsonb_set(jsonb_set(outreach_generation_json,'{content}',v_content,true),'{callToAction}',to_jsonb(v_cta),true),
      self_review_json=null,self_review_schema_version=null,self_review_prompt_version=null,self_review_model=null,self_review_outcome=null,self_review_confidence=null,self_review_source_fingerprint=null,self_reviewed_at=null,
      engagement_quality_json=null,engagement_quality_schema_version=null,engagement_quality_policy_version=null,engagement_confidence=null,engagement_quality_source_fingerprint=null,engagement_quality_scored_at=null,
      human_reviewed_at=now(),human_reviewed_by=p_user_id,human_review_note=nullif(trim(coalesce(p_note,'')),''),human_review_action='EDIT',human_edit_count=human_edit_count+1,
      lease_token=null,lease_expires_at=null,claimed_at=null,scheduler_run_id=null,updated_at=now()
    where id=v.id returning * into v;
    insert into public.engagement_strategy_events(organisation_id,campaign_id,strategy_id,opportunity_id,event_type,previous_state,next_state,metadata_json)
    values(v.organisation_id,v.campaign_id,v.id,v.opportunity_id,'HUMAN_EDITED','READY_FOR_APPROVAL','FAILED_RETRYABLE',jsonb_build_object('release','FORENSIC_BUILD8','userId',p_user_id,'nextWorker','SELF_REVIEW','mandatoryRecheck',true,'immutableG4',true));
    return v;
  end if;

  if p_action='TRY_SECONDARY_ROUTE' then
    v_old_primary:=v.channel_strategy_json->'primary';
    v_old_secondary:=v.channel_strategy_json->'secondary';
    v_old_fallback:=v.channel_strategy_json->'fallback';
    if v_old_secondary is null or v_old_secondary='null'::jsonb then raise exception 'G5_SECONDARY_ROUTE_UNAVAILABLE'; end if;
    v_new_primary:=v_old_secondary;
    update public.engagement_strategies set
      previous_state='READY_FOR_APPROVAL',state='FAILED_RETRYABLE',failure_stage='OUTREACH_GENERATION',failure_reason='Human requested secondary commercial route',next_retry_at=now(),
      human_route_override_json=jsonb_set(jsonb_set(channel_strategy_json,'{primary}',v_new_primary,true),'{secondary}',v_old_primary,true),
      outreach_generation_json=null,outreach_generation_schema_version=null,outreach_generation_prompt_version=null,outreach_generation_model=null,outreach_generation_confidence=null,outreach_generation_source_fingerprint=null,outreach_generated_at=null,outreach_rewrite_instruction_json=null,
      self_review_json=null,self_review_schema_version=null,self_review_prompt_version=null,self_review_model=null,self_review_outcome=null,self_review_confidence=null,self_review_source_fingerprint=null,self_reviewed_at=null,rewrite_count=0,
      engagement_quality_json=null,engagement_quality_schema_version=null,engagement_quality_policy_version=null,engagement_confidence=null,engagement_quality_source_fingerprint=null,engagement_quality_scored_at=null,
      human_reviewed_at=now(),human_reviewed_by=p_user_id,human_review_note=nullif(trim(coalesce(p_note,'')),''),human_review_action='TRY_SECONDARY_ROUTE',
      lease_token=null,lease_expires_at=null,claimed_at=null,scheduler_run_id=null,updated_at=now()
    where id=v.id returning * into v;
    insert into public.engagement_strategy_events(organisation_id,campaign_id,strategy_id,opportunity_id,event_type,previous_state,next_state,metadata_json)
    values(v.organisation_id,v.campaign_id,v.id,v.opportunity_id,'HUMAN_ROUTE_CHANGED','READY_FOR_APPROVAL','FAILED_RETRYABLE',jsonb_build_object('release','FORENSIC_BUILD8','userId',p_user_id,'previousPrimaryRouteId',v_old_primary->>'routeId','newPrimaryRouteId',v_new_primary->>'routeId','g4Rediscovery',false,'nextWorker','OUTREACH_GENERATION','immutableG4',true));
    return v;
  end if;

  update public.engagement_strategies set
    previous_state='READY_FOR_APPROVAL',state='FAILED_TERMINAL',failure_stage='HUMAN_REJECTED',failure_reason=coalesce(nullif(trim(coalesce(p_note,'')),''),'Human rejected engagement'),next_retry_at=null,
    human_reviewed_at=now(),human_reviewed_by=p_user_id,human_review_note=nullif(trim(coalesce(p_note,'')),''),human_review_action='REJECT',
    lease_token=null,lease_expires_at=null,claimed_at=null,scheduler_run_id=null,updated_at=now()
  where id=v.id returning * into v;
  insert into public.engagement_strategy_events(organisation_id,campaign_id,strategy_id,opportunity_id,event_type,previous_state,next_state,metadata_json)
  values(v.organisation_id,v.campaign_id,v.id,v.opportunity_id,'HUMAN_REJECTED','READY_FOR_APPROVAL','FAILED_TERMINAL',jsonb_build_object('release','FORENSIC_BUILD8','userId',p_user_id,'note',nullif(trim(coalesce(p_note,'')),''),'immutableG4',true));
  return v;
end $$;

create or replace function public.transition_g5_engagement_strategy(
  p_strategy_id uuid,p_scheduler_run_id uuid,p_lease_token uuid,p_expected_state text,p_next_state text,p_metadata jsonb default '{}'::jsonb)
returns public.engagement_strategies
language plpgsql security definer set search_path=public as $$
declare v public.engagement_strategies%rowtype; v_prev text;
begin
  perform public.assert_active_pipeline_scheduler_run(p_scheduler_run_id);
  select * into v from public.engagement_strategies where id=p_strategy_id for update;
  if v.id is null then raise exception 'G5_ENGAGEMENT_MISSING'; end if;
  if v.scheduler_run_id is distinct from p_scheduler_run_id or v.lease_token is distinct from p_lease_token or v.lease_expires_at is null or v.lease_expires_at<now() then raise exception 'G5_ENGAGEMENT_OWNERSHIP_LOST'; end if;
  if v.state<>p_expected_state then raise exception 'G5_ENGAGEMENT_STATE_CHANGED'; end if;
  if p_expected_state='READY_FOR_APPROVAL' and p_next_state='APPROVED' then raise exception 'G5_HUMAN_APPROVAL_REQUIRED'; end if;
  if (p_expected_state='APPROVED' and p_next_state='QUEUED') or (p_expected_state='QUEUED' and p_next_state='SENT') then
    if v.self_review_outcome<>'PASS' or v.self_review_prompt_version<>'g5-self-review/v4-fb8-categorical-quality' or v.engagement_quality_policy_version<>'g5-engagement-quality/fb8-categorical-v2' then raise exception 'G5_FB8_CATEGORICAL_QUALITY_REQUIRED'; end if;
    if not public.cie_r4_authority_current(v.opportunity_id) or not public.cie_r5_authority_current(v.opportunity_id) or not public.cie_r6_authority_current(v.opportunity_id) then raise exception 'G5_EXECUTION_AUTHORITY_NOT_CURRENT'; end if;
  end if;
  if not ((p_expected_state='REASONING' and p_next_state='STRATEGY_READY') or (p_expected_state='GENERATING' and p_next_state='SELF_REVIEW') or (p_expected_state='SELF_REVIEW' and p_next_state='READY_FOR_APPROVAL') or (p_expected_state='APPROVED' and p_next_state='QUEUED') or (p_expected_state='QUEUED' and p_next_state='SENT')) then raise exception 'G5_INVALID_STATE_TRANSITION'; end if;
  v_prev:=v.state;
  update public.engagement_strategies set previous_state=v_prev,state=p_next_state,lease_token=null,lease_expires_at=null,claimed_at=null,scheduler_run_id=null,updated_at=now(),completed_at=case when p_next_state='SENT' then now() else completed_at end where id=p_strategy_id returning * into v;
  insert into public.engagement_strategy_events(organisation_id,campaign_id,strategy_id,opportunity_id,scheduler_run_id,event_type,previous_state,next_state,lease_token,metadata_json) values(v.organisation_id,v.campaign_id,v.id,v.opportunity_id,p_scheduler_run_id,'TRANSITIONED',v_prev,p_next_state,p_lease_token,coalesce(p_metadata,'{}'::jsonb));
  return v;
end $$;


create or replace function public.run_g5_engagement_queue_builder_owned(p_scheduler_run_id uuid)
returns table(inspected integer,queued integer,held integer,already_queued integer)
language plpgsql security definer set search_path=public as $$
declare
  v public.engagement_strategies%rowtype; o public.opportunities%rowtype; ca public.campaigns%rowtype;
  r public.commercial_routes%rowtype; r4 public.cie_r4_commercial_decisions%rowtype; r5 public.cie_r5_route_decisions%rowtype; r6 public.cie_r6_contact_decisions%rowtype;
  ct public.contacts%rowtype; co public.companies%rowtype;
  v_channel text; v_expected_channel text; v_route_id uuid; v_address text; v_location text; v_tz record; v_scheduled timestamptz;
begin
  perform public.assert_active_pipeline_scheduler_run(p_scheduler_run_id);
  select * into v from public.engagement_strategies s
   where s.state='APPROVED' and s.engagement_quality_json is not null
     and s.self_review_outcome='PASS' and s.self_review_prompt_version='g5-self-review/v4-fb8-categorical-quality'
     and s.engagement_quality_policy_version='g5-engagement-quality/fb8-categorical-v2'
     and (s.human_review_action='APPROVE' or s.autopilot_approved_at is not null)
     and not exists(select 1 from public.g5_engagement_execution_queue q where q.strategy_id=s.id)
   order by s.updated_at for update skip locked limit 1;
  if v.id is null then return query select 0,0,0,0; return; end if;
  select null::text as timezone_name,null::text as source_name,null::text as confidence_name into v_tz;
  select * into o from public.opportunities where id=v.opportunity_id and organisation_id=v.organisation_id and campaign_id=v.campaign_id;
  select * into ca from public.campaigns where id=v.campaign_id and organisation_id=v.organisation_id;
  select * into r4 from public.cie_r4_commercial_decisions where opportunity_id=v.opportunity_id;
  select * into r5 from public.cie_r5_route_decisions where opportunity_id=v.opportunity_id;
  select * into r6 from public.cie_r6_contact_decisions where opportunity_id=v.opportunity_id;
  if o.id is null or o.status<>'APPROVED' or ca.id is null or ca.status in ('PAUSED','ARCHIVED')
     or not public.cie_r4_authority_current(v.opportunity_id) or not public.cie_r5_authority_current(v.opportunity_id) or not public.cie_r6_authority_current(v.opportunity_id)
     or r4.opportunity_id is null or r4.producer_version<>'MR-T8-FB3-1.0.0'
     or r5.opportunity_id is null or r5.authority_status<>'ACTIVE' or r5.producer_version<>'MR-T8-FB5-R5-1.0.0' or r5.parent_r4_authority_fingerprint is distinct from r4.authority_fingerprint
     or r6.opportunity_id is null or r6.authority_status<>'ACTIVE' or r6.parent_r5_authority_fingerprint is distinct from r5.authority_fingerprint or r6.applied_at is null
     or v.self_review_outcome<>'PASS' or coalesce(v.self_review_prompt_version,'')<>'g5-self-review/v4-fb8-categorical-quality'
     or coalesce(v.engagement_quality_policy_version,'')<>'g5-engagement-quality/fb8-categorical-v2'
     or coalesce(v.channel_strategy_prompt_version,'')<>'cie-r5-route-authority/v3'
     or coalesce(v.channel_strategy_source_fingerprint,'')<>'cie-r5-authority:'||coalesce(r5.authority_fingerprint,'') then
    insert into public.g5_engagement_execution_holds(organisation_id,campaign_id,strategy_id,opportunity_id,reason_code,reason_message,metadata_json,last_checked_at)
    values(v.organisation_id,v.campaign_id,v.id,v.opportunity_id,'CIE_AUTHORITY_NOT_EXECUTABLE','The approved engagement no longer has current R4/R5/R6 execution authority.',jsonb_build_object('r4Fingerprint',r4.authority_fingerprint,'r5Fingerprint',r5.authority_fingerprint,'r6ParentR5',r6.parent_r5_authority_fingerprint),now())
    on conflict(strategy_id,reason_code) do update set metadata_json=excluded.metadata_json,last_checked_at=now(),resolved_at=null;
    return query select 1,0,1,0; return;
  end if;
  begin v_route_id:=nullif(coalesce(v.human_route_override_json,v.channel_strategy_json)#>>'{primary,routeId}','')::uuid;
  exception when invalid_text_representation then v_route_id:=null; end;
  v_channel:=upper(coalesce(coalesce(v.human_route_override_json,v.channel_strategy_json)#>>'{primary,executionChannel}',''));
  select * into r from public.commercial_routes where id=v_route_id and organisation_id=v.organisation_id and campaign_id=v.campaign_id and company_id=o.company_id;
  v_expected_channel:=public.g5_execution_channel_for_route_type(r.channel_type);
  if r.id is null or not (r5.selected_route_ids ? coalesce(v_route_id::text,'')) or public.cie_r5_route_fact_state(r.id)<>'OPEN'
     or v_expected_channel is null or v_expected_channel<>v_channel or nullif(trim(coalesce(r.channel_value,'')),'') is null
     or not exists(select 1 from jsonb_array_elements(coalesce(r6.bindings_json,'[]'::jsonb)) b where b->>'routeId'=r.id::text) then
    insert into public.g5_engagement_execution_holds(organisation_id,campaign_id,strategy_id,opportunity_id,reason_code,reason_message,metadata_json,last_checked_at)
    values(v.organisation_id,v.campaign_id,v.id,v.opportunity_id,'ROUTE_NOT_CURRENT_CIE_R5_OPEN','The approved route is not on the current evidence-qualified R5 frontier bound by R6.',jsonb_build_object('routeId',v_route_id,'channel',v_channel,'r5Fingerprint',r5.authority_fingerprint),now())
    on conflict(strategy_id,reason_code) do update set metadata_json=excluded.metadata_json,last_checked_at=now(),resolved_at=null;
    return query select 1,0,1,0; return;
  end if;
  v_address:=trim(r.channel_value);
  select * into ct from public.contacts where id=o.primary_contact_id; select * into co from public.companies where id=o.company_id; v_location:=ct.location;
  if v_channel='EMAIL' then
    if v_address !~* '^[A-Z0-9._%+''-]+@[A-Z0-9.-]+\.[A-Z]{2,}$' then
      insert into public.g5_engagement_execution_holds(organisation_id,campaign_id,strategy_id,opportunity_id,reason_code,reason_message,metadata_json,last_checked_at)
      values(v.organisation_id,v.campaign_id,v.id,v.opportunity_id,'RECIPIENT_INVALID','The current CIE-R5 email route does not contain a valid recipient address.',jsonb_build_object('routeId',r.id),now())
      on conflict(strategy_id,reason_code) do update set metadata_json=excluded.metadata_json,last_checked_at=now(),resolved_at=null;
      return query select 1,0,1,0; return;
    end if;
    select * into v_tz from public.resolve_engagement_timezone(v_location,co.country) limit 1;
    if v_tz.timezone_name is null then
      insert into public.g5_engagement_execution_holds(organisation_id,campaign_id,strategy_id,opportunity_id,reason_code,reason_message,metadata_json,last_checked_at)
      values(v.organisation_id,v.campaign_id,v.id,v.opportunity_id,'TIMEZONE_UNCERTAIN','Recipient timezone cannot be established with sufficient confidence; MarketRoute will not guess.',jsonb_build_object('contactLocation',v_location,'companyCountry',co.country),now())
      on conflict(strategy_id,reason_code) do update set metadata_json=excluded.metadata_json,last_checked_at=now(),resolved_at=null;
      return query select 1,0,1,0; return;
    end if;
    v_scheduled:=public.next_recipient_send_time(v_tz.timezone_name,now());
    insert into public.g5_engagement_execution_queue(organisation_id,campaign_id,strategy_id,opportunity_id,route_id,channel_type,recipient_address,recipient_timezone,timezone_source,timezone_confidence,scheduled_for,status)
    values(v.organisation_id,v.campaign_id,v.id,v.opportunity_id,r.id,v_channel,v_address,v_tz.timezone_name,v_tz.source_name,v_tz.confidence_name,v_scheduled,'QUEUED');
  else
    insert into public.g5_engagement_execution_queue(organisation_id,campaign_id,strategy_id,opportunity_id,route_id,channel_type,recipient_address,status)
    values(v.organisation_id,v.campaign_id,v.id,v.opportunity_id,r.id,v_channel,v_address,'MANUAL_ACTION_REQUIRED');
  end if;
  update public.engagement_strategies set previous_state='APPROVED',state='QUEUED',updated_at=now() where id=v.id and state='APPROVED';
  update public.g5_engagement_execution_holds set resolved_at=now(),last_checked_at=now() where strategy_id=v.id and resolved_at is null;
  insert into public.engagement_strategy_events(organisation_id,campaign_id,strategy_id,opportunity_id,scheduler_run_id,event_type,previous_state,next_state,metadata_json)
  values(v.organisation_id,v.campaign_id,v.id,v.opportunity_id,p_scheduler_run_id,'TRANSITIONED','APPROVED','QUEUED',jsonb_build_object('release','FORENSIC_BUILD5','routeId',r.id,'channel',v_channel,'r5Fingerprint',r5.authority_fingerprint,'r6SourceFingerprint',r6.source_fingerprint,'transportRequired',v_channel='EMAIL'));
  return query select 1,1,0,0;
end $$;


create or replace function public.claim_next_g5_email_execution_owned(p_scheduler_run_id uuid,p_lease_seconds integer default 120)
returns table(queue_id uuid,strategy_id uuid,lease_token uuid,organisation_id uuid,campaign_id uuid,recipient_address text,recipient_timezone text,subject text,body text)
language plpgsql security definer set search_path=public as $$
declare q public.g5_engagement_execution_queue%rowtype; s public.engagement_strategies%rowtype; r5 public.cie_r5_route_decisions%rowtype; r6 public.cie_r6_contact_decisions%rowtype; tok uuid:=gen_random_uuid(); local_now timestamp;
begin
  perform public.assert_active_pipeline_scheduler_run(p_scheduler_run_id);
  select x.* into q from public.g5_engagement_execution_queue x join public.campaigns c on c.id=x.campaign_id and c.status not in ('PAUSED','ARCHIVED')
   where x.channel_type='EMAIL' and x.status in ('QUEUED','FAILED_RETRYABLE') and coalesce(x.next_retry_at,x.scheduled_for,now())<=now()
     and (x.lease_expires_at is null or x.lease_expires_at<now()) order by coalesce(x.next_retry_at,x.scheduled_for,x.created_at),x.created_at for update of x skip locked limit 1;
  if q.id is null then return; end if;
  select * into s from public.engagement_strategies where id=q.strategy_id and state='QUEUED';
  select * into r5 from public.cie_r5_route_decisions where opportunity_id=q.opportunity_id;
  select * into r6 from public.cie_r6_contact_decisions where opportunity_id=q.opportunity_id;
  if s.id is null or s.outreach_generation_json is null
     or s.self_review_outcome<>'PASS' or coalesce(s.self_review_prompt_version,'')<>'g5-self-review/v4-fb8-categorical-quality'
     or coalesce(s.engagement_quality_policy_version,'')<>'g5-engagement-quality/fb8-categorical-v2'
     or not public.cie_r4_authority_current(q.opportunity_id) or not public.cie_r5_authority_current(q.opportunity_id) or not public.cie_r6_authority_current(q.opportunity_id)
     or r5.opportunity_id is null or r5.authority_status<>'ACTIVE' or r5.producer_version<>'MR-T8-FB5-R5-1.0.0'
     or r6.opportunity_id is null or r6.authority_status<>'ACTIVE' or r6.parent_r5_authority_fingerprint is distinct from r5.authority_fingerprint or r6.applied_at is null
     or not (r5.selected_route_ids ? q.route_id::text) or public.cie_r5_route_fact_state(q.route_id)<>'OPEN'
     or coalesce(s.channel_strategy_source_fingerprint,'')<>'cie-r5-authority:'||r5.authority_fingerprint then
    update public.g5_engagement_execution_queue set status='FAILED_TERMINAL',last_error='CIE_ROUTE_AUTHORITY_STALE_BEFORE_SEND',lease_token=null,lease_expires_at=null,claimed_at=null,scheduler_run_id=null,updated_at=now() where id=q.id;
    insert into public.g5_engagement_execution_holds(organisation_id,campaign_id,strategy_id,opportunity_id,reason_code,reason_message,metadata_json,last_checked_at)
    values(q.organisation_id,q.campaign_id,q.strategy_id,q.opportunity_id,'CIE_AUTHORITY_STALE_BEFORE_SEND','The queued engagement was blocked because current R5/R6 authority could not be proven at send time.',jsonb_build_object('queueId',q.id,'routeId',q.route_id,'r5Fingerprint',r5.authority_fingerprint),now())
    on conflict(strategy_id,reason_code) do update set metadata_json=excluded.metadata_json,last_checked_at=now(),resolved_at=null;
    return;
  end if;
  local_now:=timezone(q.recipient_timezone,now());
  if local_now::time < time '08:00' or local_now::time >= time '18:00' then update public.g5_engagement_execution_queue set scheduled_for=public.next_recipient_send_time(q.recipient_timezone,now()),updated_at=now() where id=q.id; return; end if;
  update public.g5_engagement_execution_queue set status='SENDING',scheduler_run_id=p_scheduler_run_id,lease_token=tok,claimed_at=now(),lease_expires_at=now()+make_interval(secs=>greatest(30,p_lease_seconds)),attempt_count=attempt_count+1,updated_at=now() where id=q.id;
  return query select q.id,q.strategy_id,tok,q.organisation_id,q.campaign_id,q.recipient_address,q.recipient_timezone,
    nullif(s.outreach_generation_json#>>'{content,subject}',''),nullif(s.outreach_generation_json#>>'{content,emailBody}','');
end $$;


create or replace function public.run_g5_autopilot_approval_owned(p_scheduler_run_id uuid)
returns table(inspected integer,approved integer,held integer,reason text,strategy_id uuid,engagement_confidence integer)
language plpgsql security definer set search_path=public as $$
declare s public.engagement_strategies%rowtype; o public.opportunities%rowtype; c public.campaigns%rowtype; r public.commercial_routes%rowtype;
  r4 public.cie_r4_commercial_decisions%rowtype; r5 public.cie_r5_route_decisions%rowtype; r6 public.cie_r6_contact_decisions%rowtype;
  v_route_id uuid; v_channel text; v_expected_channel text;
begin
  perform public.assert_active_pipeline_scheduler_run(p_scheduler_run_id);
  select x.* into s from public.engagement_strategies x join public.campaigns ca on ca.id=x.campaign_id and ca.organisation_id=x.organisation_id
  where x.state='READY_FOR_APPROVAL' and lower(coalesce(ca.automation_mode,''))='autopilot' and ca.status not in ('PAUSED','ARCHIVED') and x.self_review_outcome='PASS'
    and x.self_review_prompt_version='g5-self-review/v4-fb8-categorical-quality'
    and x.engagement_quality_policy_version='g5-engagement-quality/fb8-categorical-v2'
    and x.self_review_json is not null and x.personalisation_safety_json is not null and x.engagement_quality_json is not null and x.outreach_generation_json is not null
    and x.channel_strategy_json is not null and x.autopilot_approved_at is null and (x.lease_expires_at is null or x.lease_expires_at<now())
  order by x.updated_at,x.created_at for update of x skip locked limit 1;
  if s.id is null then return query select 0,0,0,null::text,null::uuid,null::integer; return; end if;
  select * into o from public.opportunities where id=s.opportunity_id and organisation_id=s.organisation_id and campaign_id=s.campaign_id;
  select * into c from public.campaigns where id=s.campaign_id and organisation_id=s.organisation_id;
  select * into r4 from public.cie_r4_commercial_decisions where opportunity_id=s.opportunity_id and disposition='COMMERCIAL_CANDIDATE' and authority_mode='AUTHORITATIVE';
  select * into r5 from public.cie_r5_route_decisions where opportunity_id=s.opportunity_id and authority_status='ACTIVE' and authority_mode='AUTHORITATIVE' and producer_version='MR-T8-FB5-R5-1.0.0';
  select * into r6 from public.cie_r6_contact_decisions where opportunity_id=s.opportunity_id and applied_at is not null and authority_status='ACTIVE' and authority_mode='AUTHORITATIVE';
  if o.id is null or o.status<>'APPROVED' or c.id is null
    or not public.cie_r4_authority_current(s.opportunity_id) or not public.cie_r5_authority_current(s.opportunity_id) or not public.cie_r6_authority_current(s.opportunity_id)
    or r4.opportunity_id is null or r5.opportunity_id is null or r6.opportunity_id is null
    or r5.parent_r4_authority_fingerprint is distinct from r4.authority_fingerprint or r6.parent_r5_authority_fingerprint is distinct from r5.authority_fingerprint then
    return query select 1,0,1,'CIE_AUTHORITY_NOT_EXECUTABLE',s.id,s.engagement_confidence; return;
  end if;
  if coalesce(s.channel_strategy_json->>'promptVersion','')<>'cie-r5-route-authority/v3' then return query select 1,0,1,'ROUTE_NOT_CIE_R5_V3_AUTHORISED',s.id,s.engagement_confidence; return; end if;
  begin v_route_id:=nullif(coalesce(s.human_route_override_json,s.channel_strategy_json)#>>'{primary,routeId}','')::uuid;
  exception when invalid_text_representation then return query select 1,0,1,'ROUTE_ID_INVALID',s.id,s.engagement_confidence; return; end;
  v_channel:=upper(coalesce(coalesce(s.human_route_override_json,s.channel_strategy_json)#>>'{primary,executionChannel}',''));
  select * into r from public.commercial_routes where id=v_route_id and organisation_id=s.organisation_id and campaign_id=s.campaign_id and company_id=o.company_id;
  v_expected_channel:=public.g5_execution_channel_for_route_type(r.channel_type);
  if r.id is null or not (r5.selected_route_ids ? r.id::text) or public.cie_r5_route_fact_state(r.id)<>'OPEN'
    or not exists(select 1 from jsonb_array_elements(coalesce(r6.bindings_json,'[]'::jsonb)) b where b->>'routeId'=r.id::text)
    or v_expected_channel is null or v_expected_channel<>v_channel or nullif(trim(coalesce(r.channel_value,'')),'') is null then
    return query select 1,0,1,'ROUTE_NOT_CURRENT_CIE_R5_OPEN',s.id,s.engagement_confidence; return;
  end if;
  update public.engagement_strategies set previous_state='READY_FOR_APPROVAL',state='APPROVED',autopilot_approved_at=now(),autopilot_policy_version='cie-r5-fb5-relationship-graph-lineage/v1',
    autopilot_confidence_threshold=null,lease_token=null,lease_expires_at=null,claimed_at=null,scheduler_run_id=null,updated_at=now()
  where id=s.id and state='READY_FOR_APPROVAL' returning * into s;
  if s.id is null then return query select 1,0,1,'STATE_CHANGED',null::uuid,null::integer; return; end if;
  insert into public.engagement_strategy_events(organisation_id,campaign_id,strategy_id,opportunity_id,scheduler_run_id,event_type,previous_state,next_state,metadata_json)
  values(s.organisation_id,s.campaign_id,s.id,s.opportunity_id,p_scheduler_run_id,'AUTO_APPROVED','READY_FOR_APPROVAL','APPROVED',
    jsonb_build_object('release','FORENSIC_BUILD8','policyVersion','cie-r5-fb5-relationship-graph-lineage/v1','qualityPolicyVersion','g5-engagement-quality/fb8-categorical-v2','selfReviewPromptVersion','g5-self-review/v4-fb8-categorical-quality','engagementConfidenceTelemetry',s.engagement_confidence,'routeId',r.id,'channel',v_channel,'r4Fingerprint',r4.authority_fingerprint,'r5Fingerprint',r5.authority_fingerprint,'r6SourceFingerprint',r6.source_fingerprint,'selfReviewOutcome','PASS'));
  return query select 1,1,0,'APPROVED',s.id,s.engagement_confidence;
end $$;


-- Rebuild Build-7 presentation views as Build-8 constitutional views.
drop view if exists public.cie_authoritative_opportunity_detail_read;
drop view if exists public.cie_authoritative_opportunity_read;
drop view if exists public.cie_current_company_truth_read;

-- MarketRoute Forensic Build 7 — Authoritative Read Model + Founder Command Centre
-- Read-only presentation architecture. Builds 1–6 remain the sole reasoning authority.
-- No historical opportunity/contact score or verification field may create readiness here.

create view public.cie_current_company_truth_read with (security_invoker=true) as
select distinct on (s.entity_id)
  s.entity_id,
  e.display_name,
  e.canonical_key,
  s.id as truth_snapshot_id,
  s.truth_semantics_version,
  s.truth_index,
  s.coverage,
  s.evidence_sufficiency,
  s.review_state,
  s.probability_state,
  s.calibrated_probability_coverage,
  s.result_json,
  s.calculated_at
from public.genesis_g8_truth_v2_snapshots s
join public.genesis_g8_intelligence_entities e on e.id=s.entity_id
where e.entity_type='company'
  and e.status='ACTIVE'
  and s.truth_semantics_version='MR-TI-2-TFR1'
order by s.entity_id,s.calculated_at desc,s.id desc;

revoke all on public.cie_current_company_truth_read from public,anon,authenticated;
grant select on public.cie_current_company_truth_read to service_role;

comment on view public.cie_current_company_truth_read is
'Build 8 current-company Truth read model. Only MR-TI-2-TFR1 snapshots are exposed; evidence_sufficiency is not probability/confidence.';

create view public.cie_authoritative_opportunity_read with (security_invoker=true) as
with base as (
  select
    o.id,o.organisation_id,o.campaign_id,o.company_id,o.status as workflow_status,o.rank,
    o.review_note,o.reviewed_at,o.reviewed_by,o.created_at,o.updated_at,
    ca.name as campaign_name,
    co.company_name,co.website_url as company_website_url,co.industry as company_industry,co.country as company_country,co.summary as company_summary,
    (select count(*) from public.company_evidence ce where ce.company_id=o.company_id) as company_evidence_count,
    r4.reality_id as r4_reality_id,r4.reality_state as r4_reality_state,r4.disposition as r4_disposition,
    r4.input_fingerprint as r4_input_fingerprint,r4.authority_fingerprint as r4_authority_fingerprint,
    r4.seller_context_fingerprint as r4_seller_context_fingerprint,r4.constraint_fingerprint as r4_constraint_fingerprint,
    r4.boundary_constitution_version as r4_boundary_constitution_version,r4.boundary_completeness_json as r4_boundary_completeness_json,
    r4.target_truth_entity_id,r4.target_truth_snapshot_id,r4.target_truth_semantics_version,
    r4.producer_version as r4_producer_version,r4.production_id as r4_production_id,
    r4.decision_json as r4_decision_json,r4.applied_at as r4_applied_at,r4.updated_at as r4_updated_at,
    r4.last_validated_at as r4_last_validated_at,r4.next_validation_at as r4_next_validation_at,r4.last_invalidation_reason as r4_last_invalidation_reason,
    r5.authority_status as r5_authority_status,r5.source_fingerprint as r5_source_fingerprint,r5.authority_fingerprint as r5_authority_fingerprint,
    r5.parent_r4_authority_fingerprint as r5_parent_r4_authority_fingerprint,r5.producer_version as r5_producer_version,
    r5.selected_route_ids as r5_selected_route_ids,r5.route_states_json as r5_route_states_json,r5.strategy_json as r5_strategy_json,r5.graph_assessment_json as r5_graph_assessment_json,
    r5.invalidation_reason as r5_invalidation_reason,r5.invalidated_at as r5_invalidated_at,r5.applied_at as r5_applied_at,r5.updated_at as r5_updated_at,
    r6.authority_status as r6_authority_status,r6.source_fingerprint as r6_source_fingerprint,r6.contact_truth_fingerprint as r6_contact_truth_fingerprint,
    r6.parent_r4_authority_fingerprint as r6_parent_r4_authority_fingerprint,r6.parent_r5_authority_fingerprint as r6_parent_r5_authority_fingerprint,
    r6.producer_version as r6_producer_version,r6.primary_contact_id as r6_primary_contact_id,r6.contact_frontier_json as r6_contact_frontier_json,
    r6.bindings_json as r6_bindings_json,r6.decision_json as r6_decision_json,r6.contact_truth_json as r6_contact_truth_json,
    r6.next_revalidation_at as r6_next_revalidation_at,r6.invalidation_reason as r6_invalidation_reason,r6.invalidated_at as r6_invalidated_at,
    r6.applied_at as r6_applied_at,r6.updated_at as r6_updated_at,
    ts.truth_index as authority_truth_index,ts.coverage as authority_truth_coverage,ts.evidence_sufficiency as authority_evidence_sufficiency,
    ts.review_state as authority_truth_review_state,ts.probability_state as authority_probability_state,ts.calculated_at as authority_truth_calculated_at,
    rr.commercial_route_id,rr.commercial_route_type,rr.commercial_route_label,rr.commercial_route_entry_role,rr.commercial_route_target_role,
    rr.commercial_route_department,rr.commercial_route_contact_name,rr.commercial_route_contact_role,rr.commercial_route_channel_type,
    rr.commercial_route_channel_value,rr.commercial_route_rationale,rr.commercial_route_next_step,rr.commercial_route_count,
    rr.commercial_route_evidence_count,rr.commercial_routes,rr.commercial_route_evidence,
    ct.full_name as r6_contact_name,ct.role_title as r6_contact_role,ct.department as r6_contact_department,ct.location as r6_contact_location,
    ct.email_address as r6_contact_email,ct.linkedin_profile_url as r6_contact_linkedin_url,
    coalesce((select count(*) from public.contact_evidence cte where cte.contact_id=r6.primary_contact_id),0) as current_contact_evidence_count,
    coalesce((select count(*) from public.cie_r7_research_directives rd where rd.opportunity_id=o.id and rd.status='ACTIVE'),0) as active_research_count,
    coalesce((select jsonb_agg(jsonb_build_object('claimKey',rd.claim_key,'impactClass',rd.impact_class,'orderIndex',rd.order_index) order by rd.impact_precedence desc,rd.order_index,rd.claim_key)
      from public.cie_r7_research_directives rd where rd.opportunity_id=o.id and rd.status='ACTIVE'),'[]'::jsonb) as active_research_json,
    inv.authority_layer as latest_invalidation_layer,inv.reason as latest_invalidation_reason,inv.created_at as latest_invalidation_at
  from public.opportunities o
  join public.campaigns ca on ca.id=o.campaign_id and ca.organisation_id=o.organisation_id
  join public.companies co on co.id=o.company_id and co.campaign_id=o.campaign_id and co.organisation_id=o.organisation_id
  left join public.cie_r4_commercial_decisions r4 on r4.opportunity_id=o.id
  left join public.cie_r5_route_decisions r5 on r5.opportunity_id=o.id
  left join public.cie_r6_contact_decisions r6 on r6.opportunity_id=o.id
  left join public.genesis_g8_truth_v2_snapshots ts on ts.id=r4.target_truth_snapshot_id and ts.entity_id=r4.target_truth_entity_id and ts.truth_semantics_version='MR-TI-2-TFR1'
  left join public.cie_r5_route_authority_read rr on rr.opportunity_id=o.id
  left join public.contacts ct on ct.id=r6.primary_contact_id and ct.organisation_id=o.organisation_id and ct.campaign_id=o.campaign_id and ct.company_id=o.company_id
  left join lateral (
    select ev.authority_layer,ev.reason,ev.created_at
    from public.cie_authority_invalidation_events ev
    where ev.opportunity_id=o.id
    order by ev.created_at desc,ev.id desc
    limit 1
  ) inv on true
), flags as (
  select b.*,
    public.cie_r4_authority_current(b.id) as r4_current,
    public.cie_r5_authority_current(b.id) as r5_current,
    public.cie_r6_authority_current(b.id) as r6_current
  from base b
), classified as (
  select f.*,
    case
      when f.r4_reality_id is null then 'AWAITING_COMMERCIAL_REALITY'
      when not f.r4_current then 'COMMERCIAL_AUTHORITY_STALE'
      when f.r4_disposition='REJECT' then 'REJECTED'
      when f.r4_disposition='HOLD_TEMPORAL' then 'TEMPORAL_HOLD'
      when f.r4_disposition='RESEARCH_REQUIRED' then 'RESEARCH_REQUIRED'
      when f.r4_disposition='COMMERCIAL_CANDIDATE' and f.r5_authority_status='STALE' then 'ROUTE_STALE'
      when f.r4_disposition='COMMERCIAL_CANDIDATE' and not f.r5_current then 'ROUTE_UNRESOLVED'
      when f.r4_disposition='COMMERCIAL_CANDIDATE' and f.r6_authority_status='STALE' then 'CONTACT_STALE'
      when f.r4_disposition='COMMERCIAL_CANDIDATE' and not f.r6_current then 'CONTACT_UNRESOLVED'
      when f.r4_disposition='COMMERCIAL_CANDIDATE' and f.r6_current then 'READY'
      else 'COMMERCIAL_AUTHORITY_STALE'
    end as authority_state
  from flags f
)
select
  c.id,c.organisation_id,c.campaign_id,c.company_id,
  case when c.r6_current then c.r6_primary_contact_id else null end as primary_contact_id,
  c.workflow_status as status,
  null::integer as opportunity_score,null::integer as company_fit,null::integer as operational_fit,null::integer as buying_authority,
  null::integer as contactability,null::integer as route_quality,null::integer as route_confidence,null::text as recommended_entry_strategy,
  null::integer as commercial_value,null::integer as evidence_quality,null::integer as urgency,
  null::text as buying_reason,null::text as operational_pain,
  case c.authority_state
    when 'READY' then 'Review the current CIE-authorised commercial case and execution path.'
    when 'RESEARCH_REQUIRED' then 'Continue decision-critical research before review.'
    when 'TEMPORAL_HOLD' then 'Wait for the temporal constraint to resolve, then revalidate.'
    when 'REJECTED' then 'Do not prioritise this commercial reality under current evidence.'
    when 'ROUTE_STALE' then 'Revalidate the commercial route before engagement.'
    when 'CONTACT_STALE' then 'Revalidate current contact authority before engagement.'
    when 'ROUTE_UNRESOLVED' then 'Continue relationship and route research.'
    when 'CONTACT_UNRESOLVED' then 'Resolve a Truth-qualified contact or organisational binding.'
    else 'Continue evidence-led commercial reasoning.' end as recommended_action,
  null::jsonb as score_explanation_json,'cie-fb8-authoritative-read-model'::text as scoring_version,null::timestamptz as scored_at,
  c.review_note,c.reviewed_at,c.reviewed_by,c.rank,c.created_at,c.updated_at,
  c.campaign_name,c.company_name,c.company_website_url,c.company_industry,c.company_country,c.company_summary,
  null::integer as company_confidence,
  case when c.r6_current then c.r6_contact_name else null end as primary_contact_name,
  case when c.r6_current then c.r6_contact_role else null end as primary_contact_role,
  case when c.r6_current then c.r6_contact_department else null end as primary_contact_department,
  case when c.r6_current then c.r6_contact_location else null end as primary_contact_location,
  null::text as contact_reason_selected,null::integer as primary_contact_confidence,null::text as primary_contact_review_status,
  case when c.r6_current then c.r6_contact_email else null end as primary_contact_email,
  null::text as primary_contact_email_status,
  case when c.r6_current then c.r6_contact_linkedin_url else null end as primary_contact_linkedin_url,
  c.company_evidence_count,
  case when c.r6_current then c.current_contact_evidence_count else 0 end as contact_evidence_count,
  null::uuid as primary_route_id,null::text as primary_route_email,null::text as primary_route_verification_status,null::integer as primary_route_score,
  null::integer as primary_route_confidence,null::integer as primary_route_response_likelihood,null::integer as primary_route_campaign_relevance,
  null::text as primary_route_channel_type,0::bigint as available_route_count,null::text as primary_route_likely_reader,null::text as primary_route_reason,null::text as primary_route_source_url,
  case when c.r5_current then c.commercial_route_id else null end as commercial_route_id,
  case when c.r5_current then c.commercial_route_type else null end as commercial_route_type,
  case when c.r5_current then c.commercial_route_label else null end as commercial_route_label,
  case when c.r5_current then c.commercial_route_entry_role else null end as commercial_route_entry_role,
  case when c.r5_current then c.commercial_route_target_role else null end as commercial_route_target_role,
  case when c.r5_current then c.commercial_route_department else null end as commercial_route_department,
  case when c.r5_current then c.commercial_route_contact_name else null end as commercial_route_contact_name,
  case when c.r5_current then c.commercial_route_contact_role else null end as commercial_route_contact_role,
  case when c.r5_current then c.commercial_route_channel_type else null end as commercial_route_channel_type,
  case when c.r5_current then c.commercial_route_channel_value else null end as commercial_route_channel_value,
  null::integer as commercial_route_quality,null::integer as commercial_route_confidence,null::integer as commercial_route_authority,
  null::integer as commercial_route_accessibility,null::integer as commercial_route_evidence_quality,null::integer as commercial_route_resilience,
  null::text as commercial_route_difficulty,
  case when c.r5_current then c.commercial_route_rationale else null end as commercial_route_rationale,
  case when c.r5_current then c.commercial_route_next_step else null end as commercial_route_next_step,
  case when c.r5_current then c.commercial_route_count else 0::bigint end as commercial_route_count,
  case when c.r5_current then c.commercial_route_evidence_count else 0::bigint end as commercial_route_evidence_count,
  null::jsonb as organisation_map,null::jsonb as buying_paths,
  c.authority_state,
  (c.authority_state='READY') as authority_ready,
  (c.r4_current and (c.r4_disposition<>'COMMERCIAL_CANDIDATE' or (c.r5_current and c.r6_current))) as authority_current,
  ((c.authority_state='READY' and c.workflow_status not in ('READY','APPROVED','REJECTED','ENGAGED')) or
   (c.authority_state<>'READY' and c.workflow_status in ('READY','APPROVED'))) as workflow_authority_mismatch,
  c.r4_current,c.r5_current,c.r6_current,
  c.r4_reality_id,c.r4_reality_state,c.r4_disposition,c.r4_input_fingerprint,c.r4_authority_fingerprint,
  c.r4_seller_context_fingerprint,c.r4_constraint_fingerprint,c.target_truth_entity_id,c.target_truth_snapshot_id,c.target_truth_semantics_version,
  c.r4_producer_version,c.r4_production_id,c.r4_decision_json,c.r4_last_validated_at,c.r4_next_validation_at,c.r4_last_invalidation_reason,c.r4_updated_at,
  c.r5_authority_status,c.r5_producer_version,c.r5_source_fingerprint,c.r5_authority_fingerprint,c.r5_selected_route_ids,c.r5_route_states_json,c.r5_strategy_json,c.r5_graph_assessment_json,
  c.r5_invalidation_reason,c.r5_invalidated_at,c.r5_updated_at,
  c.r6_authority_status,c.r6_producer_version,c.r6_source_fingerprint,c.r6_contact_truth_fingerprint,c.r6_contact_truth_json,c.r6_contact_frontier_json,c.r6_bindings_json,c.r6_decision_json,
  c.r6_next_revalidation_at,c.r6_invalidation_reason,c.r6_invalidated_at,c.r6_updated_at,
  c.authority_truth_index,c.authority_truth_coverage,c.authority_evidence_sufficiency,c.authority_truth_review_state,c.authority_probability_state,c.authority_truth_calculated_at,
  c.active_research_count,c.active_research_json,c.latest_invalidation_layer,c.latest_invalidation_reason,c.latest_invalidation_at,
  case when c.r5_current then c.commercial_routes else '[]'::jsonb end as commercial_routes,
  case when c.r5_current then c.commercial_route_evidence else '[]'::jsonb end as commercial_route_evidence,
  c.r4_boundary_constitution_version,
  c.r4_boundary_completeness_json,
  coalesce((c.r4_boundary_completeness_json->>'complete')::boolean,false) as r4_boundary_complete
from classified c;

revoke all on public.cie_authoritative_opportunity_read from public,anon,authenticated;
grant select on public.cie_authoritative_opportunity_read to service_role;

comment on view public.cie_authoritative_opportunity_read is
'Build 8 constitutional opportunity presentation model. READY requires current fingerprint-linked R4 (FB3), R5 (FB5), and R6 Contact Truth (FB6). Legacy opportunity/contact/route scores are emitted NULL and have no presentation authority.';

create view public.cie_authoritative_opportunity_detail_read with (security_invoker=true) as
select
  ar.*,
  coalesce((select jsonb_agg(jsonb_build_object(
    'id',ce.id,'claim',ce.claim,'sourceUrl',ce.source_url,'sourceTitle',ce.source_title,'excerpt',ce.excerpt,'createdAt',ce.created_at
  ) order by ce.created_at,ce.id) from public.company_evidence ce where ce.company_id=ar.company_id),'[]'::jsonb) as company_evidence,
  coalesce((select jsonb_agg(jsonb_build_object(
    'id',cte.id,'evidenceType',cte.evidence_type,'claim',cte.claim,'sourceUrl',cte.source_url,'sourceTitle',cte.source_title,'excerpt',cte.excerpt,
    'sourceKind',cte.source_kind,'sourceDomain',cte.source_domain,'retrievedAt',cte.retrieved_at,'sourcePublishedAt',cte.source_published_at,'truthPolarity',cte.truth_polarity,'createdAt',cte.created_at
  ) order by cte.created_at,cte.id) from public.contact_evidence cte where cte.contact_id=ar.primary_contact_id),'[]'::jsonb) as contact_evidence,
  coalesce((select jsonb_agg(jsonb_build_object(
    'id',h.id,'eventType',h.event_type,'previousStatus',h.previous_status,'nextStatus',h.next_status,'previousRank',h.previous_rank,'nextRank',h.next_rank,
    'metadata',h.metadata_json,'occurredAt',h.occurred_at
  ) order by h.occurred_at desc,h.id desc) from public.opportunity_history h where h.opportunity_id=ar.id),'[]'::jsonb) as history,
  coalesce((select jsonb_agg(jsonb_build_object(
    'id',ev.id,'authorityLayer',ev.authority_layer,'previousFingerprint',ev.previous_fingerprint,'nextFingerprint',ev.next_fingerprint,
    'reason',ev.reason,'metadata',ev.metadata_json,'invalidatedAt',ev.created_at
  ) order by ev.created_at desc,ev.id desc) from public.cie_authority_invalidation_events ev where ev.opportunity_id=ar.id),'[]'::jsonb) as authority_history
from public.cie_authoritative_opportunity_read ar;

revoke all on public.cie_authoritative_opportunity_detail_read from public,anon,authenticated;
grant select on public.cie_authoritative_opportunity_detail_read to service_role;

comment on view public.cie_authoritative_opportunity_detail_read is
'Build 8 constitutional detail read model. Evidence and invalidation history are attached to the same current R4/R5/R6 authority lineage; historical scoring views are not consulted.';




notify pgrst, 'reload schema';
COMMIT;
