BEGIN;

-- MarketRoute Forensic Build 4 — Legacy Route Authority Eradication
--
-- Constitutional purpose:
--   * commercial_routes is a raw route-fact/evidence store, not an authority table;
--   * G4 authority/accessibility/relevance/evidence/resilience/confidence weights,
--     route_quality, is_viable and is_primary have ZERO live authority;
--   * CIE-R5 is persisted as the sole route authority between R4 and R6;
--   * an OPEN route requires a concrete executable channel value supported by
--     deterministically-normalised qualifying evidence;
--   * R6 and autopilot must prove current R5 lineage before execution.

-- Expand Build-3 invalidation audit vocabulary.
alter table public.cie_authority_invalidation_events
  drop constraint if exists cie_authority_invalidation_events_authority_layer_check;
alter table public.cie_authority_invalidation_events
  add constraint cie_authority_invalidation_events_authority_layer_check
  check(authority_layer in ('R4','R5','R6','R7'));

-- Preserve the legacy columns for historical/schema compatibility, but explicitly
-- mark their semantics. New Build-4 writes neutralise them instead of calculating them.
alter table public.commercial_routes
  add column if not exists route_semantics_version text not null default 'LEGACY_G47_WEIGHTED',
  add column if not exists legacy_authority_quarantined_at timestamptz,
  add column if not exists legacy_authority_snapshot_json jsonb;

alter table public.commercial_route_evidence
  add column if not exists route_evidence_semantics_version text not null default 'LEGACY_G47_WEIGHTED',
  add column if not exists legacy_authority_snapshot_json jsonb;

update public.commercial_routes
set legacy_authority_snapshot_json=coalesce(legacy_authority_snapshot_json,jsonb_build_object(
      'authority',authority,'accessibility',accessibility,'commercialRelevance',commercial_relevance,
      'evidenceQuality',evidence_quality,'resilience',resilience,'confidence',confidence,'routeQuality',route_quality,
      'difficulty',difficulty,'isPrimary',is_primary,'isViable',is_viable
    )),
    authority=0,accessibility=0,commercial_relevance=0,evidence_quality=0,resilience=0,confidence=0,route_quality=0,
    difficulty='MEDIUM',is_primary=false,is_viable=false,route_semantics_version='MR-T8-FB4-MIGRATED-RAW',
    legacy_authority_quarantined_at=coalesce(legacy_authority_quarantined_at,now()),updated_at=now()
where route_semantics_version='LEGACY_G47_WEIGHTED';

update public.commercial_route_evidence
set legacy_authority_snapshot_json=coalesce(legacy_authority_snapshot_json,jsonb_build_object('qualityScore',quality_score)),
    quality_score=0,route_evidence_semantics_version='MR-T8-FB4-MIGRATED-RAW'
where route_evidence_semantics_version='LEGACY_G47_WEIGHTED';

-- Old direct G4 writer stays historically defined but is not executable by the app.
revoke execute on function public.save_route_intelligence(uuid,jsonb,jsonb,jsonb,text) from service_role;

-- Deterministic route-fact qualification used by research readiness and DB guards.
-- This is intentionally categorical. No score/threshold participates.
create or replace function public.cie_r5_route_fact_state(p_route_id uuid)
returns text language plpgsql stable security definer set search_path=public as $$
declare r public.commercial_routes%rowtype; supported boolean:=false; expected text; person text;
begin
  select * into r from public.commercial_routes where id=p_route_id;
  if not found then return 'BLOCKED'; end if;
  if r.route_semantics_version not in ('MR-T8-FB4-RAW','MR-T8-FB4-MIGRATED-RAW') then return 'UNRESOLVED'; end if;
  if r.channel_type='UNKNOWN' or nullif(trim(coalesce(r.channel_value,'')),'') is null then return 'UNRESOLVED'; end if;

  if r.channel_type in ('DIRECT_EMAIL','DEPARTMENT_EMAIL','GENERAL_EMAIL') then
    expected:=lower(trim(r.channel_value));
    select exists(
      select 1 from public.commercial_route_evidence e
      where e.route_id=r.id and e.route_evidence_semantics_version in ('MR-T8-FB4-RAW','MR-T8-FB4-MIGRATED-RAW') and e.verified=true and e.excerpt_matched=true and nullif(trim(e.source_url),'') is not null
        and position(expected in lower(coalesce(e.claim,'')||' '||coalesce(e.excerpt,'')||' '||coalesce(e.source_url,'')))>0
    ) into supported;
  elsif r.channel_type='LINKEDIN' then
    expected:=lower(regexp_replace(trim(r.channel_value),'/$',''));
    select exists(
      select 1 from public.commercial_route_evidence e
      where e.route_id=r.id and e.route_evidence_semantics_version in ('MR-T8-FB4-RAW','MR-T8-FB4-MIGRATED-RAW') and e.verified=true and e.excerpt_matched=true and nullif(trim(e.source_url),'') is not null
        and (
          lower(regexp_replace(trim(e.source_url),'/$',''))=expected
          or position(expected in lower(coalesce(e.claim,'')||' '||coalesce(e.excerpt,'')))>0
        )
    ) into supported;
  elsif r.channel_type='SWITCHBOARD' then
    expected:=regexp_replace(r.channel_value,'[^0-9]','','g');
    if length(expected)>=7 then
      select exists(
        select 1 from public.commercial_route_evidence e
        where e.route_id=r.id and e.route_evidence_semantics_version in ('MR-T8-FB4-RAW','MR-T8-FB4-MIGRATED-RAW') and e.verified=true and e.excerpt_matched=true and nullif(trim(e.source_url),'') is not null
          and position(expected in regexp_replace(coalesce(e.claim,'')||' '||coalesce(e.excerpt,''),'[^0-9]','','g'))>0
      ) into supported;
    end if;
  elsif r.channel_type='INTRODUCTION' then
    expected:=lower(trim(r.channel_value)); person:=lower(trim(coalesce(r.contact_name,'')));
    select exists(
      select 1 from public.commercial_route_evidence e
      where e.route_id=r.id and e.route_evidence_semantics_version in ('MR-T8-FB4-RAW','MR-T8-FB4-MIGRATED-RAW') and e.verified=true and e.excerpt_matched=true and nullif(trim(e.source_url),'') is not null
        and (
          (length(expected)>=3 and position(expected in lower(coalesce(e.claim,'')||' '||coalesce(e.excerpt,'')))>0)
          or (length(person)>=3 and position(person in lower(coalesce(e.claim,'')||' '||coalesce(e.excerpt,'')))>0)
        )
    ) into supported;
  else
    return 'BLOCKED';
  end if;
  return case when supported then 'OPEN' else 'UNRESOLVED' end;
end $$;
revoke all on function public.cie_r5_route_fact_state(uuid) from public,anon,authenticated;
grant execute on function public.cie_r5_route_fact_state(uuid) to service_role;

-- Replace the live owned writer. It does NOT delegate to the G4 weighted writer.
create or replace function public.save_route_intelligence_owned(
  p_session_id uuid,
  p_scheduler_run_id uuid,
  p_organisation_map jsonb,
  p_buying_paths jsonb,
  p_routes jsonb,
  p_research_summary text
) returns integer
language plpgsql security definer set search_path=public as $$
declare
  s public.contact_discovery_sessions%rowtype; item jsonb; ev jsonb; v_route_id uuid;
  v_saved integer:=0; v_open integer:=0; v_version integer:=1;
