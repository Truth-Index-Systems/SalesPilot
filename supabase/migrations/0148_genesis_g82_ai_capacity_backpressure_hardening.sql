-- Genesis T8 G8.2 AI Capacity / Backpressure Hardening
-- Raises the bounded organisation-level active AI reservation ceiling from 2 to 12.
-- Temporary capacity/governance deferrals no longer consume worker retry attempts.
-- Only historical capacity-limit failures are requeued. Provider billing/no-credit
-- failures are intentionally left FAILED and require explicit operator action.

create or replace function public.ai_governance_capacity_snapshot(p_organisation_id uuid,p_campaign_id uuid default null)
returns table(active_heavy integer,organisation_limit integer,active_campaign_research integer,campaign_research_limit integer)
language sql security definer set search_path=public as $$
  select
    count(*) filter(where l.job_type in ('BUSINESS_ANALYSIS','COMPANY_DISCOVERY','CONTACT_DISCOVERY','OUTREACH','COMMERCIAL_REASONING','REPLY_INTELLIGENCE','GENESIS_G8_REPAIR','GENESIS_G82_EXPANSION'))::integer,
    12::integer,
    count(*) filter(where p_campaign_id is not null and l.campaign_id=p_campaign_id and l.job_type in ('COMPANY_DISCOVERY','CONTACT_DISCOVERY','GENESIS_G8_REPAIR','GENESIS_G82_EXPANSION'))::integer,
    3::integer
  from public.ai_usage_ledger l
  where l.organisation_id=p_organisation_id
    and l.status='RESERVED'
    and (
      exists (select 1 from public.ai_background_responses b where b.ledger_id=l.id and b.status in ('queued','in_progress') and coalesce(b.last_polled_at,b.updated_at,b.created_at)>now()-interval '10 minutes')
      or (
        not exists (select 1 from public.ai_background_responses b where b.ledger_id=l.id)
        and coalesce(l.reservation_expires_at,l.created_at+interval '10 minutes')>now()
      )
    );
$$;



create or replace function public.reserve_ai_request(
  p_organisation_id uuid,p_campaign_id uuid,p_scheduler_run_id uuid,p_job_type text,p_job_id uuid,
  p_request_key text,p_model text,p_estimated_cost_usd numeric
) returns table(allowed boolean, ledger_id uuid, reason_code text, requests_today integer, cost_today numeric, request_limit integer, cost_limit numeric)
language plpgsql security definer set search_path=public as $$
declare
  v_policy public.ai_governance_policies%rowtype;
  v_requests integer:=0; v_campaign_requests integer:=0; v_cost numeric:=0; v_ledger uuid;
  v_org_in_flight integer:=0; v_campaign_research_in_flight integer:=0; v_is_heavy boolean:=false;
