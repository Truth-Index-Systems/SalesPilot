-- MarketRoute / Genesis T8 Forensic Build 5
-- Canonical Relationship Graph — production relationship authority and multi-hop R5 paths.
BEGIN;

-- AI-researched business relationships are persisted independently from routes.
create table if not exists public.genesis_t8_canonical_relationship_assertions (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  contact_discovery_session_id uuid references public.contact_discovery_sessions(id) on delete set null,
  assertion_key text not null,
  relation_type text not null check(relation_type in ('depends_on','part_of','parent_of','subsidiary_of','partners_with','supplies','customer_of','uses_technology_from')),
  edge_class text not null check(edge_class in ('DEPENDENCY','COMPOSITION','ASSOCIATION')),
  direction text not null check(direction in ('DIRECTED','UNDIRECTED')),
  from_node_id text not null,
  from_entity_kind text not null check(from_entity_kind in ('TARGET_COMPANY','EXTERNAL_ORGANISATION','ORGANISATIONAL_UNIT','TECHNOLOGY')),
  from_label text not null,
  from_canonical_domain text,
  to_node_id text not null,
  to_entity_kind text not null check(to_entity_kind in ('TARGET_COMPANY','EXTERNAL_ORGANISATION','ORGANISATIONAL_UNIT','TECHNOLOGY')),
  to_label text not null,
  to_canonical_domain text,
  authority_state text not null default 'OPEN' check(authority_state in ('OPEN','UNRESOLVED')),
  evidence_json jsonb not null default '[]'::jsonb check(jsonb_typeof(evidence_json)='array'),
  rationale text,
  source_fingerprint text not null,
  source_semantics_version text not null default 'contact-discovery/v7-forensic-canonical-relationship-graph',
  authority_status text not null default 'ACTIVE' check(authority_status in ('ACTIVE','STALE')),
  invalidated_at timestamptz,
  invalidation_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organisation_id,campaign_id,company_id,assertion_key)
);
create index if not exists genesis_t8_canonical_relationship_assertions_active_idx
  on public.genesis_t8_canonical_relationship_assertions(organisation_id,campaign_id,company_id,authority_status,updated_at desc);
alter table public.genesis_t8_canonical_relationship_assertions enable row level security;
revoke all on public.genesis_t8_canonical_relationship_assertions from public,anon,authenticated;
grant select on public.genesis_t8_canonical_relationship_assertions to service_role;

create or replace function public.genesis_t8_relation_edge_class(p_relation_type text)
returns text language sql immutable strict as $$
  select case p_relation_type
    when 'depends_on' then 'DEPENDENCY'
    when 'part_of' then 'COMPOSITION'
    when 'parent_of' then 'COMPOSITION'
    when 'subsidiary_of' then 'COMPOSITION'
    when 'partners_with' then 'ASSOCIATION'
    when 'supplies' then 'ASSOCIATION'
    when 'customer_of' then 'ASSOCIATION'
    when 'uses_technology_from' then 'ASSOCIATION'
    when 'employs' then 'ASSOCIATION'
    when 'has_access_point' then 'COMPOSITION'
    when 'reachable_via' then 'ASSOCIATION'
    when 'introduced_by' then 'ASSOCIATION'
    else null end
$$;

create or replace function public.genesis_t8_relation_direction(p_relation_type text)
returns text language sql immutable strict as $$
  select case when p_relation_type='partners_with' then 'UNDIRECTED'
    when p_relation_type in ('depends_on','part_of','parent_of','subsidiary_of','supplies','customer_of','uses_technology_from','employs','has_access_point','reachable_via','introduced_by') then 'DIRECTED'
    else null end
$$;

-- New function; no OUT-signature collision with historical RPCs.
create or replace function public.persist_genesis_t8_canonical_relationships_owned(
  p_session_id uuid,
  p_scheduler_run_id uuid,
  p_relationships jsonb
) returns integer
language plpgsql security definer set search_path=public as $$
declare
  s public.contact_discovery_sessions%rowtype;
  c public.companies%rowtype;
  rel jsonb; ev jsonb;
  rt text; ec text; dir text; fk text; tk text; fl text; tl text; fd text; td text;
  fn text; tn text; akey text; fp text; n integer:=0;
