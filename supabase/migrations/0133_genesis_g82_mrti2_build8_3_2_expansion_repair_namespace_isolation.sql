-- MR-TI-2 Build 8.3.2 — Expansion / Repair AI namespace isolation
-- Separates autonomous expansion background checkpoints from discovery repair while
-- preserving the same workspace governance, cost envelope and global heavy-work limits.

alter table public.ai_usage_ledger drop constraint if exists ai_usage_ledger_job_type_check;
alter table public.ai_usage_ledger add constraint ai_usage_ledger_job_type_check
  check (job_type in ('BUSINESS_ANALYSIS','COMPANY_DISCOVERY','CONTACT_DISCOVERY','OUTREACH','COMMERCIAL_REASONING','REPLY_INTELLIGENCE','GENESIS_G8_REPAIR','GENESIS_G82_EXPANSION'));

create or replace function public.reserve_ai_request(
  p_organisation_id uuid,p_campaign_id uuid,p_scheduler_run_id uuid,p_job_type text,p_job_id uuid,
  p_request_key text,p_model text,p_estimated_cost_usd numeric
) returns table(allowed boolean, ledger_id uuid, reason_code text, requests_today integer, cost_today numeric, request_limit integer, cost_limit numeric)
language plpgsql security definer set search_path=public as $$
declare
  v_policy public.ai_governance_policies%rowtype;
  v_requests integer:=0;
  v_campaign_requests integer:=0;
  v_cost numeric:=0;
  v_ledger uuid;
  v_org_in_flight integer:=0;
  v_campaign_research_in_flight integer:=0;
  v_is_heavy boolean:=false;
