-- MR-TI-2 Build 8.3 — Legacy Eradication Pass
-- Removes TI-1 truth/criticality semantics from production-reachable SQL surfaces.
-- Legacy tables remain untouched for historical audit only.

-- V2 helper: deterministic claim probability from immutable V2 snapshot diagnostics.
create or replace function public.mrti2_result_claim_probability(p_result jsonb,p_claim_key text)
returns double precision language sql immutable parallel safe as $$
  select coalesce((select (item->>'probability')::double precision * 100
    from jsonb_array_elements(coalesce(p_result->'diagnostics'->'contributions','[]'::jsonb)) item
    where item->>'claimKey'=p_claim_key and coalesce((item->>'represented')::boolean,false) limit 1),0);
$$;

-- Company search projection is now hydrated exclusively from MR-TI-2 snapshots.
create or replace function public.refresh_genesis_g8_company_search_projection(p_entity_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare
  v_entity public.genesis_g8_intelligence_entities%rowtype;
  v_claim_text jsonb := '{}'::jsonb;
  v_search_text text := '';
  v_channels text[] := '{}'::text[];
  v_truth double precision := 0;
  v_confidence double precision := 0;
  v_coverage double precision := 0;
  v_identity double precision := 0;
  v_result jsonb := '{}'::jsonb;
  v_contacts integer := 0;
  v_routes integer := 0;
  v_contact_truth double precision := 0;
  v_route_truth double precision := 0;
begin
  select * into v_entity from public.genesis_g8_intelligence_entities where id=p_entity_id;
  if not found or v_entity.entity_type <> 'company' then return; end if;

  select coalesce(jsonb_object_agg(x.claim_key,x.claim_text),'{}'::jsonb),
         left(coalesce(string_agg(x.claim_key||' '||x.claim_text,' '),''),30000)
    into v_claim_text,v_search_text
  from (
    select c.claim_key,left(coalesce(string_agg(distinct concat_ws(' ',c.label,e.excerpt,e.source_ref,e.source_family),' '),''),6000) claim_text
    from public.genesis_g8_intelligence_claims c
    left join public.genesis_g8_intelligence_evidence e on e.claim_id=c.id
    where c.entity_id=p_entity_id
    group by c.claim_key
  ) x;

  select coalesce(array_agg(distinct e.intelligence_channel order by e.intelligence_channel)
           filter(where e.intelligence_channel is not null),'{}'::text[])
    into v_channels
  from public.genesis_g8_intelligence_claims c
  join public.genesis_g8_intelligence_evidence e on e.claim_id=c.id
  where c.entity_id=p_entity_id;

  select s.truth_index,s.represented_confidence,s.coverage,s.result_json
    into v_truth,v_confidence,v_coverage,v_result
  from public.genesis_g8_truth_v2_snapshots s where s.entity_id=p_entity_id order by s.calculated_at desc limit 1;

  v_truth:=coalesce(v_truth,0); v_confidence:=coalesce(v_confidence,0); v_coverage:=coalesce(v_coverage,0);
  v_identity:=least(
    public.mrti2_result_claim_probability(v_result,'identity'),
    public.mrti2_result_claim_probability(v_result,'canonical_domain')
  );

  select count(*),coalesce(avg(coalesce(ts.truth_index,0)),0)
    into v_contacts,v_contact_truth
  from public.genesis_g8_intelligence_entities child
  left join lateral (select truth_index from public.genesis_g8_truth_v2_snapshots s where s.entity_id=child.id order by calculated_at desc limit 1) ts on true
  where child.entity_type='contact' and child.status='ACTIVE' and child.review_state<>'HUMAN_REJECTED'
    and child.canonical_key like v_entity.canonical_key||'::person::%';

  select count(*),coalesce(avg(coalesce(ts.truth_index,0)),0)
    into v_routes,v_route_truth
  from public.genesis_g8_intelligence_entities child
  left join lateral (select truth_index from public.genesis_g8_truth_v2_snapshots s where s.entity_id=child.id order by calculated_at desc limit 1) ts on true
  where child.entity_type='route' and child.status='ACTIVE' and child.review_state<>'HUMAN_REJECTED'
    and child.canonical_key like v_entity.canonical_key||'::route::%';

  insert into public.genesis_g8_company_search_projection(
    entity_id,canonical_key,display_name,status,review_state,search_text,claim_text_json,
    truth_index,confidence,coverage,critical_claim_ceiling,identity_confidence,
    contact_count,route_count,contact_truth_score,route_truth_score,source_channels,human_reviewed,updated_at
  ) values (
    v_entity.id,v_entity.canonical_key,v_entity.display_name,v_entity.status,v_entity.review_state,
    left(concat_ws(' ',v_entity.display_name,v_entity.canonical_key,v_search_text),30000),v_claim_text,
    v_truth,v_confidence,v_coverage,0,coalesce(v_identity,0),v_contacts,v_routes,v_contact_truth,v_route_truth,
    v_channels,v_entity.review_state in ('HUMAN_APPROVED','HUMAN_CORRECTED','HUMAN_REJECTED'),now()
  ) on conflict(entity_id) do update set
    canonical_key=excluded.canonical_key,display_name=excluded.display_name,status=excluded.status,review_state=excluded.review_state,
    search_text=excluded.search_text,claim_text_json=excluded.claim_text_json,truth_index=excluded.truth_index,confidence=excluded.confidence,
    coverage=excluded.coverage,critical_claim_ceiling=0,identity_confidence=excluded.identity_confidence,
    contact_count=excluded.contact_count,route_count=excluded.route_count,contact_truth_score=excluded.contact_truth_score,
    route_truth_score=excluded.route_truth_score,source_channels=excluded.source_channels,human_reviewed=excluded.human_reviewed,updated_at=now();
end $$;

drop trigger if exists genesis_g8_search_projection_truth on public.genesis_g8_truth_snapshots;
drop trigger if exists genesis_g8_search_projection_truth_v2 on public.genesis_g8_truth_v2_snapshots;
create trigger genesis_g8_search_projection_truth_v2 after insert on public.genesis_g8_truth_v2_snapshots
for each row execute function public.genesis_g8_refresh_company_projection_from_snapshot();

-- Remove TI-1-only field from the active search RPC contract.
drop function if exists public.search_genesis_g8_company_candidates(text,integer);
create function public.search_genesis_g8_company_candidates(p_tsquery text default null,p_limit integer default 200)
returns table(
  entity_id uuid,canonical_key text,display_name text,status text,review_state text,search_text text,claim_text_json jsonb,
  truth_index double precision,confidence double precision,coverage double precision,
  identity_confidence double precision,contact_count integer,route_count integer,contact_truth_score double precision,
  route_truth_score double precision,source_channels text[],human_reviewed boolean,lexical_rank real,updated_at timestamptz
) language sql stable security definer set search_path=public as $$
  select p.entity_id,p.canonical_key,p.display_name,p.status,p.review_state,p.search_text,p.claim_text_json,
    p.truth_index,p.confidence,p.coverage,p.identity_confidence,p.contact_count,p.route_count,
    p.contact_truth_score,p.route_truth_score,p.source_channels,p.human_reviewed,
    case when nullif(trim(coalesce(p_tsquery,'')),'') is null then 0::real else ts_rank_cd(p.search_vector,to_tsquery('simple',p_tsquery)) end as lexical_rank,
    p.updated_at
  from public.genesis_g8_company_search_projection p
  where p.status='ACTIVE' and p.review_state<>'HUMAN_REJECTED'
    and (nullif(trim(coalesce(p_tsquery,'')),'') is null or p.search_vector @@ to_tsquery('simple',p_tsquery))
  order by lexical_rank desc,p.truth_index desc,p.coverage desc,p.canonical_key asc
  limit greatest(1,least(coalesce(p_limit,200),500));
$$;
revoke all on function public.search_genesis_g8_company_candidates(text,integer) from public,anon,authenticated;
grant execute on function public.search_genesis_g8_company_candidates(text,integer) to service_role;

-- Background refresh now uses V2 claim profiles and V2 snapshots.
drop function if exists public.list_genesis_g8_background_refresh_candidates(integer,double precision,double precision,timestamptz);
create function public.list_genesis_g8_background_refresh_candidates(
  p_limit integer default 20,p_maximum_freshness double precision default 0.72,
  p_minimum_priority double precision default 0.45,p_now timestamptz default now()
) returns table(
  entity_id uuid,entity_type text,claim_id uuid,claim_key text,claim_label text,impact_class text,
  freshness_half_life_days integer,latest_evidence_at timestamptz,freshness double precision,truth_index double precision,
  recent_campaign_uses integer,priority_score double precision
) language sql security definer set search_path=public as $$
with latest_truth as (
  select distinct on (s.entity_id) s.entity_id,s.truth_index
  from public.genesis_g8_truth_v2_snapshots s order by s.entity_id,s.calculated_at desc
), evidence_age as (
  select c.id claim_id,max(e.observed_at) latest_evidence_at
  from public.genesis_g8_intelligence_claims c left join public.genesis_g8_intelligence_evidence e on e.claim_id=c.id group by c.id
), demand as (
  select l.genesis_g8_entity_id entity_id,count(*)::integer recent_campaign_uses
  from public.genesis_g8_campaign_knowledge_links l where l.created_at>=p_now-interval '30 days' group by l.genesis_g8_entity_id
), scored as (
  select e.id entity_id,e.entity_type,c.id claim_id,c.claim_key,c.label claim_label,p.impact_class,
    p.freshness_half_life_days::integer,a.latest_evidence_at,
    case when a.latest_evidence_at is null then 0::double precision else power(0.5::double precision,
      greatest(0,extract(epoch from (p_now-a.latest_evidence_at))/86400.0)/greatest(p.freshness_half_life_days,1)) end freshness,
    coalesce(t.truth_index,0)::double precision truth_index,coalesce(d.recent_campaign_uses,0)::integer recent_campaign_uses,
    ((1-case when a.latest_evidence_at is null then 0::double precision else power(0.5::double precision,
      greatest(0,extract(epoch from (p_now-a.latest_evidence_at))/86400.0)/greatest(p.freshness_half_life_days,1)) end)
      * p.claim_weight
      * case p.impact_class when 'FOUNDATIONAL' then 4.0 when 'COMMERCIAL' then 2.8 when 'SUPPORTING' then 1.4 else 0.55 end
      * (1+least(coalesce(d.recent_campaign_uses,0),4)*0.65)
      * (0.75+least(coalesce(t.truth_index,0),99.9)/399.6))::double precision priority_score
  from public.genesis_g8_intelligence_entities e
  join public.genesis_g8_intelligence_claims c on c.entity_id=e.id
  join public.genesis_g8_truth_v2_claim_profiles p on p.claim_id=c.id and p.engine_version='MR-TI-2.0'
  left join evidence_age a on a.claim_id=c.id left join latest_truth t on t.entity_id=e.id left join demand d on d.entity_id=e.id
  where e.status='ACTIVE' and e.review_state<>'HUMAN_REJECTED'
    and not exists(select 1 from public.genesis_g8_discovery_repair_queue q where q.claim_id=c.id and q.status in ('QUEUED','CLAIMED'))
)
select s.entity_id,s.entity_type,s.claim_id,s.claim_key,s.claim_label,s.impact_class,s.freshness_half_life_days,
  s.latest_evidence_at,s.freshness,s.truth_index,s.recent_campaign_uses,s.priority_score
from scored s
where s.freshness<=greatest(0.05,least(0.99,p_maximum_freshness)) and s.priority_score>=greatest(0,p_minimum_priority)
order by s.priority_score desc,
  case s.impact_class when 'FOUNDATIONAL' then 1 when 'COMMERCIAL' then 2 when 'SUPPORTING' then 3 else 4 end,
  s.entity_id,s.claim_key limit greatest(1,least(coalesce(p_limit,20),100));
$$;
revoke all on function public.list_genesis_g8_background_refresh_candidates(integer,double precision,double precision,timestamptz) from public,anon,authenticated;
grant execute on function public.list_genesis_g8_background_refresh_candidates(integer,double precision,double precision,timestamptz) to service_role;

-- Same function signature types, but V2 semantic parameter name. Drop first so PostgREST sees the new arg name.
drop function if exists public.enqueue_genesis_g8_background_refresh(text,text,uuid,text,uuid,text,text,text,double precision,double precision);
create function public.enqueue_genesis_g8_background_refresh(
  p_dispatch_key text,p_refresh_version text,p_entity_id uuid,p_entity_type text,p_claim_id uuid,p_claim_key text,p_claim_label text,
  p_impact_class text,p_priority_score double precision,p_freshness double precision
) returns table(queued boolean,detail text)
language plpgsql security definer set search_path=public as $$
declare v_dispatch_id uuid; v_event_id uuid; v_minimum integer; v_compat text;
begin
  if p_impact_class not in ('FOUNDATIONAL','COMMERCIAL','SUPPORTING','OPTIONAL') then raise exception 'GENESIS_G8_INVALID_MRTI2_IMPACT_CLASS'; end if;
  if exists(select 1 from public.genesis_g8_discovery_repair_queue q where q.claim_id=p_claim_id and q.status in ('QUEUED','CLAIMED')) then
    return query select false,'Existing repair already owns this claim.'::text; return;
  end if;
  if not exists(select 1 from public.genesis_g8_intelligence_claims c where c.id=p_claim_id and c.entity_id=p_entity_id and c.claim_key=p_claim_key) then
    raise exception 'GENESIS_G8_BACKGROUND_REFRESH_CLAIM_MISMATCH';
  end if;
  select minimum_evidence into v_minimum from public.genesis_g8_intelligence_claims where id=p_claim_id;
  v_compat:=case p_impact_class when 'FOUNDATIONAL' then 'CRITICAL' when 'COMMERCIAL' then 'REQUIRED' else p_impact_class end;
  insert into public.genesis_g8_production_dispatches(dispatch_key,boundary_version,dispatch_version,entity_id,instruction_kind,blocking_mode,execution_target,workflow_ref,payload_json,private_workflow_json,status,outcome,detail,completed_at)
  values(p_dispatch_key,'MR-TI-2.0-B8.3','MR-TI-2.0-B8.3',p_entity_id,'DISCOVERY_REPAIR','NON_BLOCKING','DISCOVERY_INTELLIGENCE','BACKGROUND_REFRESH',
    jsonb_build_object('claimId',p_claim_id,'claimKey',p_claim_key,'claimLabel',p_claim_label,'impactClass',p_impact_class,'priorityScore',p_priority_score,'freshness',p_freshness),
    '{}'::jsonb,'COMPLETED','REPAIR_QUEUED','MR-TI-2 exact claim refresh queued.',now())
  on conflict(dispatch_key) do nothing returning id into v_dispatch_id;
  if v_dispatch_id is null then return query select false,'Refresh window already dispatched.'::text; return; end if;
  insert into public.genesis_g8_discovery_repair_queue(dispatch_key,entity_id,entity_type,claim_id,claim_key,repair_mode,objective,criticality,minimum_evidence,additional_evidence_needed,blocking_mode)
  values(p_dispatch_key,p_entity_id,p_entity_type,p_claim_id,p_claim_key,'REFRESH_STALE_EVIDENCE',
    'Refresh public evidence for "'||left(p_claim_label,300)||'" under MR-TI-2. Return current verifiable primitives only.',v_compat,greatest(coalesce(v_minimum,1),1),1,'NON_BLOCKING');
  insert into public.genesis_g8_background_refresh_events(dispatch_key,refresh_version,entity_id,claim_id,claim_key,criticality,priority_score,freshness,status,detail)
  values(p_dispatch_key,left(coalesce(p_refresh_version,'MR-TI-2.0'),120),p_entity_id,p_claim_id,p_claim_key,v_compat,greatest(coalesce(p_priority_score,0),0),greatest(0,least(1,coalesce(p_freshness,0))),'QUEUED','MR-TI-2 refresh queued.') returning id into v_event_id;
  return query select true,'MR-TI-2 exact background refresh queued.'::text;
end $$;
revoke all on function public.enqueue_genesis_g8_background_refresh(text,text,uuid,text,uuid,text,text,text,double precision,double precision) from public,anon,authenticated;
grant execute on function public.enqueue_genesis_g8_background_refresh(text,text,uuid,text,uuid,text,text,text,double precision,double precision) to service_role;

-- Repair claiming prioritises V2 impact profiles, not legacy queue criticality.
drop function if exists public.claim_genesis_g8_discovery_repairs(integer,text,integer);
create function public.claim_genesis_g8_discovery_repairs(p_limit integer default 2,p_worker_id text default 'genesis-g8-repair',p_lease_seconds integer default 75)
returns table(
  id uuid,dispatch_key text,entity_id uuid,entity_type text,entity_canonical_key text,entity_display_name text,
  claim_id uuid,claim_key text,claim_label text,impact_class text,repair_mode text,objective text,minimum_evidence integer,
  additional_evidence_needed integer,blocking_mode text,organisation_id uuid,campaign_id uuid,company_id uuid,attempt_count integer,lease_token text
) language plpgsql security definer set search_path=public as $$
begin
  return query
  with candidates as (
    select q.id from public.genesis_g8_discovery_repair_queue q
    join public.genesis_g8_truth_v2_claim_profiles p on p.claim_id=q.claim_id and p.engine_version='MR-TI-2.0'
    where q.status in ('QUEUED','CLAIMED') and coalesce(q.next_attempt_at,now())<=now()
      and (q.status='QUEUED' or q.lease_expires_at is null or q.lease_expires_at<now())
    order by case when q.organisation_id is not null or q.campaign_id is not null or q.company_id is not null then 0 else 1 end,
      case q.blocking_mode when 'BLOCKING_BEFORE_USE' then 0 else 1 end,
      case p.impact_class when 'FOUNDATIONAL' then 0 when 'COMMERCIAL' then 1 when 'SUPPORTING' then 2 else 3 end,
      p.claim_weight desc,q.created_at for update of q skip locked limit greatest(1,least(coalesce(p_limit,2),4))
  ), claimed as (
    update public.genesis_g8_discovery_repair_queue q set status='CLAIMED',claimed_by=left(coalesce(p_worker_id,'genesis-g8-repair'),240),claimed_at=now(),
      lease_token=gen_random_uuid()::text,lease_expires_at=now()+(greatest(30,least(coalesce(p_lease_seconds,75),180))||' seconds')::interval,
      attempt_count=q.attempt_count+1,updated_at=now() from candidates c where q.id=c.id returning q.*
  )
  select c.id,c.dispatch_key,c.entity_id,c.entity_type,e.canonical_key,e.display_name,c.claim_id,c.claim_key,ic.label,p.impact_class,
    c.repair_mode,c.objective,c.minimum_evidence,c.additional_evidence_needed,c.blocking_mode,c.organisation_id,c.campaign_id,c.company_id,c.attempt_count,c.lease_token
  from claimed c join public.genesis_g8_intelligence_entities e on e.id=c.entity_id
  join public.genesis_g8_intelligence_claims ic on ic.id=c.claim_id and ic.entity_id=c.entity_id
  join public.genesis_g8_truth_v2_claim_profiles p on p.claim_id=c.claim_id and p.engine_version='MR-TI-2.0';
end $$;
revoke all on function public.claim_genesis_g8_discovery_repairs(integer,text,integer) from public,anon,authenticated;
grant execute on function public.claim_genesis_g8_discovery_repairs(integer,text,integer) to service_role;

-- Capacity truth-gain now uses MR-TI-2 snapshots exclusively.
create or replace function public.genesis_g8_capacity_budget_snapshot(p_system_organisation_id uuid)
returns table(
  governance_enabled boolean,daily_request_limit integer,daily_cost_limit_usd numeric,requests_today integer,cost_today_usd numeric,
  g8_repair_calls_today integer,g8_repair_cost_today_usd numeric,background_repair_calls_today integer,background_repair_cost_today_usd numeric,
  live_customer_work_pending boolean,queued_customer_repairs integer,active_customer_repairs integer,truth_gain_today double precision,truth_gain_per_repair_call double precision
) language sql security definer set search_path=public as $$
with policy as (
  select p.autonomy_enabled,p.daily_request_limit,p.daily_cost_limit_usd from public.ai_governance_policies p where p.organisation_id=p_system_organisation_id
), usage_today as (
  select count(*)::integer requests,coalesce(sum(case when l.status='SUCCEEDED' then l.actual_cost_usd else l.estimated_cost_usd end),0)::numeric cost
  from public.ai_usage_ledger l where l.organisation_id=p_system_organisation_id and l.created_at>=date_trunc('day',now()) and l.status in ('RESERVED','SUCCEEDED','FAILED')
), g8_calls as (
  select count(*) filter(where l.status='SUCCEEDED')::integer calls,
    coalesce(sum(case when l.status='SUCCEEDED' then l.actual_cost_usd else l.estimated_cost_usd end),0)::numeric cost,
    count(*) filter(where l.status='SUCCEEDED' and ((q.organisation_id is null and q.campaign_id is null and q.company_id is null and q.id is not null) or x.id is not null))::integer background_calls,
    coalesce(sum(case when ((q.organisation_id is null and q.campaign_id is null and q.company_id is null and q.id is not null) or x.id is not null) then case when l.status='SUCCEEDED' then l.actual_cost_usd else l.estimated_cost_usd end else 0 end),0)::numeric background_cost
  from public.ai_usage_ledger l left join public.genesis_g8_discovery_repair_queue q on q.id=l.job_id left join public.genesis_g82_expansion_jobs x on x.id=l.job_id
  where l.organisation_id=p_system_organisation_id and l.job_type='GENESIS_G8_REPAIR' and l.created_at>=date_trunc('day',now()) and l.status in ('RESERVED','SUCCEEDED','FAILED')
), customer_repair as (
  select count(*) filter(where q.status='QUEUED' and (q.organisation_id is not null or q.campaign_id is not null or q.company_id is not null))::integer queued,
    count(*) filter(where q.status='CLAIMED' and (q.organisation_id is not null or q.campaign_id is not null or q.company_id is not null))::integer active
  from public.genesis_g8_discovery_repair_queue q
), daily_truth as (
  select s.entity_id,(array_agg(s.truth_index order by s.calculated_at asc))[1]::double precision first_truth,
    (array_agg(s.truth_index order by s.calculated_at desc))[1]::double precision last_truth
  from public.genesis_g8_truth_v2_snapshots s where s.calculated_at>=date_trunc('day',now()) group by s.entity_id
), gain as (select coalesce(sum(greatest(last_truth-first_truth,0)),0)::double precision truth_gain from daily_truth)
select coalesce((select autonomy_enabled from policy),false),coalesce((select daily_request_limit from policy),0),coalesce((select daily_cost_limit_usd from policy),0),
  coalesce((select requests from usage_today),0),coalesce((select cost from usage_today),0),coalesce((select calls from g8_calls),0),coalesce((select cost from g8_calls),0),
  coalesce((select background_calls from g8_calls),0),coalesce((select background_cost from g8_calls),0),
  (coalesce((select queued from customer_repair),0)+coalesce((select active from customer_repair),0))>0,
  coalesce((select queued from customer_repair),0),coalesce((select active from customer_repair),0),coalesce((select truth_gain from gain),0),
  case when coalesce((select calls from g8_calls),0)>0 then coalesce((select truth_gain from gain),0)/greatest((select calls from g8_calls),1) else 0 end;
$$;

-- Founder command centre now reads only MR-TI-2 truth state.
create or replace function public.genesis_g8_founder_intelligence_snapshot(p_since timestamptz default now()-interval '7 days')
returns jsonb language sql security definer set search_path=public as $$
with latest_truth as (
  select distinct on (s.entity_id) s.entity_id,s.truth_index,s.represented_confidence confidence,s.coverage,
    (s.review_state='HUMAN_REVIEW_REQUIRED') review_required,s.max_contradiction_severity review_priority_score,s.calculated_at
  from public.genesis_g8_truth_v2_snapshots s order by s.entity_id,s.calculated_at desc
), active_entities as (
  select e.*,t.truth_index,t.confidence,t.coverage,t.review_required,t.review_priority_score,t.calculated_at
  from public.genesis_g8_intelligence_entities e left join latest_truth t on t.entity_id=e.id
  where e.status='ACTIVE' and e.review_state<>'HUMAN_REJECTED'
), entity_type_health as (
  select e.entity_type,count(*)::integer entity_count,round(coalesce(avg(coalesce(e.truth_index,0)),0)::numeric,2)::double precision avg_truth_index,
    round(coalesce(avg(coalesce(e.confidence,0)),0)::numeric,2)::double precision avg_confidence,round(coalesce(avg(coalesce(e.coverage,0)),0)::numeric,2)::double precision avg_coverage,
    count(*) filter(where e.review_required)::integer review_required from active_entities e group by e.entity_type
), evidence_mix as (
  select count(*)::bigint total_evidence,count(*) filter(where intelligence_channel='KNOWLEDGE_INTELLIGENCE')::bigint knowledge_evidence,
    count(*) filter(where intelligence_channel='DISCOVERY_INTELLIGENCE')::bigint discovery_evidence,count(*) filter(where created_at>=p_since)::bigint evidence_added_period
  from public.genesis_g8_intelligence_evidence
), retrieval as (
  select count(*)::integer retrievals,coalesce(sum(candidates_inspected),0)::bigint inspected,coalesce(sum(candidates_matched),0)::bigint matched,
    coalesce(sum(ready_count),0)::bigint ready,coalesce(sum(ready_with_gaps_count),0)::bigint ready_with_gaps,coalesce(sum(refresh_required_count),0)::bigint refresh_required,
    coalesce(sum(human_review_required_count),0)::bigint human_review_required,coalesce(sum(discovery_required_count),0)::bigint discovery_required,
    round(coalesce(avg(latency_ms),0)::numeric,1)::double precision avg_latency_ms from public.genesis_g8_knowledge_retrieval_events where created_at>=p_since
), reuse as (
  select count(*)::integer links,count(distinct campaign_id)::integer campaigns,count(distinct genesis_g8_entity_id)::integer entities
  from public.genesis_g8_campaign_knowledge_links where created_at>=p_since
), repair as (
  select count(*) filter(where status='QUEUED')::integer queued,count(*) filter(where status='CLAIMED')::integer active,
    count(*) filter(where status='COMPLETED')::integer completed,count(*) filter(where status='FAILED')::integer failed,
    count(*) filter(where status in ('QUEUED','CLAIMED') and blocking_mode='BLOCKING_BEFORE_USE')::integer blocking,
    count(*) filter(where status in ('QUEUED','CLAIMED') and (organisation_id is not null or campaign_id is not null or company_id is not null))::integer customer_pending,
    count(*) filter(where status in ('QUEUED','CLAIMED') and organisation_id is null and campaign_id is null and company_id is null)::integer background_pending
  from public.genesis_g8_discovery_repair_queue
), refresh as (
  select count(*) filter(where created_at>=p_since)::integer considered_period,count(*) filter(where created_at>=p_since and status='QUEUED')::integer queued_period,
    round(coalesce(avg(priority_score) filter(where created_at>=p_since),0)::numeric,3)::double precision avg_priority from public.genesis_g8_background_refresh_events
), review as (select count(*) filter(where status='OPEN')::integer open_reviews from public.genesis_g8_founder_review_queue),
industry_health as (
  select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'name',coalesce(e.display_name,e.canonical_key),'canonicalKey',e.canonical_key,
    'truthIndex',coalesce(e.truth_index,0),'confidence',coalesce(e.confidence,0),'coverage',coalesce(e.coverage,0),'reviewRequired',coalesce(e.review_required,false))
    order by coalesce(e.truth_index,0) desc,e.canonical_key),'[]'::jsonb) value from active_entities e where e.entity_type='industry'
), demand as (
  select l.genesis_g8_entity_id,count(*)::integer uses from public.genesis_g8_campaign_knowledge_links l where l.created_at>=now()-interval '30 days' group by l.genesis_g8_entity_id
), attention as (
  select * from (
    select q.entity_id,'HUMAN_REVIEW'::text kind,coalesce(e.display_name,e.canonical_key,q.entity_id::text) label,coalesce(t.truth_index,0)::double precision truth_index,
      (100-coalesce(t.truth_index,0)+25)::double precision priority,'Founder judgement required'::text detail
    from public.genesis_g8_founder_review_queue q join public.genesis_g8_intelligence_entities e on e.id=q.entity_id left join latest_truth t on t.entity_id=q.entity_id where q.status='OPEN'
    union all
    select q.entity_id,'BLOCKING_REPAIR',coalesce(e.display_name,e.canonical_key,q.entity_id::text),coalesce(t.truth_index,0)::double precision,
      (100-coalesce(t.truth_index,0)+20)::double precision,concat('Blocking MR-TI-2 repair: ',q.claim_key)::text
    from public.genesis_g8_discovery_repair_queue q join public.genesis_g8_intelligence_entities e on e.id=q.entity_id left join latest_truth t on t.entity_id=q.entity_id
    where q.status in ('QUEUED','CLAIMED') and q.blocking_mode='BLOCKING_BEFORE_USE'
    union all
    select e.id,'HIGH_DEMAND_LOW_TRUTH',coalesce(e.display_name,e.canonical_key,e.id::text),coalesce(e.truth_index,0)::double precision,
      ((100-coalesce(e.truth_index,0))*least(d.uses,10)/10.0)::double precision,concat(d.uses,' recent campaign use',case when d.uses=1 then '' else 's' end)::text
    from active_entities e join demand d on d.genesis_g8_entity_id=e.id where coalesce(e.truth_index,0)<80
  ) a order by priority desc,entity_id limit 12
), attention_json as (
  select coalesce(jsonb_agg(jsonb_build_object('entityId',entity_id,'kind',kind,'label',label,'truthIndex',truth_index,'priority',priority,'detail',detail) order by priority desc),'[]'::jsonb) value from attention
), latest_capacity as (
  select row_to_json(x)::jsonb value from (select mode,capacity_used_ratio,background_budget_usd,background_spent_usd,maximum_background_repairs,truth_gain_today,truth_gain_per_repair_call,created_at
  from public.genesis_g8_capacity_budget_events order by created_at desc limit 1) x
)
select jsonb_build_object(
  'overall',jsonb_build_object('activeEntities',(select count(*) from active_entities),'suppressedEntities',(select count(*) from public.genesis_g8_intelligence_entities where status='SUPPRESSED'),
    'averageTruthIndex',(select round(coalesce(avg(coalesce(truth_index,0)),0)::numeric,2)::double precision from active_entities),
    'averageConfidence',(select round(coalesce(avg(coalesce(confidence,0)),0)::numeric,2)::double precision from active_entities),
    'averageCoverage',(select round(coalesce(avg(coalesce(coverage,0)),0)::numeric,2)::double precision from active_entities),
    'reviewRequired',(select count(*) from active_entities where review_required)),
  'entityTypes',(select coalesce(jsonb_agg(jsonb_build_object('entityType',entity_type,'count',entity_count,'truthIndex',avg_truth_index,'confidence',avg_confidence,'coverage',avg_coverage,'reviewRequired',review_required) order by entity_count desc),'[]'::jsonb) from entity_type_health),
  'evidence',(select to_jsonb(evidence_mix) from evidence_mix),'retrieval',(select to_jsonb(retrieval) from retrieval),'reuse',(select to_jsonb(reuse) from reuse),
  'repairs',(select to_jsonb(repair) from repair),'refresh',(select to_jsonb(refresh) from refresh),'reviews',(select to_jsonb(review) from review),
  'industries',(select value from industry_health),'attention',(select value from attention_json),'latestCapacity',(select value from latest_capacity));
