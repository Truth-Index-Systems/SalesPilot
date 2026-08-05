-- Genesis Stabilisation S10.1: one budget-aware initial contact discovery burst.
-- Fresh queued contact jobs may run in parallel once per campaign. Retries remain sequential.

alter table public.campaigns
  add column if not exists initial_contact_burst_completed_at timestamptz,
  add column if not exists initial_contact_burst_size integer not null default 0
    check (initial_contact_burst_size between 0 and 20);

alter table public.ai_governance_policies
  add column if not exists initial_contact_burst_size integer not null default 3
    check (initial_contact_burst_size between 1 and 5);

-- Replace the policy update boundary so the burst size is governed with the other limits.
drop function if exists public.update_ai_governance_policy(uuid,uuid,boolean,integer,numeric,integer);
create or replace function public.update_ai_governance_policy(
  p_organisation_id uuid,
  p_updated_by uuid,
  p_autonomy_enabled boolean,
  p_daily_request_limit integer,
  p_daily_cost_limit_usd numeric,
  p_campaign_daily_request_limit integer,
  p_initial_contact_burst_size integer
) returns public.ai_governance_policies
language plpgsql security definer set search_path=public as $$
declare v_role text; v_result public.ai_governance_policies%rowtype;
begin
  select role into v_role from public.organisation_memberships
  where organisation_id=p_organisation_id and user_id=p_updated_by and status='ACTIVE' limit 1;
  if v_role not in ('OWNER','ADMIN') then raise exception 'forbidden'; end if;

  insert into public.ai_governance_policies(
    organisation_id,autonomy_enabled,daily_request_limit,daily_cost_limit_usd,
    campaign_daily_request_limit,initial_contact_burst_size,updated_by,updated_at
  ) values(
    p_organisation_id,p_autonomy_enabled,greatest(p_daily_request_limit,0),
    greatest(p_daily_cost_limit_usd,0),greatest(p_campaign_daily_request_limit,0),
    least(greatest(p_initial_contact_burst_size,1),5),p_updated_by,now()
  )
  on conflict(organisation_id) do update set
    autonomy_enabled=excluded.autonomy_enabled,
    daily_request_limit=excluded.daily_request_limit,
    daily_cost_limit_usd=excluded.daily_cost_limit_usd,
    campaign_daily_request_limit=excluded.campaign_daily_request_limit,
    initial_contact_burst_size=excluded.initial_contact_burst_size,
    updated_by=excluded.updated_by,
    updated_at=now()
  returning * into v_result;
  return v_result;
end $$;

-- Append the configured burst size to the existing governance summary.
create or replace view public.ai_governance_daily_summary with (security_invoker=true) as
select p.organisation_id,p.autonomy_enabled,p.daily_request_limit,p.daily_cost_limit_usd,p.campaign_daily_request_limit,p.updated_at,
  count(l.id) filter(where l.created_at>=date_trunc('day',now()) and l.status in ('RESERVED','SUCCEEDED','FAILED'))::integer as requests_today,
  count(l.id) filter(where l.created_at>=date_trunc('day',now()) and l.status='BLOCKED')::integer as blocked_today,
  coalesce(sum(case when l.created_at>=date_trunc('day',now()) and l.status='SUCCEEDED' then l.actual_cost_usd when l.created_at>=date_trunc('day',now()) and l.status in ('RESERVED','FAILED') then l.estimated_cost_usd else 0 end),0)::numeric(12,6) as cost_today_usd,
  coalesce(sum(l.input_tokens) filter(where l.created_at>=date_trunc('day',now())),0)::bigint as input_tokens_today,
  coalesce(sum(l.output_tokens) filter(where l.created_at>=date_trunc('day',now())),0)::bigint as output_tokens_today,
  p.initial_contact_burst_size
from public.ai_governance_policies p
left join public.ai_usage_ledger l on l.organisation_id=p.organisation_id
group by p.organisation_id,p.autonomy_enabled,p.daily_request_limit,p.daily_cost_limit_usd,p.campaign_daily_request_limit,p.updated_at,p.initial_contact_burst_size;

-- Decide whether this scheduler run receives the one-time fresh-contact burst.
-- The decision is atomic and consumes the burst exactly once, even if a worker later fails.
create or replace function public.plan_contact_discovery_dispatch(
  p_scheduler_run_id uuid,
  p_estimated_cost_usd numeric default 0.35
) returns table(dispatch_count integer,campaign_id uuid,mode text)
language plpgsql security definer set search_path=public as $$
declare
  v_campaign_id uuid;
  v_org_id uuid;
  v_policy public.ai_governance_policies%rowtype;
  v_queued integer:=0;
  v_requests integer:=0;
  v_campaign_requests integer:=0;
  v_cost numeric:=0;
  v_request_slots integer:=0;
  v_campaign_slots integer:=0;
  v_cost_slots integer:=0;
  v_dispatch integer:=1;