begin
  perform public.assert_active_pipeline_scheduler_run(p_scheduler_run_id);
  select * into s from public.contact_discovery_sessions where id=p_session_id for update;
  if s.id is null then raise exception 'CONTACT_DISCOVERY_SESSION_NOT_FOUND'; end if;
  if s.status<>'RUNNING' or s.scheduler_run_id is distinct from p_scheduler_run_id or s.lease_expires_at is null or s.lease_expires_at<now()
    then raise exception 'CONTACT_DISCOVERY_OWNERSHIP_LOST'; end if;
  select * into c from public.companies where id=s.company_id and organisation_id=s.organisation_id and campaign_id=s.campaign_id;
  if c.id is null then raise exception 'CANONICAL_RELATIONSHIP_COMPANY_SCOPE_MISMATCH'; end if;
  if jsonb_typeof(coalesce(p_relationships,'[]'::jsonb))<>'array' then raise exception 'CANONICAL_RELATIONSHIPS_MUST_BE_ARRAY'; end if;

  update public.genesis_t8_canonical_relationship_assertions
     set authority_status='STALE',invalidated_at=now(),invalidation_reason='SOURCE_RESEARCH_REPLACED',updated_at=now()
   where organisation_id=s.organisation_id and campaign_id=s.campaign_id and company_id=s.company_id and authority_status='ACTIVE';

  for rel in select value from jsonb_array_elements(coalesce(p_relationships,'[]'::jsonb)) loop
    rt:=lower(trim(coalesce(rel->>'relationType','')));
    if rt not in ('depends_on','part_of','parent_of','subsidiary_of','partners_with','supplies','customer_of','uses_technology_from') then raise exception 'CANONICAL_RELATIONSHIP_TYPE_INVALID:%',rt; end if;
    if rel ? 'strength' or rel ? 'confidence' or rel ? 'score' or rel ? 'weight' or rel ? 'rank' then raise exception 'CANONICAL_RELATIONSHIP_NUMERIC_AUTHORITY_FORBIDDEN'; end if;
    fk:=upper(trim(coalesce(rel#>>'{fromEntity,kind}',''))); tk:=upper(trim(coalesce(rel#>>'{toEntity,kind}','')));
    fl:=trim(coalesce(rel#>>'{fromEntity,label}','')); tl:=trim(coalesce(rel#>>'{toEntity,label}',''));
    fd:=nullif(lower(trim(coalesce(rel#>>'{fromEntity,canonicalDomain}',''))),''); td:=nullif(lower(trim(coalesce(rel#>>'{toEntity,canonicalDomain}',''))),'');
    if fk not in ('TARGET_COMPANY','EXTERNAL_ORGANISATION','ORGANISATIONAL_UNIT','TECHNOLOGY') or tk not in ('TARGET_COMPANY','EXTERNAL_ORGANISATION','ORGANISATIONAL_UNIT','TECHNOLOGY') or fl='' or tl='' then raise exception 'CANONICAL_RELATIONSHIP_ENTITY_INVALID'; end if;
    if fk<>'TARGET_COMPANY' and tk<>'TARGET_COMPANY' then raise exception 'CANONICAL_RELATIONSHIP_TARGET_COMPANY_REQUIRED'; end if;
    if (fk='EXTERNAL_ORGANISATION' and fd is null) or (tk='EXTERNAL_ORGANISATION' and td is null) then raise exception 'CANONICAL_RELATIONSHIP_EXTERNAL_DOMAIN_REQUIRED'; end if;
    if jsonb_typeof(coalesce(rel->'evidence','[]'::jsonb))<>'array' or jsonb_array_length(coalesce(rel->'evidence','[]'::jsonb))=0 then raise exception 'CANONICAL_RELATIONSHIP_EVIDENCE_REQUIRED'; end if;
    if not exists(select 1 from jsonb_array_elements(coalesce(rel->'evidence','[]'::jsonb)) x where coalesce((x->>'verified')::boolean,false)=true and coalesce((x->>'excerptMatched')::boolean,false)=true and nullif(trim(coalesce(x->>'sourceUrl','')),'') is not null)
      then raise exception 'CANONICAL_RELATIONSHIP_QUALIFYING_EVIDENCE_REQUIRED'; end if;

    ec:=public.genesis_t8_relation_edge_class(rt); dir:=public.genesis_t8_relation_direction(rt);
    fn:=case fk when 'TARGET_COMPANY' then 'cie:target-company' when 'EXTERNAL_ORGANISATION' then 'cie:org:'||fd else 'cie:'||lower(fk)||':'||regexp_replace(lower(fl),'[^a-z0-9]+','-','g') end;
    tn:=case tk when 'TARGET_COMPANY' then 'cie:target-company' when 'EXTERNAL_ORGANISATION' then 'cie:org:'||td else 'cie:'||lower(tk)||':'||regexp_replace(lower(tl),'[^a-z0-9]+','-','g') end;
    if fn=tn then raise exception 'CANONICAL_RELATIONSHIP_SELF_EDGE_FORBIDDEN'; end if;
    akey:=encode(digest(convert_to(rt||'|'||fn||'|'||tn,'UTF8'),'sha256'),'hex');
    fp:=encode(digest(convert_to((rel-'rationale')::text,'UTF8'),'sha256'),'hex');

    insert into public.genesis_t8_canonical_relationship_assertions(
      organisation_id,campaign_id,company_id,contact_discovery_session_id,assertion_key,relation_type,edge_class,direction,
      from_node_id,from_entity_kind,from_label,from_canonical_domain,to_node_id,to_entity_kind,to_label,to_canonical_domain,
      authority_state,evidence_json,rationale,source_fingerprint,source_semantics_version,authority_status,invalidated_at,invalidation_reason)
    values(s.organisation_id,s.campaign_id,s.company_id,s.id,akey,rt,ec,dir,fn,fk,fl,fd,tn,tk,tl,td,'OPEN',coalesce(rel->'evidence','[]'::jsonb),nullif(trim(coalesce(rel->>'rationale','')),''),fp,'contact-discovery/v7-forensic-canonical-relationship-graph','ACTIVE',null,null)
    on conflict(organisation_id,campaign_id,company_id,assertion_key) do update set
      contact_discovery_session_id=excluded.contact_discovery_session_id,edge_class=excluded.edge_class,direction=excluded.direction,
      from_node_id=excluded.from_node_id,from_entity_kind=excluded.from_entity_kind,from_label=excluded.from_label,from_canonical_domain=excluded.from_canonical_domain,
      to_node_id=excluded.to_node_id,to_entity_kind=excluded.to_entity_kind,to_label=excluded.to_label,to_canonical_domain=excluded.to_canonical_domain,
      authority_state='OPEN',evidence_json=excluded.evidence_json,rationale=excluded.rationale,source_fingerprint=excluded.source_fingerprint,
      source_semantics_version=excluded.source_semantics_version,authority_status='ACTIVE',invalidated_at=null,invalidation_reason=null,updated_at=now();
    n:=n+1;
  end loop;
  return n;
end $$;
revoke all on function public.persist_genesis_t8_canonical_relationships_owned(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.persist_genesis_t8_canonical_relationships_owned(uuid,uuid,jsonb) to service_role;

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
  where o.status='BUILDING';
end $$;
revoke all on function public.get_cie_r5_canonical_relationship_context(uuid) from public,anon,authenticated;
grant execute on function public.get_cie_r5_canonical_relationship_context(uuid) to service_role;

alter table public.cie_r5_route_decisions add column if not exists relationship_states_json jsonb not null default '[]'::jsonb check(jsonb_typeof(relationship_states_json)='array');
alter table public.cie_r5_route_decisions add column if not exists path_provenance_json jsonb not null default '[]'::jsonb check(jsonb_typeof(path_provenance_json)='array');

-- Historical Build-4 writer remains as forensic code but loses execution privilege.
revoke all on function public.persist_cie_r5_route_decision(uuid,text,text,text,jsonb,jsonb,jsonb,jsonb) from service_role,public,anon,authenticated;

create or replace function public.persist_cie_r5_relationship_graph_decision(
  p_opportunity_id uuid,p_parent_r4_authority_fingerprint text,p_source_fingerprint text,p_authority_fingerprint text,
  p_selected_route_ids jsonb,p_route_states_json jsonb,p_relationship_states_json jsonb,p_path_provenance_json jsonb,p_strategy_json jsonb,p_graph_assessment_json jsonb
) returns void language plpgsql security definer set search_path=public as $$
declare o public.opportunities%rowtype; r4 public.cie_r4_commercial_decisions%rowtype; prior public.cie_r5_route_decisions%rowtype; rid text; path jsonb; rel jsonb; changed boolean:=false;
begin
  select * into o from public.opportunities where id=p_opportunity_id; if not found then raise exception 'CIE_R5_OPPORTUNITY_NOT_FOUND'; end if;
  select * into r4 from public.cie_r4_commercial_decisions where opportunity_id=o.id;
  if not found or r4.producer_version<>'MR-T8-FB3-1.0.0' or r4.disposition<>'COMMERCIAL_CANDIDATE' or r4.authority_fingerprint is distinct from p_parent_r4_authority_fingerprint then raise exception 'CIE_R5_PARENT_R4_AUTHORITY_MISMATCH'; end if;
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
revoke all on function public.persist_cie_r5_relationship_graph_decision(uuid,text,text,text,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.persist_cie_r5_relationship_graph_decision(uuid,text,text,text,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb) to service_role;


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
      d.producer_version is distinct from 'MR-T8-FB5-R5-1.0.0' or
      r4.producer_version is distinct from 'MR-T8-FB3-1.0.0' or r4.authority_fingerprint is null or d.parent_r4_authority_fingerprint is distinct from r4.authority_fingerprint
      or exists(select 1 from public.commercial_routes cr where cr.organisation_id=d.organisation_id and cr.campaign_id=d.campaign_id and cr.company_id=o.company_id and cr.updated_at>d.updated_at)
      or exists(select 1 from public.commercial_route_evidence e where e.organisation_id=d.organisation_id and e.campaign_id=d.campaign_id and e.company_id=o.company_id and e.created_at>d.updated_at)
      or exists(select 1 from public.genesis_t8_canonical_relationship_assertions a where a.organisation_id=d.organisation_id and a.campaign_id=d.campaign_id and a.company_id=o.company_id and a.updated_at>d.updated_at)
    ) for update of d skip locked
  loop
    reason:=case when r.current_r4_fingerprint is null or r.parent_r4_authority_fingerprint is distinct from r.current_r4_fingerprint then 'PARENT_R4_AUTHORITY_CHANGED' when r.producer_version is distinct from 'MR-T8-FB5-R5-1.0.0' then 'R5_GRAPH_SEMANTICS_VERSION_CHANGED' else 'ROUTE_OR_RELATIONSHIP_SOURCE_CHANGED' end;
    update public.cie_r5_route_decisions set authority_status='STALE',invalidated_at=now(),invalidation_reason=reason,applied_at=null,updated_at=now() where opportunity_id=r.opportunity_id;
    update public.cie_r6_contact_decisions set authority_status='STALE',invalidated_at=now(),invalidation_reason='PARENT_R5_AUTHORITY_STALE',applied_at=null,updated_at=now()
      where opportunity_id=r.opportunity_id and authority_status='ACTIVE';
    update public.opportunities set status='BUILDING',primary_contact_id=null,opportunity_score=null,scoring_version='cie-r5-fb5-stale-revalidation',updated_at=now()
      where id=r.opportunity_id and status not in ('APPROVED','REJECTED','ENGAGED');
    insert into public.cie_authority_invalidation_events(opportunity_id,organisation_id,campaign_id,authority_layer,previous_fingerprint,next_fingerprint,reason,scheduler_run_id,metadata_json)
      values(r.opportunity_id,r.organisation_id,r.campaign_id,'R5',r.authority_fingerprint,r.current_r4_fingerprint,reason,p_scheduler_run_id,'{}'::jsonb);
    n:=n+1;
  end loop;
  return query select n;
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
     or r4.producer_version<>'MR-T8-FB3-1.0.0' then raise exception 'CIE_R5_PARENT_R4_AUTHORITY_STALE'; end if;
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
    r5.opportunity_id is null or r5.authority_status='STALE' or r5.producer_version is distinct from 'MR-T8-FB5-R5-1.0.0' or r5.parent_r4_authority_fingerprint is distinct from d.authority_fingerprint
    or cd.opportunity_id is null or cd.authority_status='STALE' or cd.applied_at is null or cd.parent_r4_authority_fingerprint is distinct from d.authority_fingerprint
    or cd.parent_r5_authority_fingerprint is distinct from r5.authority_fingerprint
  ) order by o.created_at,o.id limit greatest(1,least(coalesce(p_limit,40),100));
end $$;


create or replace function public.persist_cie_r6_contact_decision(
  p_opportunity_id uuid,p_parent_r4_authority_fingerprint text,p_parent_r5_authority_fingerprint text,p_source_fingerprint text,
  p_primary_contact_id uuid,p_contact_frontier_json jsonb,p_bindings_json jsonb,p_decision_json jsonb
) returns void language plpgsql security definer set search_path=public as $$
declare o public.opportunities%rowtype; r4 public.cie_r4_commercial_decisions%rowtype; r5 public.cie_r5_route_decisions%rowtype; b jsonb;
begin
  select * into o from public.opportunities where id=p_opportunity_id; if not found then raise exception 'CIE_R6_OPPORTUNITY_NOT_FOUND'; end if;
  select * into r4 from public.cie_r4_commercial_decisions where opportunity_id=o.id;
  select * into r5 from public.cie_r5_route_decisions where opportunity_id=o.id;
  if not found or r5.authority_status<>'ACTIVE' or r5.producer_version<>'MR-T8-FB5-R5-1.0.0' or r5.authority_fingerprint is distinct from p_parent_r5_authority_fingerprint then raise exception 'CIE_R6_PARENT_R5_AUTHORITY_MISMATCH'; end if;
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
    update public.opportunities set status='BUILDING',primary_contact_id=null,opportunity_score=null,scoring_version='cie-r6-fb5-stale-revalidation',updated_at=now() where id=r.opportunity_id and status not in ('APPROVED','REJECTED','ENGAGED');
    insert into public.cie_authority_invalidation_events(opportunity_id,organisation_id,campaign_id,authority_layer,previous_fingerprint,next_fingerprint,reason,scheduler_run_id,metadata_json)
      values(r.opportunity_id,r.organisation_id,r.campaign_id,'R6',r.source_fingerprint,r.current_r5_fingerprint,reason,p_scheduler_run_id,'{}'::jsonb);
    n:=n+1;
  end loop; return query select n;
end $$;


create or replace function public.apply_cie_r6_contact_authority()
returns table(applied integer,ready integer,organisational integer) language plpgsql security definer set search_path=public as $$
declare r record; a integer:=0; rd integer:=0; org integer:=0;
begin
  for r in select d.*,r4.disposition from public.cie_r6_contact_decisions d
    join public.cie_r4_commercial_decisions r4 on r4.opportunity_id=d.opportunity_id and r4.producer_version='MR-T8-FB3-1.0.0' and r4.production_id is not null and r4.target_truth_semantics_version='MR-TI-2-TFR1'
    join public.cie_r5_route_decisions r5 on r5.opportunity_id=d.opportunity_id and r5.authority_status='ACTIVE' and r5.producer_version='MR-T8-FB5-R5-1.0.0'
    where d.applied_at is null and d.authority_status='ACTIVE' and r4.disposition='COMMERCIAL_CANDIDATE'
      and d.parent_r4_authority_fingerprint=r4.authority_fingerprint and d.parent_r5_authority_fingerprint=r5.authority_fingerprint
    order by d.updated_at,d.opportunity_id for update of d skip locked
  loop
    update public.opportunities set primary_contact_id=r.primary_contact_id,status='READY',opportunity_score=null,scoring_version='cie-r6-fb5-r5-bound-route-contact-authority',updated_at=now()
      where id=r.opportunity_id and status not in ('APPROVED','REJECTED','ENGAGED');
    update public.cie_r6_contact_decisions set applied_at=now(),updated_at=now() where opportunity_id=r.opportunity_id;
    a:=a+1; rd:=rd+1; if r.primary_contact_id is null then org:=org+1; end if;
  end loop; return query select a,rd,org;
end $$;


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
  if r5.opportunity_id is null or r5.authority_status<>'ACTIVE' or r5.producer_version<>'MR-T8-FB5-R5-1.0.0' then raise exception 'CIE_R5_PERSISTED_AUTHORITY_MISSING'; end if;
  if p_channel_strategy_json is distinct from r5.strategy_json then raise exception 'G5_CHANNEL_STRATEGY_MUST_EQUAL_PERSISTED_R5'; end if;
  if coalesce(p_schema_version,'')<>'g5-channel-strategy/v1' or coalesce(p_prompt_version,'')<>'cie-r5-route-authority/v3' then raise exception 'G5_CHANNEL_STRATEGY_VERSION_INVALID'; end if;
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
    jsonb_build_object('release','FORENSIC_BUILD5','worker','PERSISTED_CIE_R5_CHANNEL_STRATEGY','promptVersion',p_prompt_version,'model',p_model,'r5Fingerprint',r5.authority_fingerprint,'statePreserved',true));
  insert into public.campaign_timeline(organisation_id,campaign_id,event_type,title,description,visibility,metadata_json)
  values(v.organisation_id,v.campaign_id,'G5_CHANNEL_STRATEGY_READY','Authorised engagement route loaded','MarketRoute loaded the exact current CIE-R5 route authority for engagement. No route score or AI channel ranking was recalculated.','CUSTOMER',
    jsonb_build_object('strategyId',v.id,'opportunityId',v.opportunity_id,'r5Fingerprint',r5.authority_fingerprint));
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
     or r5.opportunity_id is null or r5.authority_status<>'ACTIVE' or r5.producer_version<>'MR-T8-FB5-R5-1.0.0' or r5.parent_r4_authority_fingerprint is distinct from r4.authority_fingerprint
     or r6.opportunity_id is null or r6.authority_status<>'ACTIVE' or r6.parent_r5_authority_fingerprint is distinct from r5.authority_fingerprint or r6.applied_at is null
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
  if s.id is null or s.outreach_generation_json is null or r5.opportunity_id is null or r5.authority_status<>'ACTIVE' or r5.producer_version<>'MR-T8-FB5-R5-1.0.0'
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
  select * into r5 from public.cie_r5_route_decisions where opportunity_id=s.opportunity_id and authority_status='ACTIVE' and authority_mode='AUTHORITATIVE' and producer_version='MR-T8-FB5-R5-1.0.0';
  select * into r6 from public.cie_r6_contact_decisions where opportunity_id=s.opportunity_id and applied_at is not null and authority_status='ACTIVE' and authority_mode='AUTHORITATIVE';
  if o.id is null or o.status<>'APPROVED' or c.id is null or r4.opportunity_id is null or r5.opportunity_id is null or r6.opportunity_id is null
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
    jsonb_build_object('release','FORENSIC_BUILD5','policyVersion','cie-r5-fb5-relationship-graph-lineage/v1','engagementConfidenceTelemetry',s.engagement_confidence,'routeId',r.id,'channel',v_channel,'r4Fingerprint',r4.authority_fingerprint,'r5Fingerprint',r5.authority_fingerprint,'r6SourceFingerprint',r6.source_fingerprint,'selfReviewOutcome','PASS'));
  return query select 1,1,0,'APPROVED',s.id,s.engagement_confidence;
end $$;
revoke all on function public.run_g5_autopilot_approval_owned(uuid) from public,anon,authenticated;
grant execute on function public.run_g5_autopilot_approval_owned(uuid) to service_role;


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
left join public.cie_r5_route_decisions r5 on r5.opportunity_id=o.id and r5.authority_status='ACTIVE' and r5.producer_version='MR-T8-FB5-R5-1.0.0'
left join lateral (
  select r.* from public.commercial_routes r
  where r.organisation_id=o.organisation_id and r.campaign_id=o.campaign_id and r.company_id=o.company_id
    and r.route_semantics_version in ('MR-T8-FB4-RAW','MR-T8-FB4-MIGRATED-RAW')
    and r.id=case when coalesce(r5.strategy_json#>>'{primary,routeId}','') ~ '^[0-9a-fA-F-]{36}$' then (r5.strategy_json#>>'{primary,routeId}')::uuid else null end
  limit 1
) cr on true;
revoke all on public.cie_r5_route_authority_read from public,anon,authenticated;
grant select on public.cie_r5_route_authority_read to service_role;


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
        'version','mr-t8-fb5-to-g5/v1','commercialRealityImmutable',true,'routeAuthority','CIE-R5',
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
  join public.cie_r5_route_authority_read rr on rr.opportunity_id=od.id and rr.authority_status='ACTIVE' and rr.producer_version='MR-T8-FB5-R5-1.0.0' and rr.commercial_route_id is not null
  join public.cie_r6_contact_decisions r6 on r6.opportunity_id=od.id and r6.authority_status='ACTIVE' and r6.parent_r5_authority_fingerprint=rr.authority_fingerprint and r6.applied_at is not null
  join public.campaigns ca on ca.id=od.campaign_id and ca.organisation_id=od.organisation_id
  join public.campaign_config_versions cfg on cfg.campaign_id=ca.id and cfg.version_number=ca.current_config_version
  join public.business_profiles bp on bp.id=ca.business_profile_id and bp.organisation_id=ca.organisation_id
  left join lateral (select bver.payload_json from public.business_profile_versions bver where bver.business_profile_id=bp.id order by bver.version_number desc limit 1) bpv on true
  where od.id=v.opportunity_id and od.organisation_id=v.organisation_id and od.campaign_id=v.campaign_id and od.status='APPROVED';
end $$;


-- Graph semantics changed materially. Existing R5/R6 decisions must be re-established under FB5.
update public.cie_r5_route_decisions
set authority_status='STALE',invalidated_at=coalesce(invalidated_at,now()),invalidation_reason='FB5_CANONICAL_RELATIONSHIP_GRAPH_REVALIDATION',applied_at=null,updated_at=now()
where authority_status='ACTIVE' and producer_version is distinct from 'MR-T8-FB5-R5-1.0.0';

update public.cie_r6_contact_decisions d
set authority_status='STALE',invalidated_at=coalesce(d.invalidated_at,now()),invalidation_reason='FB5_PARENT_R5_GRAPH_REVALIDATION',applied_at=null,updated_at=now()
where d.authority_status='ACTIVE' and exists(select 1 from public.cie_r5_route_decisions r5 where r5.opportunity_id=d.opportunity_id and r5.authority_status='STALE');

update public.opportunities o
set status='BUILDING',primary_contact_id=null,opportunity_score=null,scoring_version='cie-r5-fb5-relationship-graph-revalidation',updated_at=now()
where o.status in ('READY','NEEDS_CONTACT') and exists(select 1 from public.cie_r6_contact_decisions d where d.opportunity_id=o.id and d.invalidation_reason='FB5_PARENT_R5_GRAPH_REVALIDATION');

comment on table public.genesis_t8_canonical_relationship_assertions is 'Forensic Build 5 evidence-qualified canonical business relationship assertions. AI may propose categorical semantics/evidence only; no numeric relationship authority is persisted.';
comment on column public.cie_r5_route_decisions.relationship_states_json is 'Canonical relationship assertions consumed by the current R5 graph decision.';
comment on column public.cie_r5_route_decisions.path_provenance_json is 'Exact multi-hop canonical relationship paths behind the current R5 route frontier.';

notify pgrst, 'reload schema';
COMMIT;
