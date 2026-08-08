-- Genesis post-freeze: breadth-first market scan, then depth-first route completion.
--
-- Customer intent:
--   1) Give every approved company one Route Intelligence pass before spending
--      additional passes on any unfocused account.
--   2) Once breadth coverage is complete, choose one promising incomplete
--      account and keep it as the depth focus until READY / EXHAUSTED / terminal.
--   3) Newly discovered companies do not interrupt an already-focused account;
--      after that account completes, new pass-0 companies regain priority.
--
-- This preserves the global scheduler rule of one heavyweight Route Intelligence
-- AI call per scheduler invocation. "Breadth first" therefore means fair first-
-- pass coverage across scheduler cycles, not unsafe concurrent model calls.

alter table public.contact_discovery_sessions
  add column if not exists depth_focus_started_at timestamptz;

create index if not exists contact_discovery_depth_focus_idx
  on public.contact_discovery_sessions(depth_focus_started_at, campaign_id, route_expansion_pass, created_at)
  where depth_focus_started_at is not null;

-- Readiness owns focus release. First-pass sessions remain unfocused when they
-- queue pass 2; the claimant will not focus one until no eligible pass-0 work
-- remains. Existing focused work retains focus through expansion passes.
create or replace function public.evaluate_contact_discovery_route_readiness(
  p_session_id uuid,
  p_research_summary text default null,
  p_uncertainties jsonb default '[]'::jsonb,
  p_unresolved_roles jsonb default '[]'::jsonb
)
returns table(action text,primary_ready boolean,fallback_ready boolean,route_count integer,expansion_pass integer)
language plpgsql security definer set search_path=public as $$
declare
  s public.contact_discovery_sessions%rowtype;
  v_route_count integer:=0;
  v_primary boolean:=false;
  v_fallback boolean:=false;
  v_next_pass integer;
  v_company_name text;