$$;

-- Human review receipts now link to V2 snapshots; legacy FK remains nullable for historical rows.
alter table public.genesis_g8_human_review_receipts add column if not exists truth_v2_snapshot_id uuid references public.genesis_g8_truth_v2_snapshots(id) on delete set null;
create index if not exists genesis_g8_human_review_truth_v2_idx on public.genesis_g8_human_review_receipts(truth_v2_snapshot_id);
create or replace function public.resolve_genesis_g8_founder_review(
  p_review_task_id uuid,p_action text,p_reason_code text default null,p_note text default null,p_correction jsonb default null,p_resolution_actor text default 'FOUNDER_DASHBOARD'
) returns table(review_task_id uuid,entity_id uuid,entity_type text,action text,receipt_id uuid,created boolean,claim_keys_json jsonb,reasons_json jsonb)
language plpgsql security definer set search_path=public as $$
declare v_task public.genesis_g8_founder_review_queue%rowtype; v_receipt_id uuid; v_snapshot_id uuid; v_created boolean:=false; v_review_state text; v_entity_status text;
begin
  if p_action not in ('APPROVE','CORRECT','REJECT','MORE_RESEARCH') then raise exception 'GENESIS_G8_INVALID_REVIEW_ACTION'; end if;
  if p_action='CORRECT' and nullif(trim(coalesce(p_note,'')),'') is null and coalesce(p_correction,'{}'::jsonb)='{}'::jsonb then raise exception 'GENESIS_G8_CORRECTION_REQUIRED'; end if;
  select * into v_task from public.genesis_g8_founder_review_queue where id=p_review_task_id for update;
  if v_task.id is null then raise exception 'GENESIS_G8_REVIEW_TASK_NOT_FOUND'; end if;
  if v_task.status='RESOLVED' then return query select v_task.id,v_task.entity_id,v_task.entity_type,coalesce(v_task.resolution_action,p_action),v_task.resolution_receipt_id,false,v_task.claim_keys_json,v_task.reasons_json; return; end if;
  if v_task.status<>'OPEN' then raise exception 'GENESIS_G8_REVIEW_TASK_NOT_OPEN'; end if;
  select id into v_snapshot_id from public.genesis_g8_truth_v2_snapshots s where s.entity_id=v_task.entity_id order by s.calculated_at desc,s.created_at desc limit 1;
  v_review_state:=case p_action when 'APPROVE' then 'HUMAN_APPROVED' when 'CORRECT' then 'HUMAN_CORRECTED' when 'REJECT' then 'HUMAN_REJECTED' else 'UNREVIEWED' end;
  v_entity_status:=case when p_action='REJECT' then 'SUPPRESSED' else 'ACTIVE' end;
  update public.genesis_g8_intelligence_entities set review_state=v_review_state,status=v_entity_status,updated_at=now() where id=v_task.entity_id;
  insert into public.genesis_g8_human_review_receipts(entity_id,action,reason_code,note,correction_json,reviewer_user_id,truth_snapshot_id,truth_v2_snapshot_id,review_task_id)
  values(v_task.entity_id,p_action,nullif(trim(coalesce(p_reason_code,'')),''),nullif(trim(coalesce(p_note,'')),''),p_correction,null,null,v_snapshot_id,v_task.id)
  on conflict(review_task_id) where review_task_id is not null do nothing returning id into v_receipt_id;
  if v_receipt_id is not null then v_created:=true; else select id into v_receipt_id from public.genesis_g8_human_review_receipts where review_task_id=v_task.id; end if;
  update public.genesis_g8_founder_review_queue set status='RESOLVED',resolution_action=p_action,resolution_reason_code=nullif(trim(coalesce(p_reason_code,'')),''),
    resolution_note=nullif(trim(coalesce(p_note,'')),''),resolution_correction_json=p_correction,resolution_receipt_id=v_receipt_id,
    resolution_actor=coalesce(nullif(trim(p_resolution_actor),''),'FOUNDER_DASHBOARD'),resolved_at=now(),updated_at=now() where id=v_task.id;
  if p_action='REJECT' then update public.genesis_g8_discovery_repair_queue set status='CANCELLED',last_error='FOUNDER_REJECTED_ENTITY',updated_at=now() where entity_id=v_task.entity_id and status='QUEUED'; end if;
  return query select v_task.id,v_task.entity_id,v_task.entity_type,p_action,v_receipt_id,v_created,v_task.claim_keys_json,v_task.reasons_json;
