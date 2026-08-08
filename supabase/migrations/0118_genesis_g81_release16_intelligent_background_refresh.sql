-- Genesis G8.1 Release 16 — Intelligent Background Refresh.
-- Proactively refreshes decaying public claims by creating the same exact repair
-- contracts consumed by R9. Live customer-scoped work always outranks background work.

create table if not exists public.genesis_g8_background_refresh_events (
  id uuid primary key default gen_random_uuid(),
  dispatch_key text not null unique,
  refresh_version text not null,
  entity_id uuid not null references public.genesis_g8_intelligence_entities(id) on delete cascade,
  claim_id uuid not null references public.genesis_g8_intelligence_claims(id) on delete cascade,
  claim_key text not null,
  criticality text not null check (criticality in ('CRITICAL','REQUIRED','SUPPORTING','OPTIONAL')),
  priority_score double precision not null default 0,
  freshness double precision not null default 0 check (freshness between 0 and 1),
  status text not null default 'QUEUED' check (status in ('QUEUED','SKIPPED')),
  detail text,
  created_at timestamptz not null default now()
);
create index if not exists genesis_g8_background_refresh_entity_idx on public.genesis_g8_background_refresh_events(entity_id,created_at desc);
create index if not exists genesis_g8_background_refresh_priority_idx on public.genesis_g8_background_refresh_events(status,priority_score desc,created_at);
alter table public.genesis_g8_background_refresh_events enable row level security;
revoke all on public.genesis_g8_background_refresh_events from public,anon,authenticated;
grant select,insert on public.genesis_g8_background_refresh_events to service_role;

create or replace function public.genesis_g8_background_refresh_live_demand()
returns table(live_customer_work_pending boolean)
language sql security definer set search_path=public as $$
  select exists(
    select 1 from public.genesis_g8_discovery_repair_queue q
     where q.status in ('QUEUED','CLAIMED')
       and (q.organisation_id is not null or q.campaign_id is not null or q.company_id is not null)
  );
$$;

create or replace function public.list_genesis_g8_background_refresh_candidates(
  p_limit integer default 20,
  p_maximum_freshness double precision default 0.72,
  p_minimum_priority double precision default 0.45,
  p_now timestamptz default now()
) returns table(
  entity_id uuid,
  entity_type text,
  claim_id uuid,
  claim_key text,
  claim_label text,
  criticality text,
  freshness_half_life_days integer,
  latest_evidence_at timestamptz,
  freshness double precision,
  truth_index double precision,
  recent_campaign_uses integer,
  priority_score double precision
)
language sql security definer set search_path=public as $$
with latest_truth as (
  select distinct on (s.entity_id) s.entity_id,s.truth_index
  from public.genesis_g8_truth_snapshots s
  order by s.entity_id,s.calculated_at desc
), evidence_age as (
  select c.id claim_id,max(e.observed_at) latest_evidence_at
  from public.genesis_g8_intelligence_claims c
  left join public.genesis_g8_intelligence_evidence e on e.claim_id=c.id
  group by c.id
), demand as (
  select l.genesis_g8_entity_id entity_id,count(*)::integer recent_campaign_uses
  from public.genesis_g8_campaign_knowledge_links l
  where l.created_at >= p_now - interval '30 days'
  group by l.genesis_g8_entity_id
), scored as (
  select
    e.id entity_id,e.entity_type,c.id claim_id,c.claim_key,c.label claim_label,c.criticality,
    c.freshness_half_life_days,
    a.latest_evidence_at,
    case
      when a.latest_evidence_at is null then 0::double precision
      else power(0.5::double precision,
        greatest(0,extract(epoch from (p_now-a.latest_evidence_at))/86400.0) / greatest(c.freshness_half_life_days,1))
    end freshness,
    coalesce(t.truth_index,0)::double precision truth_index,
    coalesce(d.recent_campaign_uses,0)::integer recent_campaign_uses,
    (
      (1 - case
        when a.latest_evidence_at is null then 0::double precision
        else power(0.5::double precision,
          greatest(0,extract(epoch from (p_now-a.latest_evidence_at))/86400.0) / greatest(c.freshness_half_life_days,1))
      end)
      * case c.criticality when 'CRITICAL' then 4.0 when 'REQUIRED' then 2.8 when 'SUPPORTING' then 1.4 else 0.55 end
      * (1 + least(coalesce(d.recent_campaign_uses,0),4) * 0.65)
      * (0.75 + least(coalesce(t.truth_index,0),100) / 400.0)
    )::double precision priority_score
  from public.genesis_g8_intelligence_entities e
  join public.genesis_g8_intelligence_claims c on c.entity_id=e.id
  left join evidence_age a on a.claim_id=c.id
  left join latest_truth t on t.entity_id=e.id
  left join demand d on d.entity_id=e.id
  where e.status='ACTIVE' and e.review_state<>'HUMAN_REJECTED'
    and not exists(
      select 1 from public.genesis_g8_discovery_repair_queue q
      where q.claim_id=c.id and q.status in ('QUEUED','CLAIMED')
    )
)
select s.entity_id,s.entity_type,s.claim_id,s.claim_key,s.claim_label,s.criticality,
       s.freshness_half_life_days,s.latest_evidence_at,s.freshness,s.truth_index,
       s.recent_campaign_uses,s.priority_score