begin
  if p_job_type not in ('BUSINESS_ANALYSIS','COMPANY_DISCOVERY','CONTACT_DISCOVERY','OUTREACH','COMMERCIAL_REASONING','REPLY_INTELLIGENCE','GENESIS_G8_REPAIR','GENESIS_G82_EXPANSION') then raise exception 'invalid AI job type'; end if;
  if p_organisation_id is null then return query select false,null::uuid,'ORGANISATION_REQUIRED',0,0::numeric,0,0::numeric; return; end if;

  perform pg_advisory_xact_lock(hashtextextended('salespilot-ai-parallel:'||p_organisation_id::text,0));
  perform public.reconcile_ai_reservation_capacity(p_organisation_id);

  select * into v_policy from public.ensure_ai_governance_policy(p_organisation_id);
  select count(*),coalesce(sum(case when status='SUCCEEDED' then actual_cost_usd else estimated_cost_usd end),0) into v_requests,v_cost
  from public.ai_usage_ledger where organisation_id=p_organisation_id and created_at>=date_trunc('day',now()) and status in ('RESERVED','SUCCEEDED','FAILED');
  if p_campaign_id is not null then select count(*) into v_campaign_requests from public.ai_usage_ledger where campaign_id=p_campaign_id and created_at>=date_trunc('day',now()) and status in ('RESERVED','SUCCEEDED','FAILED'); end if;

  v_is_heavy := true;
  if v_is_heavy then
    select count(*)::integer into v_org_in_flight
    from public.ai_usage_ledger l
    where l.organisation_id=p_organisation_id and l.status='RESERVED'
      and l.job_type in ('BUSINESS_ANALYSIS','COMPANY_DISCOVERY','CONTACT_DISCOVERY','OUTREACH','COMMERCIAL_REASONING','REPLY_INTELLIGENCE','GENESIS_G8_REPAIR','GENESIS_G82_EXPANSION')
      and (exists(select 1 from public.ai_background_responses b where b.ledger_id=l.id and b.status in ('queued','in_progress') and coalesce(b.last_polled_at,b.updated_at,b.created_at)>now()-interval '10 minutes')
        or (not exists(select 1 from public.ai_background_responses b where b.ledger_id=l.id) and coalesce(l.reservation_expires_at,l.created_at+interval '10 minutes')>now()));
    if v_org_in_flight>=12 then return query select false,null::uuid,'PARALLEL_ORGANISATION_LIMIT',v_requests,v_cost,v_policy.daily_request_limit,v_policy.daily_cost_limit_usd; return; end if;
  end if;

  if p_campaign_id is not null and p_job_type in ('COMPANY_DISCOVERY','CONTACT_DISCOVERY','GENESIS_G8_REPAIR','GENESIS_G82_EXPANSION') then
    select count(*)::integer into v_campaign_research_in_flight
    from public.ai_usage_ledger l
    where l.campaign_id=p_campaign_id and l.status='RESERVED'
      and l.job_type in ('COMPANY_DISCOVERY','CONTACT_DISCOVERY','GENESIS_G8_REPAIR','GENESIS_G82_EXPANSION')
      and (exists(select 1 from public.ai_background_responses b where b.ledger_id=l.id and b.status in ('queued','in_progress') and coalesce(b.last_polled_at,b.updated_at,b.created_at)>now()-interval '10 minutes')
        or (not exists(select 1 from public.ai_background_responses b where b.ledger_id=l.id) and coalesce(l.reservation_expires_at,l.created_at+interval '10 minutes')>now()));
    if v_campaign_research_in_flight>=3 then return query select false,null::uuid,'PARALLEL_CAMPAIGN_RESEARCH_LIMIT',v_requests,v_cost,v_policy.daily_request_limit,v_policy.daily_cost_limit_usd; return; end if;
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

  insert into public.ai_usage_ledger(organisation_id,campaign_id,scheduler_run_id,job_type,job_id,request_key,model,status,estimated_cost_usd,reservation_expires_at,reservation_heartbeat_at)
  values(p_organisation_id,p_campaign_id,p_scheduler_run_id,p_job_type,p_job_id,p_request_key,p_model,'RESERVED',greatest(p_estimated_cost_usd,0),now()+interval '10 minutes',now())
  on conflict(request_key) do update set reservation_expires_at=case when public.ai_usage_ledger.status='RESERVED' then now()+interval '10 minutes' else public.ai_usage_ledger.reservation_expires_at end,
    reservation_heartbeat_at=case when public.ai_usage_ledger.status='RESERVED' then now() else public.ai_usage_ledger.reservation_heartbeat_at end
  returning id into v_ledger;
  return query select true,v_ledger,null::text,v_requests+1,v_cost+greatest(p_estimated_cost_usd,0),v_policy.daily_request_limit,v_policy.daily_cost_limit_usd;
end $$;

revoke all on function public.reconcile_ai_reservation_capacity(uuid) from public,anon,authenticated;
revoke all on function public.ai_governance_capacity_snapshot(uuid,uuid) from public,anon,authenticated;
grant execute on function public.reconcile_ai_reservation_capacity(uuid) to service_role;
grant execute on function public.ai_governance_capacity_snapshot(uuid,uuid) to service_role;

comment on function public.reserve_ai_request(uuid,uuid,uuid,text,uuid,text,text,numeric) is
'MR-TI-2 Build 8.3.6: lease-reconciled AI reservation with active-provider-only parallel capacity counting.';

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
      attempt_count=case
        when p_status='QUEUED' and (
          coalesce(p_error,'') like 'OPENAI_BACKGROUND_PENDING:%'
          or coalesce(p_error,'') like 'AI_PARALLEL_CAPACITY:%'
          or coalesce(p_error,'') like 'AI_GOVERNANCE_BLOCKED:%'
        ) then greatest(attempt_count-1,0)
        else attempt_count
      end,
      lease_token=null, lease_expires_at=null, worker_id=null,
      completed_at=case when p_status='COMPLETED' then now() else completed_at end,
      updated_at=now()
  where id=p_job_id and status='CLAIMED' and lease_token=p_lease_token;
  if not found then raise exception 'GENESIS_G82_EXPANSION_LEASE_MISMATCH'; end if;
end $$;