end $$;

-- Rebuild all current company projections from V2 state immediately.
do $$ declare r record; begin for r in select id from public.genesis_g8_intelligence_entities where entity_type='company' loop perform public.refresh_genesis_g8_company_search_projection(r.id); end loop; end $$;

revoke all on function public.mrti2_result_claim_probability(jsonb,text) from public,anon,authenticated;
grant execute on function public.mrti2_result_claim_probability(jsonb,text) to service_role;
revoke all on function public.genesis_g8_capacity_budget_snapshot(uuid) from public,anon,authenticated;
grant execute on function public.genesis_g8_capacity_budget_snapshot(uuid) to service_role;
revoke all on function public.genesis_g8_founder_intelligence_snapshot(timestamptz) from public,anon,authenticated;
grant execute on function public.genesis_g8_founder_intelligence_snapshot(timestamptz) to service_role;
revoke all on function public.resolve_genesis_g8_founder_review(uuid,text,text,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.resolve_genesis_g8_founder_review(uuid,text,text,text,jsonb,text) to service_role;

-- Hard-isolate TI-1 persistence surfaces. Historical rows remain readable to the
-- service role, but production code can no longer append new TI-1 snapshots or
-- use the old review RPC that accepts a TI-1 snapshot id.
drop function if exists public.insert_genesis_g8_truth_snapshot(uuid,text,text,double precision,double precision,double precision,double precision,boolean,double precision,jsonb,jsonb,timestamptz);
drop function if exists public.record_genesis_g8_human_review(uuid,text,uuid,text,text,jsonb,uuid);
drop function if exists public.genesis_g8_result_claim_confidence(jsonb,text);
revoke insert,update,delete on public.genesis_g8_truth_snapshots from service_role;
grant select on public.genesis_g8_truth_snapshots to service_role;