begin
  perform public.assert_contact_discovery_owner(p_session_id,p_scheduler_run_id);
  select * into s from public.contact_discovery_sessions where id=p_session_id for update;
  if jsonb_typeof(coalesce(p_routes,'[]'::jsonb))<>'array' then raise exception 'routes payload must be an array'; end if;

  select coalesce(version_number,0)+1 into v_version from public.route_intelligence_snapshots
  where organisation_id=s.organisation_id and campaign_id=s.campaign_id and company_id=s.company_id;
  v_version:=coalesce(v_version,1);

  insert into public.route_intelligence_snapshots(
    organisation_id,campaign_id,company_id,contact_discovery_session_id,
    organisation_map_json,buying_paths_json,research_summary,version_number,updated_at
  ) values(
    s.organisation_id,s.campaign_id,s.company_id,s.id,coalesce(p_organisation_map,'{}'::jsonb),
    coalesce(p_buying_paths,'[]'::jsonb),left(p_research_summary,1500),v_version,now()
  ) on conflict(organisation_id,campaign_id,company_id) do update set
    contact_discovery_session_id=excluded.contact_discovery_session_id,
    organisation_map_json=excluded.organisation_map_json,buying_paths_json=excluded.buying_paths_json,
    research_summary=excluded.research_summary,version_number=route_intelligence_snapshots.version_number+1,updated_at=now();

  for item in select * from jsonb_array_elements(coalesce(p_routes,'[]'::jsonb)) loop
    if nullif(trim(item->>'routeKey'),'') is null or nullif(trim(item->>'entryRole'),'') is null or nullif(trim(item->>'targetRole'),'') is null then continue; end if;
    insert into public.commercial_routes(
      organisation_id,campaign_id,company_id,contact_discovery_session_id,route_key,route_type,label,
      entry_role,target_role,department,contact_name,contact_role,channel_type,channel_value,
      authority,accessibility,commercial_relevance,evidence_quality,resilience,confidence,route_quality,
      difficulty,rationale,next_step,fallback_reason,is_primary,is_viable,route_semantics_version,legacy_authority_quarantined_at,updated_at
    ) values(
      s.organisation_id,s.campaign_id,s.company_id,s.id,item->>'routeKey',coalesce(nullif(item->>'routeType',''),'OPERATIONAL'),coalesce(nullif(item->>'label',''),item->>'routeKey'),
      item->>'entryRole',item->>'targetRole',nullif(item->>'department',''),nullif(item->>'contactName',''),nullif(item->>'contactRole',''),
      coalesce(nullif(item->>'channelType',''),'UNKNOWN'),nullif(item->>'channelValue',''),
      0,0,0,0,0,0,0,'MEDIUM',coalesce(nullif(item->>'rationale',''),'Candidate route fact discovered from public evidence.'),
      coalesce(nullif(item->>'nextStep',''),'Await CIE route qualification.'),nullif(item->>'fallbackReason',''),false,false,
      'MR-T8-FB4-RAW',now(),now()
    ) on conflict(organisation_id,campaign_id,company_id,route_key) do update set
      contact_discovery_session_id=excluded.contact_discovery_session_id,route_type=excluded.route_type,label=excluded.label,
      entry_role=excluded.entry_role,target_role=excluded.target_role,department=excluded.department,contact_name=excluded.contact_name,
      contact_role=excluded.contact_role,channel_type=excluded.channel_type,channel_value=excluded.channel_value,
      authority=0,accessibility=0,commercial_relevance=0,evidence_quality=0,resilience=0,confidence=0,route_quality=0,
      difficulty='MEDIUM',rationale=excluded.rationale,next_step=excluded.next_step,fallback_reason=excluded.fallback_reason,
      is_primary=false,is_viable=false,route_semantics_version='MR-T8-FB4-RAW',legacy_authority_quarantined_at=now(),updated_at=now()
    returning id into v_route_id;

    delete from public.commercial_route_evidence where route_id=v_route_id;
    for ev in select * from jsonb_array_elements(coalesce(item->'evidence','[]'::jsonb)) loop
      if nullif(trim(ev->>'sourceUrl'),'') is null or nullif(trim(ev->>'claim'),'') is null then continue; end if;
      insert into public.commercial_route_evidence(
        organisation_id,campaign_id,company_id,route_id,evidence_type,claim,source_url,source_title,excerpt,
        source_kind,source_domain,verified,excerpt_matched,quality_score,retrieved_at,route_evidence_semantics_version
      ) values(
        s.organisation_id,s.campaign_id,s.company_id,v_route_id,coalesce(nullif(ev->>'evidenceType',''),'ROLE'),ev->>'claim',ev->>'sourceUrl',
        nullif(ev->>'sourceTitle',''),nullif(ev->>'excerpt',''),coalesce(nullif(ev->>'sourceKind',''),'OFFICIAL_WEBSITE'),nullif(ev->>'sourceDomain',''),
        coalesce((ev->>'verified')::boolean,false),coalesce((ev->>'excerptMatched')::boolean,false),0,nullif(ev->>'retrievedAt','')::timestamptz,
        'MR-T8-FB4-RAW'
      );
    end loop;
    v_saved:=v_saved+1;
  end loop;

  select count(*) into v_open from public.commercial_routes r
  where r.organisation_id=s.organisation_id and r.campaign_id=s.campaign_id and r.company_id=s.company_id
    and public.cie_r5_route_fact_state(r.id)='OPEN';
  update public.route_intelligence_snapshots set
    route_count=(select count(*) from public.commercial_routes where organisation_id=s.organisation_id and campaign_id=s.campaign_id and company_id=s.company_id),
    viable_route_count=v_open,updated_at=now()
  where organisation_id=s.organisation_id and campaign_id=s.campaign_id and company_id=s.company_id;
  return v_saved;
end $$;
revoke all on function public.save_route_intelligence_owned(uuid,uuid,jsonb,jsonb,jsonb,text) from public,anon,authenticated;
grant execute on function public.save_route_intelligence_owned(uuid,uuid,jsonb,jsonb,jsonb,text) to service_role;

-- Route research readiness is evidence-qualified, never score-qualified.
create or replace function public.evaluate_contact_discovery_route_readiness(
  p_session_id uuid,p_research_summary text default null,p_uncertainties jsonb default '[]'::jsonb,p_unresolved_roles jsonb default '[]'::jsonb
) returns table(action text,primary_ready boolean,fallback_ready boolean,route_count integer,expansion_pass integer)
language plpgsql security definer set search_path=public as $$
declare s public.contact_discovery_sessions%rowtype; v_route_count integer:=0; v_primary boolean:=false; v_fallback boolean:=false; v_next_pass integer; v_company_name text;
begin
  select * into s from public.contact_discovery_sessions where id=p_session_id for update;
  if s.id is null then raise exception 'contact discovery session missing'; end if;
  if s.status<>'RUNNING' then raise exception 'contact discovery session is not running'; end if;
  select count(distinct coalesce(cr.route_type,'')||'|'||coalesce(cr.channel_type,'')||'|'||coalesce(cr.channel_value,'')) into v_route_count
  from public.commercial_routes cr where cr.organisation_id=s.organisation_id and cr.campaign_id=s.campaign_id and cr.company_id=s.company_id
    and public.cie_r5_route_fact_state(cr.id)='OPEN';
  v_primary:=v_route_count>=1; v_fallback:=v_route_count>=2; v_next_pass:=least(4,coalesce(s.route_expansion_pass,0)+1);
  update public.contact_discovery_sessions set route_expansion_pass=v_next_pass,primary_route_ready=v_primary,fallback_route_ready=v_fallback,
    research_summary=left(coalesce(p_research_summary,research_summary,'Route intelligence completed.'),1500),uncertainties_json=coalesce(p_uncertainties,'[]'::jsonb),
    unresolved_roles_json=coalesce(p_unresolved_roles,'[]'::jsonb),heartbeat_at=now(),updated_at=now() where id=s.id;
  if v_primary and v_fallback then
    update public.contact_discovery_sessions set route_research_state='READY',stage='VALIDATING',progress=88,depth_focus_started_at=null where id=s.id;
    return query select 'READY',v_primary,v_fallback,v_route_count,v_next_pass; return;
  end if;
  if v_next_pass<4 then
    update public.contact_discovery_sessions set status='QUEUED',job_state='QUEUED',stage='EXPANDING',progress=45,route_research_state='EXPANDING',
      next_attempt_at=now(),next_retry_at=null,lease_expires_at=null,claimed_at=null,scheduler_run_id=null,last_error=null,last_error_code=null,last_error_message=null,
      depth_focus_started_at=s.depth_focus_started_at,updated_at=now() where id=s.id;
    select company_name into v_company_name from public.companies where id=s.company_id;
    insert into public.campaign_timeline(organisation_id,campaign_id,event_type,title,description,visibility,metadata_json) values(
      s.organisation_id,s.campaign_id,'ROUTE_RESEARCH_EXPANDING',
      case when s.depth_focus_started_at is null then 'Market scan captured the first route signals' else 'MarketRoute is strengthening the access strategy' end,
      case when s.depth_focus_started_at is null
        then 'MarketRoute completed the first Route Intelligence pass for '||coalesce(v_company_name,'this organisation')||' and will scan the remaining approved companies before deepening this account.'
        else 'MarketRoute found '||v_route_count||' evidence-qualified executable commercial route'||case when v_route_count=1 then '' else 's' end||' and is continuing this focused account before moving to the next company: '||coalesce(v_company_name,'the organisation')||'.' end,
      'CUSTOMER',jsonb_build_object('companyId',s.company_id,'sessionId',s.id,'pass',v_next_pass,'primaryReady',v_primary,'fallbackReady',v_fallback,'routeCount',v_route_count,'routeAuthorityBasis','CIE_R5_EVIDENCE_QUALIFIED','dispatchPolicy','BREADTH_THEN_DEPTH','phase',case when s.depth_focus_started_at is null then 'MARKET_SCAN' else 'DEEP_RESEARCH' end));
    return query select 'EXPAND',v_primary,v_fallback,v_route_count,v_next_pass; return;
  end if;
  update public.contact_discovery_sessions set route_research_state='EXHAUSTED',route_exhausted_at=now(),stage='VALIDATING',progress=88,depth_focus_started_at=null where id=s.id;
  return query select 'EXHAUSTED',v_primary,v_fallback,v_route_count,v_next_pass;