create or replace function public.settle_genesis_g8_discovery_repair(
  p_repair_id uuid,
  p_lease_token text,
  p_status text,
  p_error text default null
) returns void
language plpgsql security definer set search_path=public as $$
declare v_attempt integer;
begin
  if p_status not in ('COMPLETED','QUEUED','FAILED') then raise exception 'GENESIS_G8_INVALID_REPAIR_SETTLEMENT'; end if;
  select attempt_count into v_attempt from public.genesis_g8_discovery_repair_queue
   where id=p_repair_id and lease_token=p_lease_token and status='CLAIMED' for update;
  if v_attempt is null then raise exception 'GENESIS_G8_REPAIR_LEASE_LOST'; end if;

  update public.genesis_g8_discovery_repair_queue
     set status=p_status,
         attempt_count=case
           when p_status='QUEUED' and (
             coalesce(p_error,'') like 'OPENAI_BACKGROUND_PENDING:%'
             or coalesce(p_error,'') like 'AI_PARALLEL_CAPACITY:%'
             or coalesce(p_error,'') like 'AI_GOVERNANCE_BLOCKED:%'
           ) then greatest(attempt_count-1,0)
           else attempt_count
         end,
         completed_at=case when p_status='COMPLETED' then now() else completed_at end,
         last_error=left(p_error,2000),
         next_attempt_at=case when p_status='QUEUED' then now()+make_interval(secs => least(300,greatest(15,15*(2^least(v_attempt,4))))) else null end,
         claimed_by=null, claimed_at=null, lease_token=null, lease_expires_at=null, updated_at=now()
   where id=p_repair_id;
end $$;



-- Recover only historical failures caused by temporary parallel-capacity pressure.
-- Explicitly exclude provider billing/credit terminal failures.
update public.genesis_g82_expansion_jobs
set status='QUEUED',
    attempt_count=0,
    lease_token=null,
    lease_expires_at=null,
    worker_id=null,
    last_error='CIE_CAPACITY_BACKPRESSURE_REQUEUED:' || left(coalesce(last_error,''),1800),
    updated_at=now()
where status='FAILED'
  and coalesce(last_error,'') not ilike '%no credits remaining%'
  and (
    coalesce(last_error,'') like 'AI_PARALLEL_CAPACITY:%'
    or coalesce(last_error,'') ilike '%PARALLEL_ORGANISATION_LIMIT%'
  );

update public.genesis_g8_discovery_repair_queue
set status='QUEUED',
    attempt_count=0,
    next_attempt_at=now(),
    claimed_by=null,
    claimed_at=null,
    lease_token=null,
    lease_expires_at=null,
    last_error='CIE_CAPACITY_BACKPRESSURE_REQUEUED:' || left(coalesce(last_error,''),1800),
    updated_at=now()
where status='FAILED'
  and coalesce(last_error,'') not ilike '%no credits remaining%'
  and (
    coalesce(last_error,'') like 'AI_PARALLEL_CAPACITY:%'
    or coalesce(last_error,'') ilike '%PARALLEL_ORGANISATION_LIMIT%'
  );

revoke all on function public.reserve_ai_request(uuid,uuid,uuid,text,uuid,text,text,numeric) from public,anon,authenticated;
grant execute on function public.reserve_ai_request(uuid,uuid,uuid,text,uuid,text,text,numeric) to service_role;

revoke all on function public.ai_governance_capacity_snapshot(uuid,uuid) from public,anon,authenticated;
grant execute on function public.ai_governance_capacity_snapshot(uuid,uuid) to service_role;

revoke all on function public.settle_genesis_g82_expansion_job(uuid,uuid,text,integer,integer,integer,integer,text) from public,anon,authenticated;
grant execute on function public.settle_genesis_g82_expansion_job(uuid,uuid,text,integer,integer,integer,integer,text) to service_role;

revoke all on function public.settle_genesis_g8_discovery_repair(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.settle_genesis_g8_discovery_repair(uuid,text,text,text) to service_role;

comment on function public.reserve_ai_request(uuid,uuid,uuid,text,uuid,text,text,numeric) is
'G8.2 capacity hardening: bounded 12-slot organisation concurrency with lease reconciliation and backpressure deferral.';

comment on function public.settle_genesis_g82_expansion_job(uuid,uuid,text,integer,integer,integer,integer,text) is
'G8.2 capacity hardening: temporary OpenAI/background/governance capacity deferrals remain QUEUED without consuming retry budget.';

comment on function public.settle_genesis_g8_discovery_repair(uuid,text,text,text) is
'G8.2 capacity hardening: exact repair backpressure remains QUEUED without consuming retry budget.';

notify pgrst, 'reload schema';
