-- Genesis post-freeze: depth-first Route Intelligence orchestration.
--
-- Customer-observed issue:
-- Route Intelligence could perform one pass for Company A, requeue it for 15s,
-- then use the next scheduler invocation on Company B. Across several approved
-- companies this looked like broad, shallow cycling instead of finishing one
-- account before moving to the next.
--
-- New invariant:
-- Once Route Intelligence starts a company, that in-progress company is the
-- preferred runnable account until it becomes READY, EXHAUSTED, terminally
-- failed, paused/cancelled, or is waiting on a genuine retry backoff.
--
-- This migration changes dispatch/claim ordering only. It does not change
-- route quality thresholds, evidence rules, pass count, opportunity scoring,
-- G5, or ownership fencing.

-- 1) Expansion is immediately eligible for the next scheduler invocation.
-- The global scheduler lease + one-heavyweight-worker rule already prevents
-- concurrent route passes; the historical 15-second artificial gap only made
-- it possible for another company to jump ahead.
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
      route_research_state='READY',stage='VALIDATING',progress=88
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
      -- Depth-first: make this same company runnable immediately on the next
      -- scheduler lease instead of yielding an artificial 15-second window.
      next_attempt_at=now(),
      next_retry_at=null,
      lease_expires_at=null,
      claimed_at=null,
      scheduler_run_id=null,
      last_error=null,
      last_error_code=null,
      last_error_message=null,
      updated_at=now()
    where id=s.id;

    select company_name into v_company_name from public.companies where id=s.company_id;
    insert into public.campaign_timeline(
      organisation_id,campaign_id,event_type,title,description,visibility,metadata_json
    ) values(
      s.organisation_id,
      s.campaign_id,
      'ROUTE_RESEARCH_EXPANDING',
      'SalesPilot is strengthening the access strategy',
      'SalesPilot found '||v_route_count||' viable commercial route'||case when v_route_count=1 then '' else 's' end||
        ' and is continuing this account before moving to the next company: '||coalesce(v_company_name,'the organisation')||'.',
      'CUSTOMER',
      jsonb_build_object(
        'companyId',s.company_id,
        'sessionId',s.id,
        'pass',v_next_pass,
        'primaryReady',v_primary,
        'fallbackReady',v_fallback,
        'routeCount',v_route_count,
        'dispatchPolicy','DEPTH_FIRST'
      )
    );
    return query select 'EXPAND',v_primary,v_fallback,v_route_count,v_next_pass;
    return;
  end if;

  update public.contact_discovery_sessions set
    route_research_state='EXHAUSTED',route_exhausted_at=now(),stage='VALIDATING',progress=88
  where id=s.id;
  return query select 'EXHAUSTED',v_primary,v_fallback,v_route_count,v_next_pass;
end $$;

-- 2) Claim an already-started account before a fresh account. Among started
-- accounts, the deepest expansion pass wins so a partially-researched company
-- is driven to completion instead of round-robin cycling.
create or replace function public.claim_contact_discovery(
  p_scheduler_run_id uuid,
  p_campaign_id uuid default null,
  p_fresh_only boolean default false
)
returns table(session_id uuid,organisation_id uuid,campaign_id uuid,company_id uuid,route_expansion_pass integer)
language plpgsql security definer set search_path=public as $$
declare v_id uuid;
begin
  select s.id into v_id
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
    -- Existing/started work owns the lane before fresh work.
    case when coalesce(s.route_expansion_pass,0)>0 or s.started_at is not null then 0 else 1 end,
    -- Continue the deepest account first. This is the depth-first invariant.
    coalesce(s.route_expansion_pass,0) desc,
    -- Retryable failures of that account are honoured when due; otherwise
    -- EXPANDING remains ahead of ordinary queued work.
    case when s.status='FAILED' then 0 when s.stage='EXPANDING' then 1 else 2 end,
    coalesce(s.started_at,s.created_at),
    coalesce(s.next_retry_at,s.next_attempt_at,s.created_at),
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
    updated_at=now()
  where target.id=v_id;

  return query
    select s.id,s.organisation_id,s.campaign_id,s.company_id,s.route_expansion_pass
    from public.contact_discovery_sessions s
    where s.id=v_id;
end $$;

-- 3) Make campaign planning use the same depth-first ordering as the claim.
-- This avoids the planner selecting Campaign B while the claimant would prefer
-- a deeper in-progress company in Campaign A.
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
    on c.id=s.company_id
   and c.organisation_id=s.organisation_id
   and c.campaign_id=s.campaign_id
   and c.review_status='APPROVED'
  join public.campaigns ca
    on ca.id=s.campaign_id
   and ca.organisation_id=s.organisation_id
   and ca.status not in ('PAUSED','CANCELLED','ARCHIVED','FAILED')
  join public.ai_governance_policies g
    on g.organisation_id=s.organisation_id
   and g.autonomy_enabled=true
  where s.attempt_count<8
    and coalesce(s.route_expansion_pass,0)<4
    and (
      (s.status='QUEUED' and coalesce(s.next_attempt_at,s.next_retry_at,now())<=now())
      or
      (s.status='FAILED' and coalesce(s.job_state,'')='FAILED_RETRYABLE'
        and coalesce(s.next_retry_at,s.next_attempt_at,now())<=now())
    )
  order by
    case when coalesce(s.route_expansion_pass,0)>0 or s.started_at is not null then 0 else 1 end,
    coalesce(s.route_expansion_pass,0) desc,
    case when s.status='FAILED' then 0 when s.stage='EXPANDING' then 1 else 2 end,
    coalesce(s.started_at,s.created_at),
    coalesce(s.next_retry_at,s.next_attempt_at,s.created_at),
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

-- Keep direct implementation functions unavailable to application roles. The
-- existing *_owned wrappers remain the only runtime entry points.
revoke all on function public.evaluate_contact_discovery_route_readiness(uuid,text,jsonb,jsonb) from public,anon,authenticated;
revoke all on function public.claim_contact_discovery(uuid,uuid,boolean) from public,anon,authenticated;
revoke all on function public.plan_contact_discovery_dispatch(uuid,numeric) from public,anon,authenticated;
revoke execute on function public.evaluate_contact_discovery_route_readiness(uuid,text,jsonb,jsonb) from service_role;
revoke execute on function public.claim_contact_discovery(uuid,uuid,boolean) from service_role;
revoke execute on function public.plan_contact_discovery_dispatch(uuid,numeric) from service_role;

-- SECURITY DEFINER owned wrappers call these as their owner, so service_role
-- continues to execute only the fenced wrappers created in G4.7.10/G4.7.5.