begin
  select * into s from public.contact_discovery_sessions where id=p_session_id for update;
  if s.id is null then raise exception 'contact discovery session missing'; end if;
  if s.status<>'RUNNING' then raise exception 'contact discovery session is not running'; end if;

  select count(distinct coalesce(cr.route_type,'')||'|'||coalesce(cr.channel_type,'')||'|'||coalesce(cr.channel_value,''))
    into v_route_count
  from public.commercial_routes cr
  where cr.organisation_id=s.organisation_id
    and cr.campaign_id=s.campaign_id
    and cr.company_id=s.company_id
    and cr.is_viable=true;

  v_primary:=v_route_count>=1;
  v_fallback:=v_route_count>=2;
  v_next_pass:=least(4,coalesce(s.route_expansion_pass,0)+1);

  update public.contact_discovery_sessions set
    route_expansion_pass=v_next_pass,
    primary_route_ready=v_primary,
    fallback_route_ready=v_fallback,
    research_summary=left(coalesce(p_research_summary,research_summary,'Route intelligence completed.'),1500),
    uncertainties_json=coalesce(p_uncertainties,'[]'::jsonb),
    unresolved_roles_json=coalesce(p_unresolved_roles,'[]'::jsonb),
    heartbeat_at=now(),
    updated_at=now()
  where id=s.id;

  if v_primary and v_fallback then
    update public.contact_discovery_sessions set
      route_research_state='READY',
      stage='VALIDATING',
      progress=88,
      depth_focus_started_at=null
    where id=s.id;
    return query select 'READY',v_primary,v_fallback,v_route_count,v_next_pass;
    return;
  end if;

  if v_next_pass<4 then
    update public.contact_discovery_sessions set
      status='QUEUED',
      job_state='QUEUED',
      stage='EXPANDING',
      progress=45,
      route_research_state='EXPANDING',
      next_attempt_at=now(),
      next_retry_at=null,
      lease_expires_at=null,
      claimed_at=null,
      scheduler_run_id=null,
      last_error=null,
      last_error_code=null,
      last_error_message=null,
      -- Preserve an existing depth focus. A first-pass company has NULL here,
      -- so breadth-first claim ordering will scan all remaining pass-0 companies
      -- before promoting any incomplete company into depth mode.
      depth_focus_started_at=s.depth_focus_started_at,
      updated_at=now()
    where id=s.id;

    select company_name into v_company_name from public.companies where id=s.company_id;
    insert into public.campaign_timeline(
      organisation_id,campaign_id,event_type,title,description,visibility,metadata_json
    ) values(
      s.organisation_id,
      s.campaign_id,
      'ROUTE_RESEARCH_EXPANDING',
      case when s.depth_focus_started_at is null then 'Market scan captured the first route signals' else 'MarketRoute is strengthening the access strategy' end,
      case when s.depth_focus_started_at is null
        then 'MarketRoute completed the first Route Intelligence pass for '||coalesce(v_company_name,'this organisation')||' and will scan the remaining approved companies before deepening this account.'
        else 'MarketRoute found '||v_route_count||' viable commercial route'||case when v_route_count=1 then '' else 's' end||' and is continuing this focused account before moving to the next company: '||coalesce(v_company_name,'the organisation')||'.'
      end,
      'CUSTOMER',
      jsonb_build_object(
        'companyId',s.company_id,
        'sessionId',s.id,
        'pass',v_next_pass,
        'primaryReady',v_primary,
        'fallbackReady',v_fallback,
        'routeCount',v_route_count,
        'dispatchPolicy','BREADTH_THEN_DEPTH',
        'phase',case when s.depth_focus_started_at is null then 'MARKET_SCAN' else 'DEEP_RESEARCH' end
      )
    );
    return query select 'EXPAND',v_primary,v_fallback,v_route_count,v_next_pass;
    return;
  end if;

  update public.contact_discovery_sessions set
    route_research_state='EXHAUSTED',
    route_exhausted_at=now(),
    stage='VALIDATING',
    progress=88,
    depth_focus_started_at=null
  where id=s.id;
  return query select 'EXHAUSTED',v_primary,v_fallback,v_route_count,v_next_pass;
end $$;

-- Claim priority:
--   0. Continue an already-focused depth account when it is due.
--   1. Otherwise scan pass-0 companies before any new pass-2+ expansion.
--   2. When breadth coverage is complete, promote the strongest incomplete
--      account into depth focus and keep that focus until readiness releases it.
create or replace function public.claim_contact_discovery(
  p_scheduler_run_id uuid,
  p_campaign_id uuid default null,
  p_fresh_only boolean default false
)
returns table(session_id uuid,organisation_id uuid,campaign_id uuid,company_id uuid,route_expansion_pass integer)
language plpgsql security definer set search_path=public as $$
declare
  v_id uuid;
  v_pass integer;