end $$;

-- First-class R5 authority ledger.
create table if not exists public.cie_r5_route_decisions (
  opportunity_id uuid primary key references public.opportunities(id) on delete cascade,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  parent_r4_authority_fingerprint text not null,
  source_fingerprint text not null,
  authority_fingerprint text not null,
  authority_mode text not null default 'AUTHORITATIVE' check(authority_mode='AUTHORITATIVE'),
  authority_status text not null default 'ACTIVE' check(authority_status in ('ACTIVE','STALE')),
  selected_route_ids jsonb not null default '[]'::jsonb check(jsonb_typeof(selected_route_ids)='array'),
  route_states_json jsonb not null default '[]'::jsonb check(jsonb_typeof(route_states_json)='array'),
  strategy_json jsonb not null check(jsonb_typeof(strategy_json)='object'),
  graph_assessment_json jsonb not null check(jsonb_typeof(graph_assessment_json)='object'),
  producer_version text not null default 'MR-T8-FB4-R5-1.0.0',
  invalidated_at timestamptz,
  invalidation_reason text,
  applied_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists cie_r5_route_decisions_status_idx on public.cie_r5_route_decisions(authority_status,updated_at);
alter table public.cie_r5_route_decisions enable row level security;
revoke all on public.cie_r5_route_decisions from public,anon,authenticated;
grant select on public.cie_r5_route_decisions to service_role;

alter table public.cie_r6_contact_decisions add column if not exists parent_r5_authority_fingerprint text;

create or replace function public.invalidate_stale_cie_r5_authority(p_scheduler_run_id uuid)
returns table(invalidated integer) language plpgsql security definer set search_path=public as $$
declare r record; n integer:=0; reason text;
begin
  if not exists(select 1 from public.pipeline_scheduler_lease where singleton=true and run_id=p_scheduler_run_id and lease_expires_at>now()) then raise exception 'PIPELINE_SCHEDULER_LEASE_NOT_HELD'; end if;
  for r in
    select d.*,o.company_id,r4.authority_fingerprint as current_r4_fingerprint
    from public.cie_r5_route_decisions d join public.opportunities o on o.id=d.opportunity_id
    left join public.cie_r4_commercial_decisions r4 on r4.opportunity_id=d.opportunity_id
    where d.authority_status='ACTIVE' and (
      r4.producer_version is distinct from 'MR-T8-FB3-1.0.0' or r4.authority_fingerprint is null or d.parent_r4_authority_fingerprint is distinct from r4.authority_fingerprint
      or exists(select 1 from public.commercial_routes cr where cr.organisation_id=d.organisation_id and cr.campaign_id=d.campaign_id and cr.company_id=o.company_id and cr.updated_at>d.updated_at)
      or exists(select 1 from public.commercial_route_evidence e where e.organisation_id=d.organisation_id and e.campaign_id=d.campaign_id and e.company_id=o.company_id and e.created_at>d.updated_at)
    ) for update of d skip locked
  loop
    reason:=case when r.current_r4_fingerprint is null or r.parent_r4_authority_fingerprint is distinct from r.current_r4_fingerprint then 'PARENT_R4_AUTHORITY_CHANGED' else 'RAW_ROUTE_SOURCE_CHANGED' end;
    update public.cie_r5_route_decisions set authority_status='STALE',invalidated_at=now(),invalidation_reason=reason,applied_at=null,updated_at=now() where opportunity_id=r.opportunity_id;
    update public.cie_r6_contact_decisions set authority_status='STALE',invalidated_at=now(),invalidation_reason='PARENT_R5_AUTHORITY_STALE',applied_at=null,updated_at=now()
      where opportunity_id=r.opportunity_id and authority_status='ACTIVE';
    update public.opportunities set status='BUILDING',primary_contact_id=null,opportunity_score=null,scoring_version='cie-r5-fb4-stale-revalidation',updated_at=now()
      where id=r.opportunity_id and status not in ('APPROVED','REJECTED','ENGAGED');
    insert into public.cie_authority_invalidation_events(opportunity_id,organisation_id,campaign_id,authority_layer,previous_fingerprint,next_fingerprint,reason,scheduler_run_id,metadata_json)
      values(r.opportunity_id,r.organisation_id,r.campaign_id,'R5',r.authority_fingerprint,r.current_r4_fingerprint,reason,p_scheduler_run_id,'{}'::jsonb);
    n:=n+1;
  end loop;
  return query select n;
end $$;
revoke all on function public.invalidate_stale_cie_r5_authority(uuid) from public,anon,authenticated;
grant execute on function public.invalidate_stale_cie_r5_authority(uuid) to service_role;

create or replace function public.persist_cie_r5_route_decision(
  p_opportunity_id uuid,p_parent_r4_authority_fingerprint text,p_source_fingerprint text,p_authority_fingerprint text,
  p_selected_route_ids jsonb,p_route_states_json jsonb,p_strategy_json jsonb,p_graph_assessment_json jsonb
) returns void language plpgsql security definer set search_path=public as $$
declare o public.opportunities%rowtype; r4 public.cie_r4_commercial_decisions%rowtype; prior public.cie_r5_route_decisions%rowtype; rid text; changed boolean:=false;
begin
  select * into o from public.opportunities where id=p_opportunity_id;
  if not found then raise exception 'CIE_R5_OPPORTUNITY_NOT_FOUND'; end if;
  select * into r4 from public.cie_r4_commercial_decisions where opportunity_id=o.id;
  if not found or r4.producer_version<>'MR-T8-FB3-1.0.0' or r4.disposition<>'COMMERCIAL_CANDIDATE' or r4.authority_fingerprint is distinct from p_parent_r4_authority_fingerprint
    then raise exception 'CIE_R5_PARENT_R4_AUTHORITY_MISMATCH'; end if;
  if p_parent_r4_authority_fingerprint !~ '^[0-9a-f]{64}$' or p_source_fingerprint !~ '^[0-9a-f]{64}$' or p_authority_fingerprint !~ '^[0-9a-f]{64}$' then raise exception 'CIE_R5_FINGERPRINT_INVALID'; end if;
  if jsonb_typeof(coalesce(p_selected_route_ids,'[]'::jsonb))<>'array' or jsonb_array_length(coalesce(p_selected_route_ids,'[]'::jsonb))<1 then raise exception 'CIE_R5_SELECTED_ROUTES_REQUIRED'; end if;
  if coalesce(p_strategy_json->>'promptVersion','')<>'cie-r5-route-authority/v2' then raise exception 'CIE_R5_STRATEGY_VERSION_INVALID'; end if;
  for rid in select jsonb_array_elements_text(p_selected_route_ids) loop
    if not exists(select 1 from public.commercial_routes cr where cr.id=rid::uuid and cr.organisation_id=o.organisation_id and cr.campaign_id=o.campaign_id and cr.company_id=o.company_id and public.cie_r5_route_fact_state(cr.id)='OPEN')
      then raise exception 'CIE_R5_SELECTED_ROUTE_NOT_EVIDENCE_QUALIFIED:%',rid; end if;
  end loop;
  if not (p_selected_route_ids ? coalesce(p_strategy_json#>>'{primary,routeId}','')) then raise exception 'CIE_R5_PRIMARY_NOT_IN_SELECTED_FRONTIER'; end if;

  select * into prior from public.cie_r5_route_decisions where opportunity_id=o.id for update;
  changed:=prior.opportunity_id is not null and prior.authority_fingerprint is distinct from p_authority_fingerprint;
  if changed then
    update public.cie_r6_contact_decisions set authority_status='STALE',invalidated_at=now(),invalidation_reason='PARENT_R5_AUTHORITY_CHANGED',applied_at=null,updated_at=now()
      where opportunity_id=o.id and authority_status='ACTIVE';
    update public.opportunities set status='BUILDING',primary_contact_id=null,opportunity_score=null,scoring_version='cie-r5-fb4-authority-changed',updated_at=now()
      where id=o.id and status not in ('APPROVED','REJECTED','ENGAGED');
    insert into public.cie_authority_invalidation_events(opportunity_id,organisation_id,campaign_id,authority_layer,previous_fingerprint,next_fingerprint,reason,metadata_json)
      values(o.id,o.organisation_id,o.campaign_id,'R5',prior.authority_fingerprint,p_authority_fingerprint,'MATERIAL_ROUTE_AUTHORITY_CHANGED',jsonb_build_object('previousSelectedRoutes',prior.selected_route_ids,'nextSelectedRoutes',p_selected_route_ids));
  end if;

  insert into public.cie_r5_route_decisions(opportunity_id,organisation_id,campaign_id,parent_r4_authority_fingerprint,source_fingerprint,authority_fingerprint,selected_route_ids,route_states_json,strategy_json,graph_assessment_json,authority_status,invalidated_at,invalidation_reason,applied_at,producer_version)
  values(o.id,o.organisation_id,o.campaign_id,p_parent_r4_authority_fingerprint,p_source_fingerprint,p_authority_fingerprint,p_selected_route_ids,coalesce(p_route_states_json,'[]'::jsonb),p_strategy_json,p_graph_assessment_json,'ACTIVE',null,null,now(),'MR-T8-FB4-R5-1.0.0')
  on conflict(opportunity_id) do update set parent_r4_authority_fingerprint=excluded.parent_r4_authority_fingerprint,source_fingerprint=excluded.source_fingerprint,
    authority_fingerprint=excluded.authority_fingerprint,selected_route_ids=excluded.selected_route_ids,route_states_json=excluded.route_states_json,
    strategy_json=excluded.strategy_json,graph_assessment_json=excluded.graph_assessment_json,authority_status='ACTIVE',invalidated_at=null,invalidation_reason=null,applied_at=now(),producer_version='MR-T8-FB4-R5-1.0.0',updated_at=now();
end $$;
revoke all on function public.persist_cie_r5_route_decision(uuid,text,text,text,jsonb,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.persist_cie_r5_route_decision(uuid,text,text,text,jsonb,jsonb,jsonb,jsonb) to service_role;

-- Engagement consumes the exact persisted R5 authority; it must never recompute
-- route authority against an older G5 reasoning snapshot.
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
  if r5.opportunity_id is null or r5.authority_status<>'ACTIVE' or r5.producer_version<>'MR-T8-FB4-R5-1.0.0'
     or r5.authority_fingerprint !~ '^[0-9a-f]{64}$' then raise exception 'CIE_R5_PERSISTED_AUTHORITY_MISSING'; end if;
  if r4.opportunity_id is null or r4.authority_fingerprint is distinct from r5.parent_r4_authority_fingerprint
     or r4.producer_version<>'MR-T8-FB3-1.0.0' then raise exception 'CIE_R5_PARENT_R4_AUTHORITY_STALE'; end if;
  if coalesce(r5.strategy_json->>'promptVersion','')<>'cie-r5-route-authority/v2' then raise exception 'CIE_R5_PERSISTED_AUTHORITY_VERSION_INVALID'; end if;

  return query select r5.strategy_json,r5.authority_fingerprint,r5.source_fingerprint;
end $$;
revoke all on function public.get_cie_r5_route_authority_for_engagement_owned(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.get_cie_r5_route_authority_for_engagement_owned(uuid,uuid,uuid) to service_role;

-- R6 context now supplies raw route facts + evidence; legacy is_viable never crosses the boundary.
create or replace function public.get_cie_r6_contact_authority_context(p_scheduler_run_id uuid,p_limit integer default 40)
returns table(opportunity_id uuid,reality_id text,commercial_routes jsonb,contacts jsonb,r4_authority_fingerprint text)
language plpgsql security definer set search_path=public as $$
begin
  if not exists(select 1 from public.pipeline_scheduler_lease where singleton=true and run_id=p_scheduler_run_id and lease_expires_at>now()) then raise exception 'PIPELINE_SCHEDULER_LEASE_NOT_HELD'; end if;
  return query
  select o.id,d.reality_id,
    coalesce((select jsonb_agg(jsonb_build_object(
      'id',r.id::text,'routeType',r.route_type,'contactName',r.contact_name,'contactRole',r.contact_role,'targetRole',r.target_role,
      'channelType',r.channel_type,'channelValue',r.channel_value,'routeSemanticsVersion',r.route_semantics_version,
      'evidence',coalesce((select jsonb_agg(jsonb_build_object('evidenceType',e.evidence_type,'claim',e.claim,'sourceUrl',e.source_url,'excerpt',e.excerpt,'verified',e.verified,'excerptMatched',e.excerpt_matched) order by e.created_at,e.id) from public.commercial_route_evidence e where e.route_id=r.id),'[]'::jsonb)
    ) order by r.id) from public.commercial_routes r where r.organisation_id=o.organisation_id and r.campaign_id=o.campaign_id and r.company_id=o.company_id),'[]'::jsonb),
    coalesce((select jsonb_agg(jsonb_build_object('id',c.id::text,'full_name',c.full_name,'role_title',c.role_title,'department',c.department,'email_address',c.email_address,'email_status',c.email_status,'linkedin_profile_url',c.linkedin_profile_url,'linkedin_status',c.linkedin_status,'review_status',c.review_status,
      'verified_identity_evidence',(select count(*) from public.contact_evidence e where e.contact_id=c.id and e.evidence_type='IDENTITY' and e.verified=true),
      'verified_role_evidence',(select count(*) from public.contact_evidence e where e.contact_id=c.id and e.evidence_type='ROLE' and e.verified=true)) order by c.id)
      from public.contacts c where c.organisation_id=o.organisation_id and c.campaign_id=o.campaign_id and c.company_id=o.company_id),'[]'::jsonb),
    d.authority_fingerprint
  from public.opportunities o join public.cie_r4_commercial_decisions d on d.opportunity_id=o.id and d.disposition='COMMERCIAL_CANDIDATE'
    and d.producer_version='MR-T8-FB3-1.0.0' and d.production_id is not null and d.target_truth_semantics_version='MR-TI-2-TFR1' and d.authority_fingerprint ~ '^[0-9a-f]{64}$'
  left join public.cie_r6_contact_decisions cd on cd.opportunity_id=o.id
  left join public.cie_r5_route_decisions r5 on r5.opportunity_id=o.id
  where o.status='BUILDING' and (
    r5.opportunity_id is null or r5.authority_status='STALE' or r5.parent_r4_authority_fingerprint is distinct from d.authority_fingerprint
    or cd.opportunity_id is null or cd.authority_status='STALE' or cd.applied_at is null or cd.parent_r4_authority_fingerprint is distinct from d.authority_fingerprint
    or cd.parent_r5_authority_fingerprint is distinct from r5.authority_fingerprint
  ) order by o.created_at,o.id limit greatest(1,least(coalesce(p_limit,40),100));
end $$;
revoke all on function public.get_cie_r6_contact_authority_context(uuid,integer) from public,anon,authenticated;
grant execute on function public.get_cie_r6_contact_authority_context(uuid,integer) to service_role;

-- Rebuild R6 persistence with an explicit R5 parent.
drop function if exists public.persist_cie_r6_contact_decision(uuid,text,text,uuid,jsonb,jsonb,jsonb);
drop function if exists public.persist_cie_r6_contact_decision(uuid,text,text,text,uuid,jsonb,jsonb,jsonb);
create function public.persist_cie_r6_contact_decision(
  p_opportunity_id uuid,p_parent_r4_authority_fingerprint text,p_parent_r5_authority_fingerprint text,p_source_fingerprint text,
  p_primary_contact_id uuid,p_contact_frontier_json jsonb,p_bindings_json jsonb,p_decision_json jsonb
) returns void language plpgsql security definer set search_path=public as $$
declare o public.opportunities%rowtype; r4 public.cie_r4_commercial_decisions%rowtype; r5 public.cie_r5_route_decisions%rowtype; b jsonb;
begin
  select * into o from public.opportunities where id=p_opportunity_id; if not found then raise exception 'CIE_R6_OPPORTUNITY_NOT_FOUND'; end if;
  select * into r4 from public.cie_r4_commercial_decisions where opportunity_id=o.id;
  select * into r5 from public.cie_r5_route_decisions where opportunity_id=o.id;
  if not found or r5.authority_status<>'ACTIVE' or r5.authority_fingerprint is distinct from p_parent_r5_authority_fingerprint then raise exception 'CIE_R6_PARENT_R5_AUTHORITY_MISMATCH'; end if;
  if r4.producer_version<>'MR-T8-FB3-1.0.0' or r4.authority_fingerprint is distinct from p_parent_r4_authority_fingerprint or r5.parent_r4_authority_fingerprint is distinct from r4.authority_fingerprint then raise exception 'CIE_R6_PARENT_R4_AUTHORITY_MISMATCH'; end if;
  if p_parent_r4_authority_fingerprint !~ '^[0-9a-f]{64}$' or p_parent_r5_authority_fingerprint !~ '^[0-9a-f]{64}$' or p_source_fingerprint !~ '^[0-9a-f]{64}$' then raise exception 'CIE_R6_FINGERPRINT_INVALID'; end if;
  if coalesce(p_decision_json->>'authorityMode','')<>'AUTHORITATIVE' or coalesce((p_decision_json->>'canUnlockOpportunity')::boolean,false) is not true then raise exception 'CIE_R6_NON_EXECUTABLE_DECISION'; end if;
  if p_primary_contact_id is not null and not exists(select 1 from public.contacts c where c.id=p_primary_contact_id and c.organisation_id=o.organisation_id and c.campaign_id=o.campaign_id and c.company_id=o.company_id) then raise exception 'CIE_R6_CONTACT_SCOPE_MISMATCH'; end if;
  for b in select value from jsonb_array_elements(coalesce(p_bindings_json,'[]'::jsonb)) loop
    if not (r5.selected_route_ids ? coalesce(b->>'routeId','')) then raise exception 'CIE_R6_BINDING_NOT_ON_R5_FRONTIER'; end if;
  end loop;
  insert into public.cie_r6_contact_decisions(opportunity_id,organisation_id,campaign_id,parent_r4_authority_fingerprint,parent_r5_authority_fingerprint,source_fingerprint,primary_contact_id,contact_frontier_json,bindings_json,decision_json,authority_status,invalidated_at,invalidation_reason)
  values(o.id,o.organisation_id,o.campaign_id,p_parent_r4_authority_fingerprint,p_parent_r5_authority_fingerprint,p_source_fingerprint,p_primary_contact_id,coalesce(p_contact_frontier_json,'[]'::jsonb),coalesce(p_bindings_json,'[]'::jsonb),p_decision_json,'ACTIVE',null,null)
  on conflict(opportunity_id) do update set parent_r4_authority_fingerprint=excluded.parent_r4_authority_fingerprint,parent_r5_authority_fingerprint=excluded.parent_r5_authority_fingerprint,
    source_fingerprint=excluded.source_fingerprint,primary_contact_id=excluded.primary_contact_id,contact_frontier_json=excluded.contact_frontier_json,bindings_json=excluded.bindings_json,
    decision_json=excluded.decision_json,authority_status='ACTIVE',invalidated_at=null,invalidation_reason=null,applied_at=null,updated_at=now();
end $$;
revoke all on function public.persist_cie_r6_contact_decision(uuid,text,text,text,uuid,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.persist_cie_r6_contact_decision(uuid,text,text,text,uuid,jsonb,jsonb,jsonb) to service_role;

-- R6 invalidation now follows explicit R5 lineage; contact source drift remains independent.
create or replace function public.invalidate_stale_cie_r6_authority(p_scheduler_run_id uuid)
returns table(invalidated integer) language plpgsql security definer set search_path=public as $$
declare r record; n integer:=0; reason text;
begin
  if not exists(select 1 from public.pipeline_scheduler_lease where singleton=true and run_id=p_scheduler_run_id and lease_expires_at>now()) then raise exception 'PIPELINE_SCHEDULER_LEASE_NOT_HELD'; end if;
  for r in select d.*,o.company_id,r4.authority_fingerprint as current_r4_fingerprint,r5.authority_fingerprint as current_r5_fingerprint,r5.authority_status as r5_status
    from public.cie_r6_contact_decisions d join public.opportunities o on o.id=d.opportunity_id
    left join public.cie_r4_commercial_decisions r4 on r4.opportunity_id=d.opportunity_id
    left join public.cie_r5_route_decisions r5 on r5.opportunity_id=d.opportunity_id
    where d.authority_status='ACTIVE' and (
      r4.producer_version is distinct from 'MR-T8-FB3-1.0.0' or d.parent_r4_authority_fingerprint is distinct from r4.authority_fingerprint
      or r5.authority_status is distinct from 'ACTIVE' or d.parent_r5_authority_fingerprint is distinct from r5.authority_fingerprint
      or exists(select 1 from public.contacts c where c.organisation_id=o.organisation_id and c.campaign_id=o.campaign_id and c.company_id=o.company_id and c.updated_at>d.updated_at)
      or exists(select 1 from public.contact_evidence e where e.organisation_id=o.organisation_id and e.campaign_id=o.campaign_id and e.company_id=o.company_id and e.created_at>d.updated_at)
    ) for update of d skip locked
  loop
    reason:=case when r.current_r4_fingerprint is null or r.parent_r4_authority_fingerprint is distinct from r.current_r4_fingerprint then 'PARENT_R4_AUTHORITY_CHANGED'
      when r.r5_status is distinct from 'ACTIVE' or r.parent_r5_authority_fingerprint is distinct from r.current_r5_fingerprint then 'PARENT_R5_AUTHORITY_CHANGED'
      else 'CONTACT_SOURCE_CHANGED' end;
    update public.cie_r6_contact_decisions set authority_status='STALE',invalidated_at=now(),invalidation_reason=reason,applied_at=null,updated_at=now() where opportunity_id=r.opportunity_id;
    update public.opportunities set status='BUILDING',primary_contact_id=null,opportunity_score=null,scoring_version='cie-r6-fb4-stale-revalidation',updated_at=now() where id=r.opportunity_id and status not in ('APPROVED','REJECTED','ENGAGED');
    insert into public.cie_authority_invalidation_events(opportunity_id,organisation_id,campaign_id,authority_layer,previous_fingerprint,next_fingerprint,reason,scheduler_run_id,metadata_json)
      values(r.opportunity_id,r.organisation_id,r.campaign_id,'R6',r.source_fingerprint,r.current_r5_fingerprint,reason,p_scheduler_run_id,'{}'::jsonb);
    n:=n+1;
  end loop; return query select n;
end $$;
revoke all on function public.invalidate_stale_cie_r6_authority(uuid) from public,anon,authenticated;
grant execute on function public.invalidate_stale_cie_r6_authority(uuid) to service_role;

create or replace function public.apply_cie_r6_contact_authority()
returns table(applied integer,ready integer,organisational integer) language plpgsql security definer set search_path=public as $$
declare r record; a integer:=0; rd integer:=0; org integer:=0;
begin
  for r in select d.*,r4.disposition from public.cie_r6_contact_decisions d
    join public.cie_r4_commercial_decisions r4 on r4.opportunity_id=d.opportunity_id and r4.producer_version='MR-T8-FB3-1.0.0' and r4.production_id is not null and r4.target_truth_semantics_version='MR-TI-2-TFR1'
    join public.cie_r5_route_decisions r5 on r5.opportunity_id=d.opportunity_id and r5.authority_status='ACTIVE' and r5.producer_version='MR-T8-FB4-R5-1.0.0'
    where d.applied_at is null and d.authority_status='ACTIVE' and r4.disposition='COMMERCIAL_CANDIDATE'
      and d.parent_r4_authority_fingerprint=r4.authority_fingerprint and d.parent_r5_authority_fingerprint=r5.authority_fingerprint
    order by d.updated_at,d.opportunity_id for update of d skip locked
  loop
    update public.opportunities set primary_contact_id=r.primary_contact_id,status='READY',opportunity_score=null,scoring_version='cie-r6-fb4-r5-bound-route-contact-authority',updated_at=now()
      where id=r.opportunity_id and status not in ('APPROVED','REJECTED','ENGAGED');
    update public.cie_r6_contact_decisions set applied_at=now(),updated_at=now() where opportunity_id=r.opportunity_id;
    a:=a+1; rd:=rd+1; if r.primary_contact_id is null then org:=org+1; end if;
  end loop; return query select a,rd,org;
end $$;
revoke all on function public.apply_cie_r6_contact_authority() from public,anon,authenticated;
grant execute on function public.apply_cie_r6_contact_authority() to service_role;

-- The canonical G5 strategy writer now accepts only the exact persisted R5 v2
-- strategy. This closes the old database version gate that still required the
-- historical AI channel-strategy prompt.
create or replace function public.complete_g5_channel_strategy_owned(
  p_strategy_id uuid,p_scheduler_run_id uuid,p_lease_token uuid,p_channel_strategy_json jsonb,
  p_schema_version text,p_prompt_version text,p_model text,p_confidence integer,p_source_fingerprint text
) returns public.engagement_strategies
language plpgsql security definer set search_path=public as $$
declare v public.engagement_strategies%rowtype; r5 public.cie_r5_route_decisions%rowtype;
begin
  perform public.assert_active_pipeline_scheduler_run(p_scheduler_run_id);
  select * into v from public.engagement_strategies where id=p_strategy_id for update;
  if v.id is null then raise exception 'G5_ENGAGEMENT_MISSING'; end if;
  if v.state<>'STRATEGY_READY' then raise exception 'G5_ENGAGEMENT_STATE_CHANGED'; end if;
  if v.scheduler_run_id is distinct from p_scheduler_run_id or v.lease_token is distinct from p_lease_token
     or v.lease_expires_at is null or v.lease_expires_at<now() then raise exception 'G5_ENGAGEMENT_OWNERSHIP_LOST'; end if;
  select * into r5 from public.cie_r5_route_decisions where opportunity_id=v.opportunity_id;
  if r5.opportunity_id is null or r5.authority_status<>'ACTIVE' or r5.producer_version<>'MR-T8-FB4-R5-1.0.0' then raise exception 'CIE_R5_PERSISTED_AUTHORITY_MISSING'; end if;
  if p_channel_strategy_json is distinct from r5.strategy_json then raise exception 'G5_CHANNEL_STRATEGY_MUST_EQUAL_PERSISTED_R5'; end if;
  if coalesce(p_schema_version,'')<>'g5-channel-strategy/v1' or coalesce(p_prompt_version,'')<>'cie-r5-route-authority/v2' then raise exception 'G5_CHANNEL_STRATEGY_VERSION_INVALID'; end if;
  if coalesce(p_model,'')<>'CIE-R5-PERSISTED-AUTHORITY' then raise exception 'G5_CHANNEL_STRATEGY_MODEL_INVALID'; end if;
  if coalesce(p_source_fingerprint,'')<>'cie-r5-authority:'||r5.authority_fingerprint then raise exception 'G5_CHANNEL_STRATEGY_R5_FINGERPRINT_MISMATCH'; end if;
  if p_confidence is null or p_confidence<0 or p_confidence>100 then raise exception 'G5_CHANNEL_STRATEGY_CONFIDENCE_INVALID'; end if;

  update public.engagement_strategies set
    channel_strategy_json=p_channel_strategy_json,channel_strategy_schema_version=p_schema_version,
    channel_strategy_prompt_version=p_prompt_version,channel_strategy_model=p_model,channel_strategy_confidence=p_confidence,
    channel_strategy_source_fingerprint=p_source_fingerprint,channel_strategy_decided_at=now(),lease_token=null,lease_expires_at=null,
    claimed_at=null,scheduler_run_id=null,failure_stage=null,failure_reason=null,next_retry_at=null,updated_at=now()
  where id=v.id returning * into v;
  insert into public.engagement_strategy_events(organisation_id,campaign_id,strategy_id,opportunity_id,scheduler_run_id,event_type,previous_state,next_state,lease_token,metadata_json)
  values(v.organisation_id,v.campaign_id,v.id,v.opportunity_id,p_scheduler_run_id,'CHANNEL_STRATEGY_READY','STRATEGY_READY','STRATEGY_READY',p_lease_token,
    jsonb_build_object('release','FORENSIC_BUILD4','worker','PERSISTED_CIE_R5_CHANNEL_STRATEGY','promptVersion',p_prompt_version,'model',p_model,'r5Fingerprint',r5.authority_fingerprint,'statePreserved',true));
  insert into public.campaign_timeline(organisation_id,campaign_id,event_type,title,description,visibility,metadata_json)
  values(v.organisation_id,v.campaign_id,'G5_CHANNEL_STRATEGY_READY','Authorised engagement route loaded','MarketRoute loaded the exact current CIE-R5 route authority for engagement. No route score or AI channel ranking was recalculated.','CUSTOMER',
    jsonb_build_object('strategyId',v.id,'opportunityId',v.opportunity_id,'r5Fingerprint',r5.authority_fingerprint));
  return v;
end $$;
revoke all on function public.complete_g5_channel_strategy_owned(uuid,uuid,uuid,jsonb,text,text,text,integer,text) from public,anon,authenticated;
grant execute on function public.complete_g5_channel_strategy_owned(uuid,uuid,uuid,jsonb,text,text,text,integer,text) to service_role;

-- Queue builder is an execution gate, not another route authority. It may only
-- execute a route already selected by current R5 and bound by current R6.
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
   where s.state='APPROVED' and s.engagement_quality_json is not null and s.engagement_confidence is not null
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
     or r4.opportunity_id is null or r4.producer_version<>'MR-T8-FB3-1.0.0'
     or r5.opportunity_id is null or r5.authority_status<>'ACTIVE' or r5.producer_version<>'MR-T8-FB4-R5-1.0.0' or r5.parent_r4_authority_fingerprint is distinct from r4.authority_fingerprint
     or r6.opportunity_id is null or r6.authority_status<>'ACTIVE' or r6.parent_r5_authority_fingerprint is distinct from r5.authority_fingerprint or r6.applied_at is null
     or coalesce(v.channel_strategy_prompt_version,'')<>'cie-r5-route-authority/v2'
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
  values(v.organisation_id,v.campaign_id,v.id,v.opportunity_id,p_scheduler_run_id,'TRANSITIONED','APPROVED','QUEUED',jsonb_build_object('release','FORENSIC_BUILD4','routeId',r.id,'channel',v_channel,'r5Fingerprint',r5.authority_fingerprint,'r6SourceFingerprint',r6.source_fingerprint,'transportRequired',v_channel='EMAIL'));
  return query select 1,1,0,0;
end $$;
revoke all on function public.run_g5_engagement_queue_builder_owned(uuid) from public,anon,authenticated;
grant execute on function public.run_g5_engagement_queue_builder_owned(uuid) to service_role;

-- Send-time claim rechecks R5/R6. An already queued message cannot be sent after
-- route authority becomes stale.
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
  if s.id is null or s.outreach_generation_json is null or r5.opportunity_id is null or r5.authority_status<>'ACTIVE' or r5.producer_version<>'MR-T8-FB4-R5-1.0.0'
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
revoke all on function public.claim_next_g5_email_execution_owned(uuid,integer) from public,anon,authenticated;
grant execute on function public.claim_next_g5_email_execution_owned(uuid,integer) to service_role;

-- Autopilot validates persisted R5 + R6 lineage, never commercial_routes.is_viable.
drop function if exists public.run_g5_autopilot_approval_owned(uuid);
create function public.run_g5_autopilot_approval_owned(p_scheduler_run_id uuid)
returns table(inspected integer,approved integer,held integer,reason text,strategy_id uuid,engagement_confidence integer)
language plpgsql security definer set search_path=public as $$
declare s public.engagement_strategies%rowtype; o public.opportunities%rowtype; c public.campaigns%rowtype; r public.commercial_routes%rowtype;
  r4 public.cie_r4_commercial_decisions%rowtype; r5 public.cie_r5_route_decisions%rowtype; r6 public.cie_r6_contact_decisions%rowtype;
  v_route_id uuid; v_channel text; v_expected_channel text;
begin
  perform public.assert_active_pipeline_scheduler_run(p_scheduler_run_id);
  select x.* into s from public.engagement_strategies x join public.campaigns ca on ca.id=x.campaign_id and ca.organisation_id=x.organisation_id
  where x.state='READY_FOR_APPROVAL' and lower(coalesce(ca.automation_mode,''))='autopilot' and ca.status not in ('PAUSED','ARCHIVED') and x.self_review_outcome='PASS'
    and x.self_review_json is not null and x.personalisation_safety_json is not null and x.engagement_quality_json is not null and x.outreach_generation_json is not null
    and x.channel_strategy_json is not null and x.autopilot_approved_at is null and (x.lease_expires_at is null or x.lease_expires_at<now())
  order by x.updated_at,x.created_at for update of x skip locked limit 1;
  if s.id is null then return query select 0,0,0,null::text,null::uuid,null::integer; return; end if;
  select * into o from public.opportunities where id=s.opportunity_id and organisation_id=s.organisation_id and campaign_id=s.campaign_id;
  select * into c from public.campaigns where id=s.campaign_id and organisation_id=s.organisation_id;
  select * into r4 from public.cie_r4_commercial_decisions where opportunity_id=s.opportunity_id and disposition='COMMERCIAL_CANDIDATE' and authority_mode='AUTHORITATIVE';
  select * into r5 from public.cie_r5_route_decisions where opportunity_id=s.opportunity_id and authority_status='ACTIVE' and authority_mode='AUTHORITATIVE' and producer_version='MR-T8-FB4-R5-1.0.0';
  select * into r6 from public.cie_r6_contact_decisions where opportunity_id=s.opportunity_id and applied_at is not null and authority_status='ACTIVE' and authority_mode='AUTHORITATIVE';
  if o.id is null or o.status<>'APPROVED' or c.id is null or r4.opportunity_id is null or r5.opportunity_id is null or r6.opportunity_id is null
    or r5.parent_r4_authority_fingerprint is distinct from r4.authority_fingerprint or r6.parent_r5_authority_fingerprint is distinct from r5.authority_fingerprint then
    return query select 1,0,1,'CIE_AUTHORITY_NOT_EXECUTABLE',s.id,s.engagement_confidence; return;
  end if;
  if coalesce(s.channel_strategy_json->>'promptVersion','')<>'cie-r5-route-authority/v2' then return query select 1,0,1,'ROUTE_NOT_CIE_R5_V2_AUTHORISED',s.id,s.engagement_confidence; return; end if;
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
  update public.engagement_strategies set previous_state='READY_FOR_APPROVAL',state='APPROVED',autopilot_approved_at=now(),autopilot_policy_version='cie-r5-fb4-lineage/v1',
    autopilot_confidence_threshold=null,lease_token=null,lease_expires_at=null,claimed_at=null,scheduler_run_id=null,updated_at=now()
  where id=s.id and state='READY_FOR_APPROVAL' returning * into s;
  if s.id is null then return query select 1,0,1,'STATE_CHANGED',null::uuid,null::integer; return; end if;
  insert into public.engagement_strategy_events(organisation_id,campaign_id,strategy_id,opportunity_id,scheduler_run_id,event_type,previous_state,next_state,metadata_json)
  values(s.organisation_id,s.campaign_id,s.id,s.opportunity_id,p_scheduler_run_id,'AUTO_APPROVED','READY_FOR_APPROVAL','APPROVED',
    jsonb_build_object('release','FORENSIC_BUILD4','policyVersion','cie-r5-fb4-lineage/v1','engagementConfidenceTelemetry',s.engagement_confidence,'routeId',r.id,'channel',v_channel,'r4Fingerprint',r4.authority_fingerprint,'r5Fingerprint',r5.authority_fingerprint,'r6SourceFingerprint',r6.source_fingerprint,'selfReviewOutcome','PASS'));
  return query select 1,1,0,'APPROVED',s.id,s.engagement_confidence;
end $$;
revoke all on function public.run_g5_autopilot_approval_owned(uuid) from public,anon,authenticated;
grant execute on function public.run_g5_autopilot_approval_owned(uuid) to service_role;

-- Existing R6 decisions were derived from the legacy is_viable input and therefore
-- cannot be grandfathered as Build-4 authority. Fail closed and let the scheduler revalidate.
update public.cie_r6_contact_decisions set authority_status='STALE',invalidated_at=coalesce(invalidated_at,now()),invalidation_reason='FB4_LEGACY_ROUTE_AUTHORITY_REVALIDATION',applied_at=null,updated_at=now()
where authority_status='ACTIVE' and parent_r5_authority_fingerprint is null;
update public.opportunities o set status='BUILDING',primary_contact_id=null,opportunity_score=null,scoring_version='cie-r5-fb4-legacy-authority-revalidation',updated_at=now()
where o.status in ('READY','NEEDS_CONTACT') and exists(select 1 from public.cie_r6_contact_decisions d where d.opportunity_id=o.id and d.invalidation_reason='FB4_LEGACY_ROUTE_AUTHORITY_REVALIDATION');

comment on table public.cie_r5_route_decisions is 'Forensic Build 4 sole persisted route authority. commercial_routes stores candidate facts/evidence only; legacy numeric route columns and is_viable/is_primary are historical compatibility telemetry.';
comment on column public.commercial_routes.route_semantics_version is 'MR-T8-FB4-RAW means this row is a candidate route fact, never an authority decision.';
comment on column public.cie_r6_contact_decisions.parent_r5_authority_fingerprint is 'Current R5 material route authority this contact binding is derived under.';

notify pgrst, 'reload schema';

-- Build 4 intentionally leaves the historical opportunity_overview/detail contracts
-- untouched. A narrow R5 authority read model avoids CREATE OR REPLACE VIEW drift
-- from years of added opportunity columns. Build 7 will replace the full read model.
create or replace view public.cie_r5_route_authority_read with (security_invoker=true) as
select
  o.id as opportunity_id,o.organisation_id,o.campaign_id,o.company_id,
  r5.authority_fingerprint,r5.source_fingerprint,r5.producer_version,r5.authority_status,
  cr.id as commercial_route_id,cr.route_type as commercial_route_type,cr.label as commercial_route_label,
  cr.entry_role as commercial_route_entry_role,cr.target_role as commercial_route_target_role,cr.department as commercial_route_department,
  cr.contact_name as commercial_route_contact_name,cr.contact_role as commercial_route_contact_role,
  cr.channel_type as commercial_route_channel_type,cr.channel_value as commercial_route_channel_value,
  cr.rationale as commercial_route_rationale,cr.next_step as commercial_route_next_step,
  case when r5.authority_status='ACTIVE' then jsonb_array_length(r5.selected_route_ids)::bigint else 0::bigint end as commercial_route_count,
  (select count(*) from public.commercial_route_evidence e where e.route_id=cr.id
     and e.route_evidence_semantics_version in ('MR-T8-FB4-RAW','MR-T8-FB4-MIGRATED-RAW') and e.verified=true and e.excerpt_matched=true) as commercial_route_evidence_count,
  coalesce((select jsonb_agg(jsonb_build_object(
    'id',r.id,'routeType',r.route_type,'label',r.label,'entryRole',r.entry_role,'targetRole',r.target_role,'department',r.department,
    'contactName',r.contact_name,'contactRole',r.contact_role,'channelType',r.channel_type,'channelValue',r.channel_value,
    'rationale',r.rationale,'nextStep',r.next_step,'routeSemanticsVersion',r.route_semantics_version,
    'authorityState',coalesce((select rs->>'edgeState' from jsonb_array_elements(coalesce(r5.route_states_json,'[]'::jsonb)) rs where rs->>'id'=r.id::text limit 1),'UNRESOLVED'),
    'isSelected',coalesce(r5.selected_route_ids,'[]'::jsonb) ? r.id::text
  ) order by case when coalesce(r5.selected_route_ids,'[]'::jsonb) ? r.id::text then 0 else 1 end,r.route_key,r.id)
    from public.commercial_routes r
    where r.organisation_id=o.organisation_id and r.campaign_id=o.campaign_id and r.company_id=o.company_id
      and r.route_semantics_version in ('MR-T8-FB4-RAW','MR-T8-FB4-MIGRATED-RAW')),'[]'::jsonb) as commercial_routes,
  coalesce((select jsonb_agg(jsonb_build_object(
    'id',e.id,'routeId',e.route_id,'evidenceType',e.evidence_type,'claim',e.claim,'sourceUrl',e.source_url,'sourceTitle',e.source_title,
    'excerpt',e.excerpt,'sourceKind',e.source_kind,'verified',e.verified,'excerptMatched',e.excerpt_matched,'createdAt',e.created_at
  ) order by e.created_at,e.id)
    from public.commercial_route_evidence e join public.commercial_routes r on r.id=e.route_id
    where r.organisation_id=o.organisation_id and r.campaign_id=o.campaign_id and r.company_id=o.company_id
      and r.route_semantics_version in ('MR-T8-FB4-RAW','MR-T8-FB4-MIGRATED-RAW')
      and e.route_evidence_semantics_version in ('MR-T8-FB4-RAW','MR-T8-FB4-MIGRATED-RAW') and e.verified=true),'[]'::jsonb) as commercial_route_evidence
from public.opportunities o
left join public.cie_r5_route_decisions r5 on r5.opportunity_id=o.id and r5.authority_status='ACTIVE' and r5.producer_version='MR-T8-FB4-R5-1.0.0'
left join lateral (
  select r.* from public.commercial_routes r
  where r.organisation_id=o.organisation_id and r.campaign_id=o.campaign_id and r.company_id=o.company_id
    and r.route_semantics_version in ('MR-T8-FB4-RAW','MR-T8-FB4-MIGRATED-RAW')
    and r.id=case when coalesce(r5.strategy_json#>>'{primary,routeId}','') ~ '^[0-9a-fA-F-]{36}$' then (r5.strategy_json#>>'{primary,routeId}')::uuid else null end
  limit 1
) cr on true;
revoke all on public.cie_r5_route_authority_read from public,anon,authenticated;
grant select on public.cie_r5_route_authority_read to service_role;


-- G5 commercial reasoning receives the same active R5 route that execution will
-- later consume. The historical opportunity_detail route fields are overwritten
-- inside the context and may not steer the narrative.
create or replace function public.get_g5_commercial_reasoning_context_owned(
  p_strategy_id uuid,
  p_scheduler_run_id uuid,
  p_lease_token uuid
)
returns table(organisation_id uuid,campaign_id uuid,context_json jsonb)
language plpgsql security definer set search_path=public as $$
declare v public.engagement_strategies%rowtype;
begin
  perform public.assert_active_pipeline_scheduler_run(p_scheduler_run_id);
  select * into v from public.engagement_strategies where id=p_strategy_id;
  if v.id is null then raise exception 'G5_ENGAGEMENT_MISSING'; end if;
  if v.state<>'REASONING' then raise exception 'G5_ENGAGEMENT_STATE_CHANGED'; end if;
  if v.scheduler_run_id is distinct from p_scheduler_run_id or v.lease_token is distinct from p_lease_token
     or v.lease_expires_at is null or v.lease_expires_at<now() then raise exception 'G5_ENGAGEMENT_OWNERSHIP_LOST'; end if;

  return query
  select v.organisation_id,v.campaign_id,
    jsonb_build_object(
      'contract',jsonb_build_object(
        'version','mr-t8-fb4-to-g5/v1','commercialRealityImmutable',true,'routeAuthority','CIE-R5',
        'instruction','Consume the current R4/R5/R6 authority. Never rediscover, rank or replace the route.'
      ),
      'businessDna',jsonb_build_object('profileId',bp.id,'companyName',bp.company_name,'summary',bp.summary,'industry',bp.industry,'confidence',bp.confidence,'payload',bpv.payload_json),
      'campaign',jsonb_build_object('id',ca.id,'name',ca.name,'objective',ca.objective,'automationMode',ca.automation_mode,'fitScore',ca.fit_score,'audience',cfg.audience,'buyerRoles',cfg.buyer_roles_json,'messageAngle',cfg.message_angle,'why',cfg.why_json),
      'opportunity',(
        to_jsonb(od)
        || jsonb_build_object(
          'commercial_route_id',rr.commercial_route_id,
          'commercial_route_type',rr.commercial_route_type,
          'commercial_route_label',rr.commercial_route_label,
          'commercial_route_entry_role',rr.commercial_route_entry_role,
          'commercial_route_target_role',rr.commercial_route_target_role,
          'commercial_route_department',rr.commercial_route_department,
          'commercial_route_contact_name',rr.commercial_route_contact_name,
          'commercial_route_contact_role',rr.commercial_route_contact_role,
          'commercial_route_channel_type',rr.commercial_route_channel_type,
          'commercial_route_channel_value',rr.commercial_route_channel_value,
          'commercial_route_quality',null,'commercial_route_confidence',null,'commercial_route_authority',null,
          'commercial_route_accessibility',null,'commercial_route_evidence_quality',null,'commercial_route_resilience',null,'commercial_route_difficulty',null,
          'commercial_route_rationale',rr.commercial_route_rationale,'commercial_route_next_step',rr.commercial_route_next_step,
          'commercial_route_count',rr.commercial_route_count,'commercial_route_evidence_count',rr.commercial_route_evidence_count,
          'commercial_routes',rr.commercial_routes,'commercial_route_evidence',rr.commercial_route_evidence,
          'cie_r5_authority_fingerprint',rr.authority_fingerprint,'cie_r5_producer_version',rr.producer_version
        )
      )
    )
  from public.opportunity_detail od
  join public.cie_r5_route_authority_read rr on rr.opportunity_id=od.id and rr.authority_status='ACTIVE' and rr.producer_version='MR-T8-FB4-R5-1.0.0' and rr.commercial_route_id is not null
  join public.cie_r6_contact_decisions r6 on r6.opportunity_id=od.id and r6.authority_status='ACTIVE' and r6.parent_r5_authority_fingerprint=rr.authority_fingerprint and r6.applied_at is not null
  join public.campaigns ca on ca.id=od.campaign_id and ca.organisation_id=od.organisation_id
  join public.campaign_config_versions cfg on cfg.campaign_id=ca.id and cfg.version_number=ca.current_config_version
  join public.business_profiles bp on bp.id=ca.business_profile_id and bp.organisation_id=ca.organisation_id
  left join lateral (select bver.payload_json from public.business_profile_versions bver where bver.business_profile_id=bp.id order by bver.version_number desc limit 1) bpv on true
  where od.id=v.opportunity_id and od.organisation_id=v.organisation_id and od.campaign_id=v.campaign_id and od.status='APPROVED';
end $$;
revoke all on function public.get_g5_commercial_reasoning_context_owned(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.get_g5_commercial_reasoning_context_owned(uuid,uuid,uuid) to service_role;

notify pgrst, 'reload schema';

COMMIT;