begin
  -- A burst is only for fresh queued jobs, with no running contact work and no due retry.
  select ca.id,ca.organisation_id
    into v_campaign_id,v_org_id
  from public.campaigns ca
  join public.ai_governance_policies g on g.organisation_id=ca.organisation_id and g.autonomy_enabled=true
  where ca.status not in ('PAUSED','CANCELLED')
    and ca.initial_contact_burst_completed_at is null
    and exists (
      select 1 from public.contact_discovery_sessions s
      where s.campaign_id=ca.id and s.status='QUEUED' and coalesce(s.job_state,'QUEUED')='QUEUED'
        and s.attempt_count=0 and coalesce(s.next_attempt_at,s.next_retry_at,now())<=now()
    )
    and not exists (
      select 1 from public.contact_discovery_sessions s
      where s.campaign_id=ca.id and (s.status='RUNNING' or coalesce(s.job_state,'')='RUNNING')
    )
    and not exists (
      select 1 from public.contact_discovery_sessions s
      where s.campaign_id=ca.id and s.status='FAILED' and coalesce(s.job_state,'')='FAILED_RETRYABLE'
        and coalesce(s.next_retry_at,s.next_attempt_at,now())<=now()
    )
  order by ca.created_at
  for update of ca skip locked
  limit 1;

  if v_campaign_id is null then
    return query select 1,null::uuid,'NORMAL'::text;
    return;
  end if;

  select * into v_policy from public.ensure_ai_governance_policy(v_org_id);
  select count(*) into v_queued from public.contact_discovery_sessions s
    where s.campaign_id=v_campaign_id and s.status='QUEUED' and coalesce(s.job_state,'QUEUED')='QUEUED'
      and s.attempt_count=0 and coalesce(s.next_attempt_at,s.next_retry_at,now())<=now();

  select count(*),coalesce(sum(case when status='SUCCEEDED' then actual_cost_usd else estimated_cost_usd end),0)
    into v_requests,v_cost
  from public.ai_usage_ledger
  where organisation_id=v_org_id and created_at>=date_trunc('day',now())
    and status in ('RESERVED','SUCCEEDED','FAILED');

  select count(*) into v_campaign_requests from public.ai_usage_ledger
  where campaign_id=v_campaign_id and created_at>=date_trunc('day',now())
    and status in ('RESERVED','SUCCEEDED','FAILED');

  v_request_slots:=greatest(v_policy.daily_request_limit-v_requests,0);
  v_campaign_slots:=greatest(v_policy.campaign_daily_request_limit-v_campaign_requests,0);
  if greatest(p_estimated_cost_usd,0)>0 then
    v_cost_slots:=greatest(floor((v_policy.daily_cost_limit_usd-v_cost)/greatest(p_estimated_cost_usd,0))::integer,0);
  else
    v_cost_slots:=v_policy.initial_contact_burst_size;
  end if;

  v_dispatch:=least(v_policy.initial_contact_burst_size,v_queued,v_request_slots,v_campaign_slots,v_cost_slots);

  -- No allowance means no claim and no consumed burst. The scheduler may retry
  -- after the daily governance window resets or an administrator raises limits.
  if v_dispatch<=0 then
    return query select 0,v_campaign_id,'BUDGET_BLOCKED'::text;
    return;
  end if;

  update public.campaigns set
    initial_contact_burst_completed_at=now(),
    initial_contact_burst_size=v_dispatch,
    updated_at=now()
  where id=v_campaign_id;

  return query select v_dispatch,v_campaign_id,case when v_dispatch>1 then 'INITIAL_BURST' else 'BUDGET_FALLBACK' end;
end $$;

-- Optional campaign targeting lets concurrent burst workers claim only fresh jobs
-- from the selected campaign. Normal dispatch remains global and retry-aware.
drop function if exists public.claim_contact_discovery(uuid);
create or replace function public.claim_contact_discovery(
  p_scheduler_run_id uuid,
  p_campaign_id uuid default null,
  p_fresh_only boolean default false
)
returns table(session_id uuid,organisation_id uuid,campaign_id uuid,company_id uuid)
language plpgsql security definer set search_path=public as $$
declare v_id uuid;
begin
  select s.id into v_id
  from public.contact_discovery_sessions s
  join public.companies c on c.id=s.company_id and c.review_status='APPROVED'
  join public.campaigns ca on ca.id=s.campaign_id and ca.status not in('PAUSED','CANCELLED')
  join public.ai_governance_policies g on g.organisation_id=s.organisation_id and g.autonomy_enabled=true
  where s.attempt_count<5
    and (p_campaign_id is null or s.campaign_id=p_campaign_id)
    and (
      (s.status='QUEUED' and coalesce(s.next_attempt_at,s.next_retry_at,now())<=now()
        and (not p_fresh_only or (coalesce(s.job_state,'QUEUED')='QUEUED' and s.attempt_count=0)))
      or
      (not p_fresh_only and s.status='FAILED' and s.job_state='FAILED_RETRYABLE'
        and coalesce(s.next_retry_at,s.next_attempt_at,now())<=now())
    )
  order by case when s.status='QUEUED' then 0 else 1 end,
    coalesce(s.next_retry_at,s.next_attempt_at,s.created_at),s.created_at
  for update of s skip locked limit 1;

  if v_id is null then return; end if;
  update public.contact_discovery_sessions set
    status='RUNNING',job_state='RUNNING',stage='PREPARING',progress=5,
    attempt_count=attempt_count+1,claimed_at=now(),started_at=coalesce(started_at,now()),
    heartbeat_at=now(),last_heartbeat_at=now(),lease_expires_at=now()+interval '8 minutes',
    last_error=null,last_error_code=null,last_error_message=null,next_attempt_at=null,next_retry_at=null,
    scheduler_run_id=p_scheduler_run_id,updated_at=now()
  where id=v_id;
  return query select s.id,s.organisation_id,s.campaign_id,s.company_id
    from public.contact_discovery_sessions s where s.id=v_id;
end $$;

revoke all on function public.update_ai_governance_policy(uuid,uuid,boolean,integer,numeric,integer,integer) from public,anon,authenticated;
revoke all on function public.plan_contact_discovery_dispatch(uuid,numeric) from public,anon,authenticated;
revoke all on function public.claim_contact_discovery(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.update_ai_governance_policy(uuid,uuid,boolean,integer,numeric,integer,integer) to service_role;
grant execute on function public.plan_contact_discovery_dispatch(uuid,numeric) to service_role;
grant execute on function public.claim_contact_discovery(uuid,uuid,boolean) to service_role;