begin
  select s.id,coalesce(s.route_expansion_pass,0)
    into v_id,v_pass
  from public.contact_discovery_sessions s
  join public.companies c on c.id=s.company_id and c.review_status='APPROVED'
  join public.campaigns ca on ca.id=s.campaign_id and ca.status not in('PAUSED','CANCELLED','ARCHIVED','FAILED')
  join public.ai_governance_policies g on g.organisation_id=s.organisation_id and g.autonomy_enabled=true
  where s.attempt_count<8
    and coalesce(s.route_expansion_pass,0)<4
    and (p_campaign_id is null or s.campaign_id=p_campaign_id)
    and (
      (s.status='QUEUED' and coalesce(s.next_attempt_at,s.next_retry_at,now())<=now()
        and (not p_fresh_only or (coalesce(s.job_state,'QUEUED')='QUEUED' and s.attempt_count=0)))
      or
      (not p_fresh_only and s.status='FAILED' and s.job_state='FAILED_RETRYABLE'
        and coalesce(s.next_retry_at,s.next_attempt_at,now())<=now())
    )
  order by
    case
      when s.depth_focus_started_at is not null then 0
      when coalesce(s.route_expansion_pass,0)=0 then 1
      else 2
    end,
    -- Existing focus always wins its lane.
    s.depth_focus_started_at nulls last,
    -- Breadth scan is deterministic and fair.
    case when coalesce(s.route_expansion_pass,0)=0 then s.created_at end,
    -- Once breadth is complete, favour accounts whose first pass already found
    -- a viable route, then stronger route quality/confidence, before older work.
    case when coalesce(s.route_expansion_pass,0)>0 and s.primary_route_ready then 0 else 1 end,
    case when coalesce(s.route_expansion_pass,0)>0 then coalesce((
      select max(cr.route_quality) from public.commercial_routes cr
      where cr.organisation_id=s.organisation_id and cr.campaign_id=s.campaign_id and cr.company_id=s.company_id and cr.is_viable=true
    ),0) end desc,
    case when coalesce(s.route_expansion_pass,0)>0 then coalesce((
      select max(cr.confidence) from public.commercial_routes cr
      where cr.organisation_id=s.organisation_id and cr.campaign_id=s.campaign_id and cr.company_id=s.company_id and cr.is_viable=true
    ),0) end desc,
    case when s.status='FAILED' then 0 else 1 end,
    coalesce(s.started_at,s.created_at),
    s.created_at
  for update of s skip locked limit 1;

  if v_id is null then return; end if;

  update public.contact_discovery_sessions as target set
    status='RUNNING',
    job_state='RUNNING',
    stage=case when target.route_expansion_pass>0 then 'EXPANDING' else 'PREPARING' end,
    progress=5,
    attempt_count=target.attempt_count+1,
    claimed_at=now(),
    started_at=coalesce(target.started_at,now()),
    heartbeat_at=now(),
    last_heartbeat_at=now(),
    lease_expires_at=now()+interval '8 minutes',
    last_error=null,
    last_error_code=null,
    last_error_message=null,
    next_attempt_at=null,
    next_retry_at=null,
    scheduler_run_id=p_scheduler_run_id,
    -- A pass-0 claim is Market Scan only. The first expansion claim promotes
    -- the account into depth focus. Existing focus is preserved.
    depth_focus_started_at=case
      when coalesce(target.route_expansion_pass,0)>0 then coalesce(target.depth_focus_started_at,now())
      else target.depth_focus_started_at
    end,
    updated_at=now()
  where target.id=v_id;

  return query
    select s.id,s.organisation_id,s.campaign_id,s.company_id,s.route_expansion_pass
    from public.contact_discovery_sessions s
    where s.id=v_id;
end $$;

-- Planner mirrors claim priority so it cannot budget/dispatch Campaign B while
-- the claimant would choose another account. It remains governance-aware.
create or replace function public.plan_contact_discovery_dispatch(
  p_scheduler_run_id uuid,
  p_estimated_cost_usd numeric default 0.35
) returns table(dispatch_count integer,campaign_id uuid,mode text)
language plpgsql security definer set search_path=public as $$
declare
  v_campaign_id uuid;
  v_org_id uuid;
  v_policy public.ai_governance_policies%rowtype;
  v_requests integer:=0;
  v_campaign_requests integer:=0;
  v_cost numeric:=0;
  v_request_slots integer:=0;
  v_campaign_slots integer:=0;
  v_cost_slots integer:=0;
