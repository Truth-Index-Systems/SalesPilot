-- Genesis G8.1 Release 17 — Knowledge Scheduler & Capacity Budgeting.
-- Uses the existing AI governance ceiling as the hard boundary, then allocates only
-- spare capacity to background Knowledge Intelligence. Customer work always wins.

create table if not exists public.genesis_g8_capacity_budget_events (
  id uuid primary key default gen_random_uuid(),
  budget_version text not null,
  mode text not null check (mode in ('NORMAL','CONSERVATIVE','CUSTOMER_ONLY','PAUSED')),
  capacity_used_ratio double precision not null default 0,
  background_budget_usd numeric(12,6) not null default 0,
  background_spent_usd numeric(12,6) not null default 0,
  maximum_background_repairs integer not null default 0,
  truth_gain_today double precision not null default 0,
  truth_gain_per_repair_call double precision not null default 0,
  detail_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists genesis_g8_capacity_budget_events_created_idx on public.genesis_g8_capacity_budget_events(created_at desc);
alter table public.genesis_g8_capacity_budget_events enable row level security;
revoke all on public.genesis_g8_capacity_budget_events from public,anon,authenticated;
grant select,insert on public.genesis_g8_capacity_budget_events to service_role;

create or replace function public.genesis_g8_capacity_budget_snapshot(p_system_organisation_id uuid)
returns table(
  governance_enabled boolean,
  daily_request_limit integer,
  daily_cost_limit_usd numeric,
  requests_today integer,
  cost_today_usd numeric,
  g8_repair_calls_today integer,
  g8_repair_cost_today_usd numeric,
  background_repair_calls_today integer,
  background_repair_cost_today_usd numeric,
  live_customer_work_pending boolean,
  queued_customer_repairs integer,
  active_customer_repairs integer,
  truth_gain_today double precision,
  truth_gain_per_repair_call double precision
)
language sql security definer set search_path=public as $$
with policy as (
  select p.autonomy_enabled,p.daily_request_limit,p.daily_cost_limit_usd
  from public.ai_governance_policies p where p.organisation_id=p_system_organisation_id
), usage_today as (
  select count(*)::integer requests,
         coalesce(sum(case when l.status='SUCCEEDED' then l.actual_cost_usd else l.estimated_cost_usd end),0)::numeric cost
  from public.ai_usage_ledger l
  where l.organisation_id=p_system_organisation_id
    and l.created_at>=date_trunc('day',now())
    and l.status in ('RESERVED','SUCCEEDED','FAILED')
), repairs as (
  select count(*) filter(where l.status='SUCCEEDED')::integer calls,
         coalesce(sum(case when l.status='SUCCEEDED' then l.actual_cost_usd else l.estimated_cost_usd end),0)::numeric cost,
         count(*) filter(where l.status='SUCCEEDED' and q.organisation_id is null and q.campaign_id is null and q.company_id is null)::integer background_calls,
         coalesce(sum(case when q.organisation_id is null and q.campaign_id is null and q.company_id is null then
           case when l.status='SUCCEEDED' then l.actual_cost_usd else l.estimated_cost_usd end else 0 end),0)::numeric background_cost
  from public.ai_usage_ledger l
  left join public.genesis_g8_discovery_repair_queue q on q.id=l.job_id
  where l.organisation_id=p_system_organisation_id and l.job_type='GENESIS_G8_REPAIR'
    and l.created_at>=date_trunc('day',now()) and l.status in ('RESERVED','SUCCEEDED','FAILED')
), customer_repair as (
  select
    count(*) filter(where q.status='QUEUED' and (q.organisation_id is not null or q.campaign_id is not null or q.company_id is not null))::integer queued,
    count(*) filter(where q.status='CLAIMED' and (q.organisation_id is not null or q.campaign_id is not null or q.company_id is not null))::integer active
  from public.genesis_g8_discovery_repair_queue q
), daily_truth as (
  select s.entity_id,
         (array_agg(s.truth_index order by s.calculated_at asc))[1]::double precision first_truth,
         (array_agg(s.truth_index order by s.calculated_at desc))[1]::double precision last_truth
  from public.genesis_g8_truth_snapshots s
  where s.calculated_at>=date_trunc('day',now())
  group by s.entity_id
), gain as (
  select coalesce(sum(greatest(last_truth-first_truth,0)),0)::double precision truth_gain from daily_truth
)
select
  coalesce((select autonomy_enabled from policy),false),
  coalesce((select daily_request_limit from policy),0),
  coalesce((select daily_cost_limit_usd from policy),0),
  coalesce((select requests from usage_today),0),
  coalesce((select cost from usage_today),0),
  coalesce((select calls from repairs),0),
  coalesce((select cost from repairs),0),
  coalesce((select background_calls from repairs),0),
  coalesce((select background_cost from repairs),0),
  (coalesce((select queued from customer_repair),0)+coalesce((select active from customer_repair),0))>0,
  coalesce((select queued from customer_repair),0),
  coalesce((select active from customer_repair),0),
  coalesce((select truth_gain from gain),0),
  case when coalesce((select calls from repairs),0)>0
    then coalesce((select truth_gain from gain),0)/greatest((select calls from repairs),1)
    else 0 end;
$$;

create or replace function public.record_genesis_g8_capacity_budget_event(
  p_budget_version text,p_mode text,p_capacity_used_ratio double precision,
  p_background_budget_usd numeric,p_background_spent_usd numeric,p_maximum_background_repairs integer,
  p_truth_gain_today double precision,p_truth_gain_per_repair_call double precision,p_detail jsonb default '{}'::jsonb
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid;
begin
  insert into public.genesis_g8_capacity_budget_events(
    budget_version,mode,capacity_used_ratio,background_budget_usd,background_spent_usd,
    maximum_background_repairs,truth_gain_today,truth_gain_per_repair_call,detail_json
  ) values (
    left(coalesce(p_budget_version,'unknown'),120),p_mode,greatest(coalesce(p_capacity_used_ratio,0),0),
    greatest(coalesce(p_background_budget_usd,0),0),greatest(coalesce(p_background_spent_usd,0),0),
    greatest(coalesce(p_maximum_background_repairs,0),0),coalesce(p_truth_gain_today,0),coalesce(p_truth_gain_per_repair_call,0),coalesce(p_detail,'{}'::jsonb)
  ) returning id into v_id;
  return v_id;
end $$;

revoke all on function public.genesis_g8_capacity_budget_snapshot(uuid) from public,anon,authenticated;
revoke all on function public.record_genesis_g8_capacity_budget_event(text,text,double precision,numeric,numeric,integer,double precision,double precision,jsonb) from public,anon,authenticated;
grant execute on function public.genesis_g8_capacity_budget_snapshot(uuid) to service_role;
grant execute on function public.record_genesis_g8_capacity_budget_event(text,text,double precision,numeric,numeric,integer,double precision,double precision,jsonb) to service_role;

comment on table public.genesis_g8_capacity_budget_events is 'R17 audit trail for deterministic Genesis capacity allocation. AI governance remains the hard spend authority; R17 only allocates spare capacity.';
