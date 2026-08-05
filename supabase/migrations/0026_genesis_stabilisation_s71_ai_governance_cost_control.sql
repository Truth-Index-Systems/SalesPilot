-- Genesis Stabilisation S7.1: AI governance and cost control.
-- All AI requests require a platform env gate plus a successful database reservation.

create table if not exists public.ai_governance_policies (
  organisation_id uuid primary key references public.organisations(id) on delete cascade,
  autonomy_enabled boolean not null default false,
  daily_request_limit integer not null default 25 check (daily_request_limit between 0 and 100000),
  daily_cost_limit_usd numeric(12,4) not null default 5.0000 check (daily_cost_limit_usd >= 0),
  campaign_daily_request_limit integer not null default 10 check (campaign_daily_request_limit between 0 and 100000),
  max_company_jobs_per_run integer not null default 1 check (max_company_jobs_per_run between 0 and 20),
  max_contact_jobs_per_run integer not null default 1 check (max_contact_jobs_per_run between 0 and 20),
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_usage_ledger (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid references public.organisations(id) on delete cascade,
  campaign_id uuid references public.campaigns(id) on delete set null,
  scheduler_run_id uuid references public.pipeline_scheduler_runs(id) on delete set null,
  job_type text not null check (job_type in ('BUSINESS_ANALYSIS','COMPANY_DISCOVERY','CONTACT_DISCOVERY','OUTREACH','REPLY_INTELLIGENCE')),
  job_id uuid,
  request_key text not null,
  model text not null,
  status text not null default 'RESERVED' check (status in ('RESERVED','SUCCEEDED','FAILED','BLOCKED')),
  estimated_cost_usd numeric(12,6) not null default 0,
  actual_cost_usd numeric(12,6) not null default 0,
  input_tokens integer,
  output_tokens integer,
  web_search_calls integer not null default 0,
  duration_ms integer,
  response_id text,
  error_code text,
  error_message text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique(request_key)
);

create index if not exists ai_usage_ledger_org_day_idx on public.ai_usage_ledger(organisation_id,created_at desc);
create index if not exists ai_usage_ledger_campaign_day_idx on public.ai_usage_ledger(campaign_id,created_at desc);
create index if not exists ai_usage_ledger_job_idx on public.ai_usage_ledger(job_type,job_id,created_at desc);

alter table public.ai_governance_policies enable row level security;
alter table public.ai_usage_ledger enable row level security;

drop policy if exists ai_governance_policies_member_read on public.ai_governance_policies;
create policy ai_governance_policies_member_read on public.ai_governance_policies
for select to authenticated using (public.is_active_org_member(organisation_id));

drop policy if exists ai_usage_ledger_member_read on public.ai_usage_ledger;
create policy ai_usage_ledger_member_read on public.ai_usage_ledger
for select to authenticated using (organisation_id is not null and public.is_active_org_member(organisation_id));

create or replace function public.ensure_ai_governance_policy(p_organisation_id uuid)
returns public.ai_governance_policies
language plpgsql security definer set search_path=public as $$
declare v_policy public.ai_governance_policies%rowtype;
begin
  insert into public.ai_governance_policies(organisation_id)
  values(p_organisation_id)
  on conflict (organisation_id) do nothing;
  select * into v_policy from public.ai_governance_policies where organisation_id=p_organisation_id;
  return v_policy;
end $$;

create or replace function public.reserve_ai_request(
  p_organisation_id uuid,
  p_campaign_id uuid,
  p_scheduler_run_id uuid,
  p_job_type text,
  p_job_id uuid,
  p_request_key text,
  p_model text,
  p_estimated_cost_usd numeric
) returns table(allowed boolean, ledger_id uuid, reason_code text, requests_today integer, cost_today numeric, request_limit integer, cost_limit numeric)
language plpgsql security definer set search_path=public as $$
declare
  v_policy public.ai_governance_policies%rowtype;
  v_requests integer:=0;
  v_campaign_requests integer:=0;
  v_cost numeric:=0;
  v_ledger uuid;
begin
  if p_job_type not in ('BUSINESS_ANALYSIS','COMPANY_DISCOVERY','CONTACT_DISCOVERY','OUTREACH','REPLY_INTELLIGENCE') then
    raise exception 'invalid AI job type';
  end if;
  if p_organisation_id is null then
    return query select false,null::uuid,'ORGANISATION_REQUIRED',0,0::numeric,0,0::numeric;
    return;
  end if;

  select * into v_policy from public.ensure_ai_governance_policy(p_organisation_id);
  select count(*),coalesce(sum(case when status='SUCCEEDED' then actual_cost_usd else estimated_cost_usd end),0)
    into v_requests,v_cost
  from public.ai_usage_ledger
  where organisation_id=p_organisation_id and created_at>=date_trunc('day',now()) and status in ('RESERVED','SUCCEEDED','FAILED');

  if p_campaign_id is not null then
    select count(*) into v_campaign_requests from public.ai_usage_ledger
    where campaign_id=p_campaign_id and created_at>=date_trunc('day',now()) and status in ('RESERVED','SUCCEEDED','FAILED');
  end if;

  if not v_policy.autonomy_enabled then
    insert into public.ai_usage_ledger(organisation_id,campaign_id,scheduler_run_id,job_type,job_id,request_key,model,status,estimated_cost_usd,error_code)
    values(p_organisation_id,p_campaign_id,p_scheduler_run_id,p_job_type,p_job_id,p_request_key,p_model,'BLOCKED',greatest(p_estimated_cost_usd,0),'AUTONOMY_DISABLED')
    on conflict(request_key) do nothing returning id into v_ledger;
    return query select false,v_ledger,'AUTONOMY_DISABLED',v_requests,v_cost,v_policy.daily_request_limit,v_policy.daily_cost_limit_usd;
    return;
  end if;

  if v_requests >= v_policy.daily_request_limit then
    insert into public.ai_usage_ledger(organisation_id,campaign_id,scheduler_run_id,job_type,job_id,request_key,model,status,estimated_cost_usd,error_code)
    values(p_organisation_id,p_campaign_id,p_scheduler_run_id,p_job_type,p_job_id,p_request_key,p_model,'BLOCKED',greatest(p_estimated_cost_usd,0),'WORKSPACE_DAILY_REQUEST_LIMIT')
    on conflict(request_key) do nothing returning id into v_ledger;
    return query select false,v_ledger,'WORKSPACE_DAILY_REQUEST_LIMIT',v_requests,v_cost,v_policy.daily_request_limit,v_policy.daily_cost_limit_usd;
    return;
  end if;

  if p_campaign_id is not null and v_campaign_requests >= v_policy.campaign_daily_request_limit then
    insert into public.ai_usage_ledger(organisation_id,campaign_id,scheduler_run_id,job_type,job_id,request_key,model,status,estimated_cost_usd,error_code)
    values(p_organisation_id,p_campaign_id,p_scheduler_run_id,p_job_type,p_job_id,p_request_key,p_model,'BLOCKED',greatest(p_estimated_cost_usd,0),'CAMPAIGN_DAILY_REQUEST_LIMIT')
    on conflict(request_key) do nothing returning id into v_ledger;
    return query select false,v_ledger,'CAMPAIGN_DAILY_REQUEST_LIMIT',v_requests,v_cost,v_policy.daily_request_limit,v_policy.daily_cost_limit_usd;
    return;
  end if;

  if v_cost + greatest(p_estimated_cost_usd,0) > v_policy.daily_cost_limit_usd then
    insert into public.ai_usage_ledger(organisation_id,campaign_id,scheduler_run_id,job_type,job_id,request_key,model,status,estimated_cost_usd,error_code)
    values(p_organisation_id,p_campaign_id,p_scheduler_run_id,p_job_type,p_job_id,p_request_key,p_model,'BLOCKED',greatest(p_estimated_cost_usd,0),'WORKSPACE_DAILY_COST_LIMIT')
    on conflict(request_key) do nothing returning id into v_ledger;
    return query select false,v_ledger,'WORKSPACE_DAILY_COST_LIMIT',v_requests,v_cost,v_policy.daily_request_limit,v_policy.daily_cost_limit_usd;
    return;
  end if;

  insert into public.ai_usage_ledger(organisation_id,campaign_id,scheduler_run_id,job_type,job_id,request_key,model,status,estimated_cost_usd)
  values(p_organisation_id,p_campaign_id,p_scheduler_run_id,p_job_type,p_job_id,p_request_key,p_model,'RESERVED',greatest(p_estimated_cost_usd,0))
  on conflict(request_key) do update set request_key=excluded.request_key
  returning id into v_ledger;

  return query select true,v_ledger,null::text,v_requests+1,v_cost+greatest(p_estimated_cost_usd,0),v_policy.daily_request_limit,v_policy.daily_cost_limit_usd;
end $$;

create or replace function public.complete_ai_request(
  p_ledger_id uuid,
  p_status text,
  p_actual_cost_usd numeric default 0,
  p_input_tokens integer default null,
  p_output_tokens integer default null,
  p_web_search_calls integer default 0,
  p_duration_ms integer default null,
  p_response_id text default null,
  p_error_code text default null,
  p_error_message text default null
) returns void
language plpgsql security definer set search_path=public as $$
begin
  if p_status not in ('SUCCEEDED','FAILED') then raise exception 'invalid completion status'; end if;
  update public.ai_usage_ledger set
    status=p_status,
    actual_cost_usd=greatest(coalesce(p_actual_cost_usd,0),0),
    input_tokens=p_input_tokens,
    output_tokens=p_output_tokens,
    web_search_calls=greatest(coalesce(p_web_search_calls,0),0),
    duration_ms=p_duration_ms,
    response_id=left(p_response_id,200),
    error_code=left(p_error_code,120),
    error_message=left(p_error_message,1000),
    completed_at=now()
  where id=p_ledger_id;
end $$;

create or replace function public.update_ai_governance_policy(
  p_organisation_id uuid,
  p_updated_by uuid,
  p_autonomy_enabled boolean,
  p_daily_request_limit integer,
  p_daily_cost_limit_usd numeric,
  p_campaign_daily_request_limit integer
) returns public.ai_governance_policies
language plpgsql security definer set search_path=public as $$
declare v_role text; v_result public.ai_governance_policies%rowtype;
begin
  select role into v_role from public.organisation_memberships
  where organisation_id=p_organisation_id and user_id=p_updated_by and status='ACTIVE' limit 1;
  if v_role not in ('OWNER','ADMIN') then raise exception 'forbidden'; end if;
  insert into public.ai_governance_policies(organisation_id,autonomy_enabled,daily_request_limit,daily_cost_limit_usd,campaign_daily_request_limit,updated_by,updated_at)
  values(p_organisation_id,p_autonomy_enabled,greatest(p_daily_request_limit,0),greatest(p_daily_cost_limit_usd,0),greatest(p_campaign_daily_request_limit,0),p_updated_by,now())
  on conflict(organisation_id) do update set autonomy_enabled=excluded.autonomy_enabled,daily_request_limit=excluded.daily_request_limit,daily_cost_limit_usd=excluded.daily_cost_limit_usd,campaign_daily_request_limit=excluded.campaign_daily_request_limit,updated_by=excluded.updated_by,updated_at=now()
  returning * into v_result;
  return v_result;
end $$;

create or replace view public.ai_governance_daily_summary with (security_invoker=true) as
select p.organisation_id,p.autonomy_enabled,p.daily_request_limit,p.daily_cost_limit_usd,p.campaign_daily_request_limit,p.updated_at,
  count(l.id) filter(where l.created_at>=date_trunc('day',now()) and l.status in ('RESERVED','SUCCEEDED','FAILED'))::integer as requests_today,
  count(l.id) filter(where l.created_at>=date_trunc('day',now()) and l.status='BLOCKED')::integer as blocked_today,
  coalesce(sum(case when l.created_at>=date_trunc('day',now()) and l.status='SUCCEEDED' then l.actual_cost_usd when l.created_at>=date_trunc('day',now()) and l.status in ('RESERVED','FAILED') then l.estimated_cost_usd else 0 end),0)::numeric(12,6) as cost_today_usd,
  coalesce(sum(l.input_tokens) filter(where l.created_at>=date_trunc('day',now())),0)::bigint as input_tokens_today,
  coalesce(sum(l.output_tokens) filter(where l.created_at>=date_trunc('day',now())),0)::bigint as output_tokens_today
from public.ai_governance_policies p
left join public.ai_usage_ledger l on l.organisation_id=p.organisation_id
group by p.organisation_id,p.autonomy_enabled,p.daily_request_limit,p.daily_cost_limit_usd,p.campaign_daily_request_limit,p.updated_at;

revoke all on function public.ensure_ai_governance_policy(uuid) from public,anon,authenticated;
revoke all on function public.reserve_ai_request(uuid,uuid,uuid,text,uuid,text,text,numeric) from public,anon,authenticated;
revoke all on function public.complete_ai_request(uuid,text,numeric,integer,integer,integer,integer,text,text,text) from public,anon,authenticated;
revoke all on function public.update_ai_governance_policy(uuid,uuid,boolean,integer,numeric,integer) from public,anon,authenticated;
grant execute on function public.ensure_ai_governance_policy(uuid) to service_role;
grant execute on function public.reserve_ai_request(uuid,uuid,uuid,text,uuid,text,text,numeric) to service_role;
grant execute on function public.complete_ai_request(uuid,text,numeric,integer,integer,integer,integer,text,text,text) to service_role;
grant execute on function public.update_ai_governance_policy(uuid,uuid,boolean,integer,numeric,integer) to service_role;

-- Claims are restricted to organisations that explicitly enable autonomy.
create or replace function public.claim_company_discovery(p_scheduler_run_id uuid)
returns table(session_id uuid,organisation_id uuid,campaign_id uuid)
language plpgsql security definer set search_path=public as $$
declare v_id uuid;
begin
 select s.id into v_id from public.discovery_sessions s join public.campaigns c on c.id=s.campaign_id
 join public.ai_governance_policies g on g.organisation_id=s.organisation_id and g.autonomy_enabled=true
 where c.status not in('PAUSED','CANCELLED') and s.attempt_count<5 and ((s.status='QUEUED' and coalesce(s.next_attempt_at,s.next_retry_at,now())<=now()) or (s.status='FAILED' and s.job_state='FAILED_RETRYABLE' and coalesce(s.next_retry_at,s.next_attempt_at,now())<=now()))
 order by case when s.status='QUEUED' then 0 else 1 end,coalesce(s.next_retry_at,s.next_attempt_at,s.created_at),s.created_at for update of s skip locked limit 1;
 if v_id is null then return; end if;
 update public.discovery_sessions set status='RUNNING',job_state='RUNNING',stage='SEARCHING',progress=10,attempt_count=attempt_count+1,claimed_at=now(),started_at=coalesce(started_at,now()),heartbeat_at=now(),last_heartbeat_at=now(),lease_expires_at=now()+interval '8 minutes',last_error=null,last_error_code=null,last_error_message=null,next_attempt_at=null,next_retry_at=null,scheduler_run_id=p_scheduler_run_id,updated_at=now() where id=v_id;
 return query select s.id,s.organisation_id,s.campaign_id from public.discovery_sessions s where s.id=v_id;
end $$;

create or replace function public.claim_contact_discovery(p_scheduler_run_id uuid)
returns table(session_id uuid,organisation_id uuid,campaign_id uuid,company_id uuid)
language plpgsql security definer set search_path=public as $$
declare v_id uuid;
begin
 select s.id into v_id from public.contact_discovery_sessions s join public.companies c on c.id=s.company_id and c.review_status='APPROVED' join public.campaigns ca on ca.id=s.campaign_id and ca.status not in('PAUSED','CANCELLED') join public.ai_governance_policies g on g.organisation_id=s.organisation_id and g.autonomy_enabled=true
 where s.attempt_count<5 and ((s.status='QUEUED' and coalesce(s.next_attempt_at,s.next_retry_at,now())<=now()) or (s.status='FAILED' and s.job_state='FAILED_RETRYABLE' and coalesce(s.next_retry_at,s.next_attempt_at,now())<=now()))
 order by case when s.status='QUEUED' then 0 else 1 end,coalesce(s.next_retry_at,s.next_attempt_at,s.created_at),s.created_at for update of s skip locked limit 1;
 if v_id is null then return; end if;
 update public.contact_discovery_sessions set status='RUNNING',job_state='RUNNING',stage='PREPARING',progress=5,attempt_count=attempt_count+1,claimed_at=now(),started_at=coalesce(started_at,now()),heartbeat_at=now(),last_heartbeat_at=now(),lease_expires_at=now()+interval '8 minutes',last_error=null,last_error_code=null,last_error_message=null,next_attempt_at=null,next_retry_at=null,scheduler_run_id=p_scheduler_run_id,updated_at=now() where id=v_id;
 return query select s.id,s.organisation_id,s.campaign_id,s.company_id from public.contact_discovery_sessions s where s.id=v_id;
end $$;