begin
  select s.campaign_id,s.organisation_id
    into v_campaign_id,v_org_id
  from public.contact_discovery_sessions s
  join public.companies c
    on c.id=s.company_id and c.organisation_id=s.organisation_id and c.campaign_id=s.campaign_id and c.review_status='APPROVED'
  join public.campaigns ca
    on ca.id=s.campaign_id and ca.organisation_id=s.organisation_id and ca.status not in ('PAUSED','CANCELLED','ARCHIVED','FAILED')
  join public.ai_governance_policies g
    on g.organisation_id=s.organisation_id and g.autonomy_enabled=true
  where s.attempt_count<8
    and coalesce(s.route_expansion_pass,0)<4
    and (
      (s.status='QUEUED' and coalesce(s.next_attempt_at,s.next_retry_at,now())<=now())
      or
      (s.status='FAILED' and coalesce(s.job_state,'')='FAILED_RETRYABLE'
        and coalesce(s.next_retry_at,s.next_attempt_at,now())<=now())
    )
  order by
    case
      when s.depth_focus_started_at is not null then 0
      when coalesce(s.route_expansion_pass,0)=0 then 1
      else 2
    end,
    s.depth_focus_started_at nulls last,
    case when coalesce(s.route_expansion_pass,0)=0 then s.created_at end,
    case when coalesce(s.route_expansion_pass,0)>0 and s.primary_route_ready then 0 else 1 end,
    case when coalesce(s.route_expansion_pass,0)>0 then coalesce((
      select max(cr.route_quality) from public.commercial_routes cr
      where cr.organisation_id=s.organisation_id and cr.campaign_id=s.campaign_id and cr.company_id=s.company_id and cr.is_viable=true
    ),0) end desc,
    case when coalesce(s.route_expansion_pass,0)>0 then coalesce((
      select max(cr.confidence) from public.commercial_routes cr
      where cr.organisation_id=s.organisation_id and cr.campaign_id=s.campaign_id and cr.company_id=s.company_id and cr.is_viable=true
    ),0) end desc,
    case when s.status='FAILED' then 0 else 1 end,
    coalesce(s.started_at,s.created_at),
    s.created_at
  limit 1;

  if v_campaign_id is null then
    return query select 0,null::uuid,'NORMAL'::text;
    return;
  end if;

  select * into v_policy from public.ensure_ai_governance_policy(v_org_id);

  select count(*),coalesce(sum(case when l.status='SUCCEEDED' then l.actual_cost_usd else l.estimated_cost_usd end),0)
    into v_requests,v_cost
  from public.ai_usage_ledger l
  where l.organisation_id=v_org_id
    and l.created_at>=date_trunc('day',now())
    and l.status in ('RESERVED','SUCCEEDED','FAILED');

  select count(*) into v_campaign_requests
  from public.ai_usage_ledger l
  where l.campaign_id=v_campaign_id
    and l.created_at>=date_trunc('day',now())
    and l.status in ('RESERVED','SUCCEEDED','FAILED');

  v_request_slots:=greatest(v_policy.daily_request_limit-v_requests,0);
  v_campaign_slots:=greatest(v_policy.campaign_daily_request_limit-v_campaign_requests,0);
  if greatest(p_estimated_cost_usd,0)>0 then
    v_cost_slots:=greatest(floor((v_policy.daily_cost_limit_usd-v_cost)/greatest(p_estimated_cost_usd,0))::integer,0);
  else
    v_cost_slots:=1;
  end if;

  if least(v_request_slots,v_campaign_slots,v_cost_slots)<=0 then
    return query select 0,v_campaign_id,'BUDGET_BLOCKED'::text;
    return;
  end if;

  return query select 1,v_campaign_id,'NORMAL'::text;
end $$;

revoke all on function public.evaluate_contact_discovery_route_readiness(uuid,text,jsonb,jsonb) from public,anon,authenticated;
revoke all on function public.claim_contact_discovery(uuid,uuid,boolean) from public,anon,authenticated;
revoke all on function public.plan_contact_discovery_dispatch(uuid,numeric) from public,anon,authenticated;
revoke execute on function public.evaluate_contact_discovery_route_readiness(uuid,text,jsonb,jsonb) from service_role;
revoke execute on function public.claim_contact_discovery(uuid,uuid,boolean) from service_role;
revoke execute on function public.plan_contact_discovery_dispatch(uuid,numeric) from service_role;