from scored s
where s.freshness <= greatest(0.05,least(0.99,p_maximum_freshness))
  and s.priority_score >= greatest(0,p_minimum_priority)
order by s.priority_score desc,
  case s.criticality when 'CRITICAL' then 1 when 'REQUIRED' then 2 when 'SUPPORTING' then 3 else 4 end,
  s.entity_id,s.claim_key
limit greatest(1,least(coalesce(p_limit,20),100));
$$;

create or replace function public.enqueue_genesis_g8_background_refresh(
  p_dispatch_key text,
  p_refresh_version text,
  p_entity_id uuid,
  p_entity_type text,
  p_claim_id uuid,
  p_claim_key text,
  p_claim_label text,
  p_criticality text,
  p_priority_score double precision,
  p_freshness double precision
) returns table(queued boolean,detail text)
language plpgsql security definer set search_path=public as $$
declare
  v_dispatch_id uuid;
  v_event_id uuid;
  v_blocking text;
  v_minimum integer;
begin
  if exists(
    select 1 from public.genesis_g8_discovery_repair_queue q
    where q.claim_id=p_claim_id and q.status in ('QUEUED','CLAIMED')
  ) then
    return query select false,'Existing repair already owns this claim.'::text;
    return;
  end if;
  if not exists(
    select 1 from public.genesis_g8_intelligence_claims c
    where c.id=p_claim_id and c.entity_id=p_entity_id and c.claim_key=p_claim_key
  ) then raise exception 'GENESIS_G8_BACKGROUND_REFRESH_CLAIM_MISMATCH'; end if;

  v_blocking := case when p_criticality in ('CRITICAL','REQUIRED') then 'NON_BLOCKING' else 'NON_BLOCKING' end;
  select minimum_evidence into v_minimum from public.genesis_g8_intelligence_claims where id=p_claim_id;

  insert into public.genesis_g8_production_dispatches(
    dispatch_key,boundary_version,dispatch_version,entity_id,instruction_kind,blocking_mode,execution_target,
    workflow_ref,payload_json,private_workflow_json,status,outcome,detail,completed_at
  ) values (
    p_dispatch_key,'G8.1-R16-BACKGROUND-REFRESH','G8.1-R16-BACKGROUND-REFRESH',p_entity_id,'DISCOVERY_REPAIR',v_blocking,
    'DISCOVERY_INTELLIGENCE','BACKGROUND_REFRESH',
    jsonb_build_object('claimId',p_claim_id,'claimKey',p_claim_key,'claimLabel',p_claim_label,'priorityScore',p_priority_score,'freshness',p_freshness),
    '{}'::jsonb,'COMPLETED','REPAIR_QUEUED','Proactive exact claim refresh queued.',now()
  ) on conflict(dispatch_key) do nothing returning id into v_dispatch_id;

  if v_dispatch_id is null then
    return query select false,'Refresh window already dispatched.'::text;
    return;
  end if;

  insert into public.genesis_g8_discovery_repair_queue(
    dispatch_key,entity_id,entity_type,claim_id,claim_key,repair_mode,objective,criticality,
    minimum_evidence,additional_evidence_needed,blocking_mode
  ) values (
    p_dispatch_key,p_entity_id,p_entity_type,p_claim_id,p_claim_key,'REFRESH_STALE_EVIDENCE',
    'Refresh public evidence for "'||left(p_claim_label,300)||'". Return only current verifiable evidence and do not repeat unrelated known facts.',
    p_criticality,greatest(coalesce(v_minimum,1),1),1,v_blocking
  );

  insert into public.genesis_g8_background_refresh_events(
    dispatch_key,refresh_version,entity_id,claim_id,claim_key,criticality,priority_score,freshness,status,detail
  ) values (
    p_dispatch_key,left(coalesce(p_refresh_version,'unknown'),120),p_entity_id,p_claim_id,p_claim_key,p_criticality,
    greatest(coalesce(p_priority_score,0),0),greatest(0,least(1,coalesce(p_freshness,0))),'QUEUED','Exact repair queued through existing R9 consumption path.'
  ) returning id into v_event_id;

  return query select true,'Exact background refresh queued.'::text;
end $$;

revoke all on function public.genesis_g8_background_refresh_live_demand() from public,anon,authenticated;
revoke all on function public.list_genesis_g8_background_refresh_candidates(integer,double precision,double precision,timestamptz) from public,anon,authenticated;
revoke all on function public.enqueue_genesis_g8_background_refresh(text,text,uuid,text,uuid,text,text,text,double precision,double precision) from public,anon,authenticated;
grant execute on function public.genesis_g8_background_refresh_live_demand() to service_role;
grant execute on function public.list_genesis_g8_background_refresh_candidates(integer,double precision,double precision,timestamptz) to service_role;
grant execute on function public.enqueue_genesis_g8_background_refresh(text,text,uuid,text,uuid,text,text,text,double precision,double precision) to service_role;

comment on table public.genesis_g8_background_refresh_events is 'R16 audit trail of proactive freshness decisions. Background refresh schedules exact R9 repair contracts and never owns model execution itself.';
