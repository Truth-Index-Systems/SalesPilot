-- Genesis G4.7.8: Route Intelligence dispatch fairness.
--
-- Approved-company Route Intelligence is customer-committed work. It must not
-- be starved by autonomous Company Discovery replenishment, and planning a route
-- must not mutate campaign burst state before the worker actually claims it.
--
-- This replaces the legacy initial-burst planner with a read-only, single-route
-- dispatch plan. The scheduler now gives one heavyweight execution window to
-- Route Intelligence whenever an eligible route job is due.

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
  -- Select exactly one campaign with runnable Route Intelligence work. Expansion
  -- and due retries outrank fresh queued work, matching claim_contact_discovery.
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
    case when s.stage='EXPANDING' then 0
         when s.status='FAILED' then 1
         else 2 end,
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

  -- Read-only planning: do not set initial_contact_burst_completed_at here.
  -- The old mutation could mark a burst complete even when execution-budget
  -- logic deferred the worker before it claimed anything.
  return query select 1,v_campaign_id,'NORMAL'::text;
end $$;

revoke all on function public.plan_contact_discovery_dispatch(uuid,numeric) from public,anon,authenticated;
grant execute on function public.plan_contact_discovery_dispatch(uuid,numeric) to service_role;
