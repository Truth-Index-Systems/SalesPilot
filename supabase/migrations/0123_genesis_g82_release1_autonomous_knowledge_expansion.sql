-- Genesis G8.2 R1 — Autonomous Knowledge Expansion Activation
-- Adds a service-role-only expansion queue and ten initial industry targets.
-- G8.1 Truth/evidence tables remain authoritative.

create table if not exists public.genesis_g82_expansion_targets (
  id uuid primary key default gen_random_uuid(),
  industry_key text not null unique,
  display_name text not null,
  priority integer not null default 50 check (priority between 0 and 100),
  target_company_count integer not null default 5000 check (target_company_count > 0),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.genesis_g82_expansion_membership (
  target_id uuid not null references public.genesis_g82_expansion_targets(id) on delete cascade,
  entity_id uuid not null references public.genesis_g8_intelligence_entities(id) on delete cascade,
  entity_type text not null check (entity_type in ('company','contact','route')),
  canonical_domain text,
  created_at timestamptz not null default now(),
  primary key(target_id, entity_id)
);
create index if not exists genesis_g82_expansion_membership_target_idx
  on public.genesis_g82_expansion_membership(target_id, entity_type, created_at desc);

create table if not exists public.genesis_g82_expansion_jobs (
  id uuid primary key default gen_random_uuid(),
  target_id uuid not null references public.genesis_g82_expansion_targets(id) on delete cascade,
  industry_key text not null,
  industry_name text not null,
  status text not null default 'QUEUED' check (status in ('QUEUED','CLAIMED','COMPLETED','FAILED')),
  cycle_key text not null,
  attempt_count integer not null default 0,
  lease_token uuid,
  lease_expires_at timestamptz,
  worker_id text,
  excluded_domains jsonb not null default '[]'::jsonb,
  companies_found integer not null default 0,
  companies_persisted integer not null default 0,
  contacts_persisted integer not null default 0,
  routes_persisted integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  unique(target_id, cycle_key)
);
create index if not exists genesis_g82_expansion_jobs_claim_idx
  on public.genesis_g82_expansion_jobs(status, created_at, target_id);

alter table public.genesis_g82_expansion_targets enable row level security;
alter table public.genesis_g82_expansion_membership enable row level security;
alter table public.genesis_g82_expansion_jobs enable row level security;
revoke all on public.genesis_g82_expansion_targets from anon, authenticated;
revoke all on public.genesis_g82_expansion_membership from anon, authenticated;
revoke all on public.genesis_g82_expansion_jobs from anon, authenticated;

insert into public.genesis_g82_expansion_targets(industry_key,display_name,priority,target_company_count)
values
 ('software','Software & SaaS',100,10000),
 ('professional-services','Professional Services',95,8000),
 ('marketing','Marketing & Advertising',90,7000),
 ('recruitment','Recruitment & HR',90,7000),
 ('finance','Finance & FinTech',85,7000),
 ('healthcare','Healthcare & HealthTech',85,7000),
 ('retail','Retail & E-commerce',80,7000),
 ('manufacturing','Manufacturing',80,7000),
 ('logistics','Logistics & Supply Chain',80,7000),
 ('construction','Construction & PropTech',75,6000)
on conflict(industry_key) do nothing;

create or replace function public.ensure_genesis_g82_expansion_backlog(p_limit integer default 1)
returns table(job_id uuid, industry_key text, industry_name text)
language plpgsql security definer set search_path=public as $$
declare
  r record;
  v_job uuid;
  v_cycle text := to_char((now() at time zone 'utc'), 'YYYYMMDDHH24MI');
begin
  for r in
    select t.*,
      count(m.entity_id) filter (where m.entity_type='company')::integer as company_count
    from public.genesis_g82_expansion_targets t
    left join public.genesis_g82_expansion_membership m on m.target_id=t.id
    where t.enabled=true
      and not exists (
        select 1 from public.genesis_g82_expansion_jobs j
        where j.target_id=t.id and j.status in ('QUEUED','CLAIMED')
      )
    group by t.id
    having count(m.entity_id) filter (where m.entity_type='company') < t.target_company_count
    order by
      (count(m.entity_id) filter (where m.entity_type='company')::numeric / greatest(t.target_company_count,1)) asc,
      t.priority desc,
      t.industry_key asc
    limit greatest(1,least(coalesce(p_limit,1),10))
  loop
    insert into public.genesis_g82_expansion_jobs(
      target_id,industry_key,industry_name,cycle_key,excluded_domains
    ) values (
      r.id,r.industry_key,r.display_name,
      v_cycle || ':' || replace(r.industry_key,'-','_'),
      coalesce((
        select jsonb_agg(x.canonical_domain order by x.created_at desc)
        from (
          select canonical_domain, created_at
          from public.genesis_g82_expansion_membership
          where target_id=r.id and entity_type='company' and canonical_domain is not null
          order by created_at desc limit 250
        ) x
      ),'[]'::jsonb)
    ) on conflict(target_id,cycle_key) do nothing
    returning id into v_job;
    if v_job is not null then
      job_id:=v_job; industry_key:=r.industry_key; industry_name:=r.display_name; return next;
    end if;
  end loop;
end $$;

create or replace function public.claim_genesis_g82_expansion_jobs(
  p_limit integer default 1,
  p_worker_id text default null,
  p_lease_seconds integer default 150
)
returns setof public.genesis_g82_expansion_jobs
language plpgsql security definer set search_path=public as $$
begin
  return query
  with candidates as (
    select j.id from public.genesis_g82_expansion_jobs j
    where (j.status='QUEUED' or (j.status='CLAIMED' and j.lease_expires_at < now()))
      and j.attempt_count < 8
    order by j.created_at asc
    for update skip locked
    limit greatest(1,least(coalesce(p_limit,1),4))
  ), updated as (
    update public.genesis_g82_expansion_jobs j
    set status='CLAIMED', attempt_count=j.attempt_count+1,
        lease_token=gen_random_uuid(), lease_expires_at=now()+make_interval(secs=>greatest(30,least(coalesce(p_lease_seconds,150),300))),
        worker_id=p_worker_id, updated_at=now()
    from candidates c where j.id=c.id
    returning j.*
  ) select * from updated;
end $$;

create or replace function public.settle_genesis_g82_expansion_job(
  p_job_id uuid,
  p_lease_token uuid,
  p_status text,
  p_companies_found integer default 0,
  p_companies_persisted integer default 0,
  p_contacts_persisted integer default 0,
  p_routes_persisted integer default 0,
  p_error text default null
)
returns void language plpgsql security definer set search_path=public as $$
begin
  if p_status not in ('QUEUED','COMPLETED','FAILED') then raise exception 'GENESIS_G82_INVALID_EXPANSION_STATUS'; end if;
  update public.genesis_g82_expansion_jobs
  set status=p_status,
      companies_found=greatest(0,coalesce(p_companies_found,0)),
      companies_persisted=greatest(0,coalesce(p_companies_persisted,0)),
      contacts_persisted=greatest(0,coalesce(p_contacts_persisted,0)),
      routes_persisted=greatest(0,coalesce(p_routes_persisted,0)),
      last_error=p_error,
      lease_token=null, lease_expires_at=null, worker_id=null,
      completed_at=case when p_status='COMPLETED' then now() else completed_at end,
      updated_at=now()
  where id=p_job_id and status='CLAIMED' and lease_token=p_lease_token;
  if not found then raise exception 'GENESIS_G82_EXPANSION_LEASE_MISMATCH'; end if;
end $$;

create or replace function public.record_genesis_g82_expansion_membership(
  p_target_id uuid,
  p_entity_id uuid,
  p_entity_type text,
  p_canonical_domain text default null
)
returns void language plpgsql security definer set search_path=public as $$
begin
  if p_entity_type not in ('company','contact','route') then raise exception 'GENESIS_G82_INVALID_MEMBERSHIP_TYPE'; end if;
  insert into public.genesis_g82_expansion_membership(target_id,entity_id,entity_type,canonical_domain)
  values(p_target_id,p_entity_id,p_entity_type,nullif(lower(trim(coalesce(p_canonical_domain,''))),''))
  on conflict(target_id,entity_id) do update set canonical_domain=coalesce(excluded.canonical_domain,genesis_g82_expansion_membership.canonical_domain);
end $$;

grant execute on function public.ensure_genesis_g82_expansion_backlog(integer) to service_role;
grant execute on function public.claim_genesis_g82_expansion_jobs(integer,text,integer) to service_role;
grant execute on function public.settle_genesis_g82_expansion_job(uuid,uuid,text,integer,integer,integer,integer,text) to service_role;
grant execute on function public.record_genesis_g82_expansion_membership(uuid,uuid,text,text) to service_role;
revoke all on function public.ensure_genesis_g82_expansion_backlog(integer) from public, anon, authenticated;
revoke all on function public.claim_genesis_g82_expansion_jobs(integer,text,integer) from public, anon, authenticated;
revoke all on function public.settle_genesis_g82_expansion_job(uuid,uuid,text,integer,integer,integer,integer,text) from public, anon, authenticated;
revoke all on function public.record_genesis_g82_expansion_membership(uuid,uuid,text,text) from public, anon, authenticated;

-- Extend the R17 snapshot so autonomous expansion consumes the SAME protected
-- background-growth allowance as exact G8 repairs. No extra budget lane exists.
create or replace function public.genesis_g8_capacity_budget_snapshot(p_system_organisation_id uuid)
returns table(
  governance_enabled boolean,daily_request_limit integer,daily_cost_limit_usd numeric,
  requests_today integer,cost_today_usd numeric,g8_repair_calls_today integer,g8_repair_cost_today_usd numeric,
  background_repair_calls_today integer,background_repair_cost_today_usd numeric,live_customer_work_pending boolean,
  queued_customer_repairs integer,active_customer_repairs integer,truth_gain_today double precision,truth_gain_per_repair_call double precision
)
language sql security definer set search_path=public as $$
with policy as (
  select p.autonomy_enabled,p.daily_request_limit,p.daily_cost_limit_usd from public.ai_governance_policies p where p.organisation_id=p_system_organisation_id
), usage_today as (
  select count(*)::integer requests,coalesce(sum(case when l.status='SUCCEEDED' then l.actual_cost_usd else l.estimated_cost_usd end),0)::numeric cost
  from public.ai_usage_ledger l where l.organisation_id=p_system_organisation_id and l.created_at>=date_trunc('day',now()) and l.status in ('RESERVED','SUCCEEDED','FAILED')
), g8_calls as (
  select count(*) filter(where l.status='SUCCEEDED')::integer calls,
         coalesce(sum(case when l.status='SUCCEEDED' then l.actual_cost_usd else l.estimated_cost_usd end),0)::numeric cost,
         count(*) filter(where l.status='SUCCEEDED' and ((q.organisation_id is null and q.campaign_id is null and q.company_id is null and q.id is not null) or e.id is not null))::integer background_calls,
         coalesce(sum(case when ((q.organisation_id is null and q.campaign_id is null and q.company_id is null and q.id is not null) or e.id is not null)
           then case when l.status='SUCCEEDED' then l.actual_cost_usd else l.estimated_cost_usd end else 0 end),0)::numeric background_cost
  from public.ai_usage_ledger l
  left join public.genesis_g8_discovery_repair_queue q on q.id=l.job_id
  left join public.genesis_g82_expansion_jobs e on e.id=l.job_id
  where l.organisation_id=p_system_organisation_id and l.job_type='GENESIS_G8_REPAIR'
    and l.created_at>=date_trunc('day',now()) and l.status in ('RESERVED','SUCCEEDED','FAILED')
), customer_repair as (
  select count(*) filter(where q.status='QUEUED' and (q.organisation_id is not null or q.campaign_id is not null or q.company_id is not null))::integer queued,
         count(*) filter(where q.status='CLAIMED' and (q.organisation_id is not null or q.campaign_id is not null or q.company_id is not null))::integer active
  from public.genesis_g8_discovery_repair_queue q
), daily_truth as (
  select s.entity_id,(array_agg(s.truth_index order by s.calculated_at asc))[1]::double precision first_truth,
         (array_agg(s.truth_index order by s.calculated_at desc))[1]::double precision last_truth
  from public.genesis_g8_truth_snapshots s where s.calculated_at>=date_trunc('day',now()) group by s.entity_id
), gain as (select coalesce(sum(greatest(last_truth-first_truth,0)),0)::double precision truth_gain from daily_truth)
select coalesce((select autonomy_enabled from policy),false),coalesce((select daily_request_limit from policy),0),coalesce((select daily_cost_limit_usd from policy),0),
  coalesce((select requests from usage_today),0),coalesce((select cost from usage_today),0),coalesce((select calls from g8_calls),0),coalesce((select cost from g8_calls),0),
  coalesce((select background_calls from g8_calls),0),coalesce((select background_cost from g8_calls),0),
  (coalesce((select queued from customer_repair),0)+coalesce((select active from customer_repair),0))>0,
  coalesce((select queued from customer_repair),0),coalesce((select active from customer_repair),0),coalesce((select truth_gain from gain),0),
  case when coalesce((select calls from g8_calls),0)>0 then coalesce((select truth_gain from gain),0)/greatest((select calls from g8_calls),1) else 0 end;
$$;
revoke all on function public.genesis_g8_capacity_budget_snapshot(uuid) from public,anon,authenticated;
grant execute on function public.genesis_g8_capacity_budget_snapshot(uuid) to service_role;

-- Customer-scoped exact repairs must outrank organisation-neutral background
-- refresh/expansion work once the autonomous heartbeat is live.
create or replace function public.claim_genesis_g8_discovery_repairs(
  p_limit integer default 2,p_worker_id text default 'genesis-g8-repair',p_lease_seconds integer default 75
) returns table(
  id uuid,dispatch_key text,entity_id uuid,entity_type text,entity_canonical_key text,entity_display_name text,
  claim_id uuid,claim_key text,claim_label text,criticality text,repair_mode text,objective text,minimum_evidence integer,
  additional_evidence_needed integer,blocking_mode text,organisation_id uuid,campaign_id uuid,company_id uuid,attempt_count integer,lease_token text
)
language plpgsql security definer set search_path=public as $$
begin
  return query
  with candidates as (
    select q.id from public.genesis_g8_discovery_repair_queue q
    where q.status in ('QUEUED','CLAIMED') and coalesce(q.next_attempt_at,now())<=now()
      and (q.status='QUEUED' or q.lease_expires_at is null or q.lease_expires_at<now())
    order by
      case when q.organisation_id is not null or q.campaign_id is not null or q.company_id is not null then 0 else 1 end,
      case q.blocking_mode when 'BLOCKING_BEFORE_USE' then 0 else 1 end,
      case q.criticality when 'CRITICAL' then 0 when 'REQUIRED' then 1 when 'SUPPORTING' then 2 else 3 end,
      q.created_at
    for update skip locked limit greatest(1,least(coalesce(p_limit,2),4))
  ), claimed as (
    update public.genesis_g8_discovery_repair_queue q
    set status='CLAIMED',claimed_by=left(coalesce(p_worker_id,'genesis-g8-repair'),240),claimed_at=now(),lease_token=gen_random_uuid()::text,
        lease_expires_at=now()+(greatest(30,least(coalesce(p_lease_seconds,75),180))||' seconds')::interval,attempt_count=q.attempt_count+1,updated_at=now()
    from candidates c where q.id=c.id returning q.*
  )
  select c.id,c.dispatch_key,c.entity_id,c.entity_type,e.canonical_key,e.display_name,c.claim_id,c.claim_key,ic.label,c.criticality,c.repair_mode,c.objective,c.minimum_evidence,
         c.additional_evidence_needed,c.blocking_mode,c.organisation_id,c.campaign_id,c.company_id,c.attempt_count,c.lease_token
  from claimed c join public.genesis_g8_intelligence_entities e on e.id=c.entity_id
  join public.genesis_g8_intelligence_claims ic on ic.id=c.claim_id and ic.entity_id=c.entity_id;
end $$;
revoke all on function public.claim_genesis_g8_discovery_repairs(integer,text,integer) from public,anon,authenticated;
grant execute on function public.claim_genesis_g8_discovery_repairs(integer,text,integer) to service_role;
