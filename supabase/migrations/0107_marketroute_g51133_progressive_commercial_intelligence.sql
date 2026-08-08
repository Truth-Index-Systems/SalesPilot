-- MarketRoute G5.1.13.3 — Progressive Commercial Intelligence.
-- Deterministically prioritise verified companies before expensive route/contact
-- reasoning. No verified company is removed: lower tiers remain eligible after
-- stronger accounts, preserving final coverage and quality.

alter table public.companies
  add column if not exists commercial_priority_score integer,
  add column if not exists commercial_priority_tier text,
  add column if not exists commercial_priority_reasons jsonb not null default '[]'::jsonb,
  add column if not exists commercial_priority_scored_at timestamptz;

alter table public.companies drop constraint if exists companies_commercial_priority_score_check;
alter table public.companies add constraint companies_commercial_priority_score_check
  check (commercial_priority_score is null or commercial_priority_score between 0 and 100);
alter table public.companies drop constraint if exists companies_commercial_priority_tier_check;
alter table public.companies add constraint companies_commercial_priority_tier_check
  check (commercial_priority_tier is null or commercial_priority_tier in ('A','B','C'));

create index if not exists companies_route_priority_idx
  on public.companies(organisation_id,campaign_id,review_status,commercial_priority_score desc,created_at);

create or replace function public.set_company_commercial_priority_owned(
  p_session_id uuid,
  p_scheduler_run_id uuid,
  p_website_url text,
  p_priority_score integer,
  p_priority_tier text,
  p_priority_reasons jsonb default '[]'::jsonb
) returns boolean
language plpgsql security definer set search_path=public as $$
declare
  s public.discovery_sessions%rowtype;
  v_domain text;
  v_tier text:=upper(coalesce(p_priority_tier,''));
begin
  perform public.assert_company_discovery_owner(p_session_id,p_scheduler_run_id,true);
  select * into s from public.discovery_sessions where id=p_session_id;
  if s.id is null then raise exception 'discovery session missing'; end if;
  if p_priority_score<0 or p_priority_score>100 then raise exception 'invalid commercial priority score'; end if;
  if v_tier not in ('A','B','C') then raise exception 'invalid commercial priority tier'; end if;
  if jsonb_typeof(coalesce(p_priority_reasons,'[]'::jsonb))<>'array' then raise exception 'commercial priority reasons must be an array'; end if;
  v_domain:=lower(regexp_replace(regexp_replace(coalesce(p_website_url,''),'^https?://',''),'[/#?].*$',''));
  v_domain:=regexp_replace(v_domain,'^www\.','');
  if v_domain='' then return false; end if;

  update public.companies c set
    commercial_priority_score=p_priority_score,
    commercial_priority_tier=v_tier,
    commercial_priority_reasons=p_priority_reasons,
    commercial_priority_scored_at=now(),
    updated_at=now()
  where c.organisation_id=s.organisation_id
    and c.campaign_id=s.campaign_id
    and c.discovery_session_id=s.id
    and c.canonical_domain=v_domain;
  return found;
end $$;

revoke all on function public.set_company_commercial_priority_owned(uuid,uuid,text,integer,text,jsonb) from public,anon,authenticated;
grant execute on function public.set_company_commercial_priority_owned(uuid,uuid,text,integer,text,jsonb) to service_role;

-- Existing verified companies remain fully eligible. Give legacy/unscored rows a
-- neutral score so they participate after newly scored strongest matches.
update public.companies
set commercial_priority_score=coalesce(commercial_priority_score,greatest(0,least(100,confidence))),
    commercial_priority_tier=coalesce(commercial_priority_tier,case when confidence>=80 then 'A' when confidence>=68 then 'B' else 'C' end),
    commercial_priority_reasons=case when commercial_priority_reasons='[]'::jsonb then jsonb_build_array('Legacy priority derived from discovery confidence') else commercial_priority_reasons end,
    commercial_priority_scored_at=coalesce(commercial_priority_scored_at,now())
where commercial_priority_score is null or commercial_priority_tier is null;

-- The existing breadth-then-depth authority remains unchanged. Only the pass-0
-- ordering changes: strongest verified companies receive expensive route research
-- first; every lower-ranked company remains eligible afterwards.

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
    case when coalesce(s.route_expansion_pass,0)=0 then coalesce(c.commercial_priority_score,0) end desc,
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
    case when coalesce(s.route_expansion_pass,0)=0 then coalesce(c.commercial_priority_score,0) end desc,
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

revoke all on function public.claim_contact_discovery(uuid,uuid,boolean) from public,anon,authenticated;
revoke all on function public.plan_contact_discovery_dispatch(uuid,numeric) from public,anon,authenticated;
revoke execute on function public.claim_contact_discovery(uuid,uuid,boolean) from service_role;
revoke execute on function public.plan_contact_discovery_dispatch(uuid,numeric) from service_role;