begin
  if p_job_type not in ('BUSINESS_ANALYSIS','COMPANY_DISCOVERY','CONTACT_DISCOVERY','OUTREACH','COMMERCIAL_REASONING','REPLY_INTELLIGENCE','GENESIS_G8_REPAIR','GENESIS_G82_EXPANSION') then raise exception 'invalid AI job type'; end if;
  if p_organisation_id is null then return query select false,null::uuid,'ORGANISATION_REQUIRED',0,0::numeric,0,0::numeric; return; end if;

  -- Serialise reservations per organisation so parallel serverless invocations
  -- cannot race past the in-flight cap.
  perform pg_advisory_xact_lock(hashtextextended('salespilot-ai-parallel:'||p_organisation_id::text,0));

  select * into v_policy from public.ensure_ai_governance_policy(p_organisation_id);
  select count(*),coalesce(sum(case when status='SUCCEEDED' then actual_cost_usd else estimated_cost_usd end),0) into v_requests,v_cost
  from public.ai_usage_ledger where organisation_id=p_organisation_id and created_at>=date_trunc('day',now()) and status in ('RESERVED','SUCCEEDED','FAILED');
  if p_campaign_id is not null then select count(*) into v_campaign_requests from public.ai_usage_ledger where campaign_id=p_campaign_id and created_at>=date_trunc('day',now()) and status in ('RESERVED','SUCCEEDED','FAILED'); end if;

  v_is_heavy := p_job_type in ('BUSINESS_ANALYSIS','COMPANY_DISCOVERY','CONTACT_DISCOVERY','OUTREACH','COMMERCIAL_REASONING','REPLY_INTELLIGENCE','GENESIS_G8_REPAIR','GENESIS_G82_EXPANSION');
  if v_is_heavy then
    select count(*) into v_org_in_flight
      from public.ai_usage_ledger
     where organisation_id=p_organisation_id
       and status='RESERVED'
       and job_type in ('BUSINESS_ANALYSIS','COMPANY_DISCOVERY','CONTACT_DISCOVERY','OUTREACH','COMMERCIAL_REASONING','REPLY_INTELLIGENCE','GENESIS_G8_REPAIR','GENESIS_G82_EXPANSION')
       and created_at>=now()-interval '2 hours';
    if v_org_in_flight>=2 then
      return query select false,null::uuid,'PARALLEL_ORGANISATION_LIMIT',v_requests,v_cost,v_policy.daily_request_limit,v_policy.daily_cost_limit_usd;
      return;
    end if;
  end if;

  if p_campaign_id is not null and p_job_type in ('COMPANY_DISCOVERY','CONTACT_DISCOVERY','GENESIS_G8_REPAIR','GENESIS_G82_EXPANSION') then
    select count(*) into v_campaign_research_in_flight
      from public.ai_usage_ledger
     where campaign_id=p_campaign_id
       and status='RESERVED'
       and job_type in ('COMPANY_DISCOVERY','CONTACT_DISCOVERY','GENESIS_G8_REPAIR','GENESIS_G82_EXPANSION')
       and created_at>=now()-interval '2 hours';
    if v_campaign_research_in_flight>=3 then
      return query select false,null::uuid,'PARALLEL_CAMPAIGN_RESEARCH_LIMIT',v_requests,v_cost,v_policy.daily_request_limit,v_policy.daily_cost_limit_usd;
      return;
    end if;
  end if;

  if not v_policy.autonomy_enabled then
    insert into public.ai_usage_ledger(organisation_id,campaign_id,scheduler_run_id,job_type,job_id,request_key,model,status,estimated_cost_usd,error_code)
    values(p_organisation_id,p_campaign_id,p_scheduler_run_id,p_job_type,p_job_id,p_request_key,p_model,'BLOCKED',greatest(p_estimated_cost_usd,0),'AUTONOMY_DISABLED') on conflict(request_key) do nothing returning id into v_ledger;
    return query select false,v_ledger,'AUTONOMY_DISABLED',v_requests,v_cost,v_policy.daily_request_limit,v_policy.daily_cost_limit_usd; return;
  end if;
  if v_requests>=v_policy.daily_request_limit then
    insert into public.ai_usage_ledger(organisation_id,campaign_id,scheduler_run_id,job_type,job_id,request_key,model,status,estimated_cost_usd,error_code)
    values(p_organisation_id,p_campaign_id,p_scheduler_run_id,p_job_type,p_job_id,p_request_key,p_model,'BLOCKED',greatest(p_estimated_cost_usd,0),'WORKSPACE_DAILY_REQUEST_LIMIT') on conflict(request_key) do nothing returning id into v_ledger;
    return query select false,v_ledger,'WORKSPACE_DAILY_REQUEST_LIMIT',v_requests,v_cost,v_policy.daily_request_limit,v_policy.daily_cost_limit_usd; return;
  end if;
  if p_campaign_id is not null and v_campaign_requests>=v_policy.campaign_daily_request_limit then
    insert into public.ai_usage_ledger(organisation_id,campaign_id,scheduler_run_id,job_type,job_id,request_key,model,status,estimated_cost_usd,error_code)
    values(p_organisation_id,p_campaign_id,p_scheduler_run_id,p_job_type,p_job_id,p_request_key,p_model,'BLOCKED',greatest(p_estimated_cost_usd,0),'CAMPAIGN_DAILY_REQUEST_LIMIT') on conflict(request_key) do nothing returning id into v_ledger;
    return query select false,v_ledger,'CAMPAIGN_DAILY_REQUEST_LIMIT',v_requests,v_cost,v_policy.daily_request_limit,v_policy.daily_cost_limit_usd; return;
  end if;
  if v_cost+greatest(p_estimated_cost_usd,0)>v_policy.daily_cost_limit_usd then
    insert into public.ai_usage_ledger(organisation_id,campaign_id,scheduler_run_id,job_type,job_id,request_key,model,status,estimated_cost_usd,error_code)
    values(p_organisation_id,p_campaign_id,p_scheduler_run_id,p_job_type,p_job_id,p_request_key,p_model,'BLOCKED',greatest(p_estimated_cost_usd,0),'WORKSPACE_DAILY_COST_LIMIT') on conflict(request_key) do nothing returning id into v_ledger;
    return query select false,v_ledger,'WORKSPACE_DAILY_COST_LIMIT',v_requests,v_cost,v_policy.daily_request_limit,v_policy.daily_cost_limit_usd; return;
  end if;
  insert into public.ai_usage_ledger(organisation_id,campaign_id,scheduler_run_id,job_type,job_id,request_key,model,status,estimated_cost_usd)
  values(p_organisation_id,p_campaign_id,p_scheduler_run_id,p_job_type,p_job_id,p_request_key,p_model,'RESERVED',greatest(p_estimated_cost_usd,0))
  on conflict(request_key) do update set request_key=excluded.request_key returning id into v_ledger;
  return query select true,v_ledger,null::text,v_requests+1,v_cost+greatest(p_estimated_cost_usd,0),v_policy.daily_request_limit,v_policy.daily_cost_limit_usd;
end $$;


