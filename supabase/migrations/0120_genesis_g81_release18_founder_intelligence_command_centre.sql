-- Genesis G8.1 Release 18 — Founder Intelligence Command Centre.
-- Compact service-role aggregate read model for the protected founder dashboard.
-- No Truth state is mutated and no background work is scheduled by this function.

create or replace function public.genesis_g8_founder_intelligence_snapshot(
  p_since timestamptz default now() - interval '7 days'
) returns jsonb
language sql security definer set search_path=public as $$
with latest_truth as (
  select distinct on (s.entity_id)
    s.entity_id,s.truth_index,s.confidence,s.coverage,s.review_required,s.review_priority_score,s.calculated_at
  from public.genesis_g8_truth_snapshots s
  order by s.entity_id,s.calculated_at desc
), active_entities as (
  select e.*,t.truth_index,t.confidence,t.coverage,t.review_required,t.review_priority_score,t.calculated_at
  from public.genesis_g8_intelligence_entities e
  left join latest_truth t on t.entity_id=e.id
  where e.status='ACTIVE' and e.review_state<>'HUMAN_REJECTED'
), entity_type_health as (
  select e.entity_type,
    count(*)::integer entity_count,
    round(coalesce(avg(coalesce(e.truth_index,0)),0)::numeric,2)::double precision avg_truth_index,
    round(coalesce(avg(coalesce(e.confidence,0)),0)::numeric,2)::double precision avg_confidence,
    round(coalesce(avg(coalesce(e.coverage,0)),0)::numeric,2)::double precision avg_coverage,
    count(*) filter(where e.review_required)::integer review_required
  from active_entities e group by e.entity_type
), evidence_mix as (
  select
    count(*)::bigint total_evidence,
    count(*) filter(where intelligence_channel='KNOWLEDGE_INTELLIGENCE')::bigint knowledge_evidence,
    count(*) filter(where intelligence_channel='DISCOVERY_INTELLIGENCE')::bigint discovery_evidence,
    count(*) filter(where created_at>=p_since)::bigint evidence_added_period
  from public.genesis_g8_intelligence_evidence
), retrieval as (
  select
    count(*)::integer retrievals,
    coalesce(sum(candidates_inspected),0)::bigint inspected,
    coalesce(sum(candidates_matched),0)::bigint matched,
    coalesce(sum(ready_count),0)::bigint ready,
    coalesce(sum(ready_with_gaps_count),0)::bigint ready_with_gaps,
    coalesce(sum(refresh_required_count),0)::bigint refresh_required,
    coalesce(sum(human_review_required_count),0)::bigint human_review_required,
    coalesce(sum(discovery_required_count),0)::bigint discovery_required,
    round(coalesce(avg(latency_ms),0)::numeric,1)::double precision avg_latency_ms
  from public.genesis_g8_knowledge_retrieval_events where created_at>=p_since
), reuse as (
  select count(*)::integer links,
    count(distinct campaign_id)::integer campaigns,
    count(distinct genesis_g8_entity_id)::integer entities
  from public.genesis_g8_campaign_knowledge_links where created_at>=p_since
), repair as (
  select
    count(*) filter(where status='QUEUED')::integer queued,
    count(*) filter(where status='CLAIMED')::integer active,
    count(*) filter(where status='COMPLETED')::integer completed,
    count(*) filter(where status='FAILED')::integer failed,
    count(*) filter(where status in ('QUEUED','CLAIMED') and blocking_mode='BLOCKING')::integer blocking,
    count(*) filter(where status in ('QUEUED','CLAIMED') and (organisation_id is not null or campaign_id is not null or company_id is not null))::integer customer_pending,
    count(*) filter(where status in ('QUEUED','CLAIMED') and organisation_id is null and campaign_id is null and company_id is null)::integer background_pending
  from public.genesis_g8_discovery_repair_queue
), refresh as (
  select
    count(*) filter(where created_at>=p_since)::integer considered_period,
    count(*) filter(where created_at>=p_since and status='QUEUED')::integer queued_period,
    round(coalesce(avg(priority_score) filter(where created_at>=p_since),0)::numeric,3)::double precision avg_priority
  from public.genesis_g8_background_refresh_events
), review as (
  select count(*) filter(where status='OPEN')::integer open_reviews from public.genesis_g8_founder_review_queue
), industry_health as (
  select coalesce(jsonb_agg(jsonb_build_object(
      'id',e.id,'name',coalesce(e.display_name,e.canonical_key),'canonicalKey',e.canonical_key,
      'truthIndex',coalesce(e.truth_index,0),'confidence',coalesce(e.confidence,0),'coverage',coalesce(e.coverage,0),
      'reviewRequired',coalesce(e.review_required,false)
    ) order by coalesce(e.truth_index,0) desc,e.canonical_key),'[]'::jsonb) value
  from active_entities e where e.entity_type='industry'
), demand as (
  select l.genesis_g8_entity_id,count(*)::integer uses
  from public.genesis_g8_campaign_knowledge_links l
  where l.created_at>=now()-interval '30 days'
  group by l.genesis_g8_entity_id
), attention as (
  select * from (
    select q.entity_id,'HUMAN_REVIEW'::text kind,
      coalesce(e.display_name,e.canonical_key,q.entity_id::text) label,
      coalesce(q.truth_index,0)::double precision truth_index,
      (100-coalesce(q.truth_index,0)+25)::double precision priority,
      'Founder judgement required'::text detail
    from public.genesis_g8_founder_review_queue q
    join public.genesis_g8_intelligence_entities e on e.id=q.entity_id
    where q.status='OPEN'
    union all
    select q.entity_id,'BLOCKING_REPAIR',coalesce(e.display_name,e.canonical_key,q.entity_id::text),
      coalesce(t.truth_index,0)::double precision,
      (100-coalesce(t.truth_index,0)+20)::double precision,
      concat('Blocking repair: ',q.claim_key)::text
    from public.genesis_g8_discovery_repair_queue q
    join public.genesis_g8_intelligence_entities e on e.id=q.entity_id
    left join latest_truth t on t.entity_id=q.entity_id
    where q.status in ('QUEUED','CLAIMED') and q.blocking_mode='BLOCKING'
    union all
    select e.id,'HIGH_DEMAND_LOW_TRUTH',coalesce(e.display_name,e.canonical_key,e.id::text),
      coalesce(e.truth_index,0)::double precision,
      ((100-coalesce(e.truth_index,0))*least(d.uses,10)/10.0)::double precision,
      concat(d.uses,' recent campaign use',case when d.uses=1 then '' else 's' end)::text
    from active_entities e join demand d on d.genesis_g8_entity_id=e.id
    where coalesce(e.truth_index,0)<80
  ) a
  order by priority desc,entity_id
  limit 12
), attention_json as (
  select coalesce(jsonb_agg(jsonb_build_object(
    'entityId',entity_id,'kind',kind,'label',label,'truthIndex',truth_index,'priority',priority,'detail',detail
  ) order by priority desc),'[]'::jsonb) value from attention
), latest_capacity as (
  select row_to_json(x)::jsonb value from (
    select mode,capacity_used_ratio,background_budget_usd,background_spent_usd,maximum_background_repairs,
      truth_gain_today,truth_gain_per_repair_call,created_at
    from public.genesis_g8_capacity_budget_events order by created_at desc limit 1
  ) x
)
select jsonb_build_object(
  'overall',jsonb_build_object(
    'activeEntities',(select count(*) from active_entities),
    'suppressedEntities',(select count(*) from public.genesis_g8_intelligence_entities where status='SUPPRESSED'),
    'averageTruthIndex',(select round(coalesce(avg(coalesce(truth_index,0)),0)::numeric,2)::double precision from active_entities),
    'averageConfidence',(select round(coalesce(avg(coalesce(confidence,0)),0)::numeric,2)::double precision from active_entities),
    'averageCoverage',(select round(coalesce(avg(coalesce(coverage,0)),0)::numeric,2)::double precision from active_entities),
    'reviewRequired',(select count(*) from active_entities where review_required)
  ),
  'entityTypes',(select coalesce(jsonb_agg(jsonb_build_object(
    'entityType',entity_type,'count',entity_count,'truthIndex',avg_truth_index,'confidence',avg_confidence,'coverage',avg_coverage,'reviewRequired',review_required
  ) order by entity_count desc),'[]'::jsonb) from entity_type_health),
  'evidence',(select to_jsonb(evidence_mix) from evidence_mix),
  'retrieval',(select to_jsonb(retrieval) from retrieval),
  'reuse',(select to_jsonb(reuse) from reuse),
  'repairs',(select to_jsonb(repair) from repair),
  'refresh',(select to_jsonb(refresh) from refresh),
  'reviews',(select to_jsonb(review) from review),
  'industries',(select value from industry_health),
  'attention',(select value from attention_json),
  'latestCapacity',(select value from latest_capacity)
);
$$;

revoke all on function public.genesis_g8_founder_intelligence_snapshot(timestamptz) from public,anon,authenticated;
grant execute on function public.genesis_g8_founder_intelligence_snapshot(timestamptz) to service_role;

comment on function public.genesis_g8_founder_intelligence_snapshot(timestamptz) is 'R18 compact read-only Founder Intelligence Command Centre snapshot derived from latest immutable G8 Truth state and operational queues.';