create or replace function public.genesis_g8_capacity_budget_snapshot(p_system_organisation_id uuid)
returns table(
  governance_enabled boolean,daily_request_limit integer,daily_cost_limit_usd numeric,requests_today integer,cost_today_usd numeric,
  g8_repair_calls_today integer,g8_repair_cost_today_usd numeric,background_repair_calls_today integer,background_repair_cost_today_usd numeric,
  live_customer_work_pending boolean,queued_customer_repairs integer,active_customer_repairs integer,truth_gain_today double precision,truth_gain_per_repair_call double precision
) language sql security definer set search_path=public as $$
with policy as (
  select p.autonomy_enabled,p.daily_request_limit,p.daily_cost_limit_usd from public.ai_governance_policies p where p.organisation_id=p_system_organisation_id
), usage_today as (
  select count(*)::integer requests,coalesce(sum(case when l.status='SUCCEEDED' then l.actual_cost_usd else l.estimated_cost_usd end),0)::numeric cost
  from public.ai_usage_ledger l where l.organisation_id=p_system_organisation_id and l.created_at>=date_trunc('day',now()) and l.status in ('RESERVED','SUCCEEDED','FAILED')
), g8_calls as (
  select count(*) filter(where l.status='SUCCEEDED')::integer calls,
    coalesce(sum(case when l.status='SUCCEEDED' then l.actual_cost_usd else l.estimated_cost_usd end),0)::numeric cost,
    count(*) filter(where l.status='SUCCEEDED' and ((q.organisation_id is null and q.campaign_id is null and q.company_id is null and q.id is not null) or x.id is not null))::integer background_calls,
    coalesce(sum(case when ((q.organisation_id is null and q.campaign_id is null and q.company_id is null and q.id is not null) or x.id is not null) then case when l.status='SUCCEEDED' then l.actual_cost_usd else l.estimated_cost_usd end else 0 end),0)::numeric background_cost
  from public.ai_usage_ledger l left join public.genesis_g8_discovery_repair_queue q on q.id=l.job_id left join public.genesis_g82_expansion_jobs x on x.id=l.job_id
  where l.organisation_id=p_system_organisation_id and l.job_type in ('GENESIS_G8_REPAIR','GENESIS_G82_EXPANSION') and l.created_at>=date_trunc('day',now()) and l.status in ('RESERVED','SUCCEEDED','FAILED')
), customer_repair as (
  select count(*) filter(where q.status='QUEUED' and (q.organisation_id is not null or q.campaign_id is not null or q.company_id is not null))::integer queued,
    count(*) filter(where q.status='CLAIMED' and (q.organisation_id is not null or q.campaign_id is not null or q.company_id is not null))::integer active
  from public.genesis_g8_discovery_repair_queue q
), daily_truth as (
  select s.entity_id,(array_agg(s.truth_index order by s.calculated_at asc))[1]::double precision first_truth,
    (array_agg(s.truth_index order by s.calculated_at desc))[1]::double precision last_truth
  from public.genesis_g8_truth_v2_snapshots s where s.calculated_at>=date_trunc('day',now()) group by s.entity_id
), gain as (select coalesce(sum(greatest(last_truth-first_truth,0)),0)::double precision truth_gain from daily_truth)
select coalesce((select autonomy_enabled from policy),false),coalesce((select daily_request_limit from policy),0),coalesce((select daily_cost_limit_usd from policy),0),
  coalesce((select requests from usage_today),0),coalesce((select cost from usage_today),0),coalesce((select calls from g8_calls),0),coalesce((select cost from g8_calls),0),
  coalesce((select background_calls from g8_calls),0),coalesce((select background_cost from g8_calls),0),
  (coalesce((select queued from customer_repair),0)+coalesce((select active from customer_repair),0))>0,
  coalesce((select queued from customer_repair),0),coalesce((select active from customer_repair),0),coalesce((select truth_gain from gain),0),
  case when coalesce((select calls from g8_calls),0)>0 then coalesce((select truth_gain from gain),0)/greatest((select calls from g8_calls),1) else 0 end;
$$;

comment on function public.reserve_ai_request(uuid,uuid,uuid,text,uuid,text,text,numeric) is
  'Build 8.3.2: governed AI reservation supports isolated GENESIS_G82_EXPANSION and GENESIS_G8_REPAIR namespaces under shared workspace limits.';

notify pgrst, 'reload schema';
