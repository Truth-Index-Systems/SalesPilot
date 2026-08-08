-- Genesis G8.1 Release 9 — Discovery Repair Worker Consumption
-- Exact claim repair consumption -> sourced evidence -> deterministic Truth rehydration.

alter table public.ai_usage_ledger drop constraint if exists ai_usage_ledger_job_type_check;
alter table public.ai_usage_ledger add constraint ai_usage_ledger_job_type_check
  check (job_type in ('BUSINESS_ANALYSIS','COMPANY_DISCOVERY','CONTACT_DISCOVERY','OUTREACH','COMMERCIAL_REASONING','REPLY_INTELLIGENCE','GENESIS_G8_REPAIR'));

alter table public.genesis_g8_discovery_repair_queue
  add column if not exists attempt_count integer not null default 0 check (attempt_count >= 0),
  add column if not exists next_attempt_at timestamptz,
  add column if not exists lease_token text,
  add column if not exists lease_expires_at timestamptz;

create index if not exists genesis_g8_repair_claimable_idx
  on public.genesis_g8_discovery_repair_queue(status,next_attempt_at,lease_expires_at,created_at);

create or replace function public.claim_genesis_g8_discovery_repairs(
  p_limit integer default 2,
  p_worker_id text default 'genesis-g8-repair',
  p_lease_seconds integer default 75
) returns table(
  id uuid, dispatch_key text, entity_id uuid, entity_type text,
  entity_canonical_key text, entity_display_name text,
  claim_id uuid, claim_key text, claim_label text, criticality text,
  repair_mode text, objective text, minimum_evidence integer,
  additional_evidence_needed integer, blocking_mode text,
  organisation_id uuid, campaign_id uuid, company_id uuid,
  attempt_count integer, lease_token text
)
language plpgsql security definer set search_path=public as $$
begin
  return query
  with candidates as (
    select q.id
    from public.genesis_g8_discovery_repair_queue q
    where q.status in ('QUEUED','CLAIMED')
      and coalesce(q.next_attempt_at,now()) <= now()
      and (q.status='QUEUED' or q.lease_expires_at is null or q.lease_expires_at < now())
    order by case q.blocking_mode when 'BLOCKING_BEFORE_USE' then 0 else 1 end,
             case q.criticality when 'CRITICAL' then 0 when 'REQUIRED' then 1 when 'SUPPORTING' then 2 else 3 end,
             q.created_at
    for update skip locked
    limit greatest(1,least(coalesce(p_limit,2),4))
  ), claimed as (
    update public.genesis_g8_discovery_repair_queue q
       set status='CLAIMED',
           claimed_by=left(coalesce(p_worker_id,'genesis-g8-repair'),240),
           claimed_at=now(),
           lease_token=gen_random_uuid()::text,
           lease_expires_at=now()+(greatest(30,least(coalesce(p_lease_seconds,75),180))||' seconds')::interval,
           attempt_count=q.attempt_count+1,
           updated_at=now()
      from candidates c where q.id=c.id
      returning q.*
  )
  select c.id,c.dispatch_key,c.entity_id,c.entity_type,e.canonical_key,e.display_name,
         c.claim_id,c.claim_key,ic.label,c.criticality,c.repair_mode,c.objective,c.minimum_evidence,
         c.additional_evidence_needed,c.blocking_mode,c.organisation_id,c.campaign_id,c.company_id,
         c.attempt_count,c.lease_token
    from claimed c
    join public.genesis_g8_intelligence_entities e on e.id=c.entity_id
    join public.genesis_g8_intelligence_claims ic on ic.id=c.claim_id and ic.entity_id=c.entity_id;
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
         completed_at=case when p_status='COMPLETED' then now() else completed_at end,
         last_error=left(p_error,2000),
         next_attempt_at=case when p_status='QUEUED' then now()+make_interval(secs => least(300,greatest(15,15*(2^least(v_attempt,4))))) else null end,
         claimed_by=null, claimed_at=null, lease_token=null, lease_expires_at=null, updated_at=now()
   where id=p_repair_id;
end $$;

revoke all on function public.claim_genesis_g8_discovery_repairs(integer,text,integer) from public,anon,authenticated;
revoke all on function public.settle_genesis_g8_discovery_repair(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.claim_genesis_g8_discovery_repairs(integer,text,integer) to service_role;
grant execute on function public.settle_genesis_g8_discovery_repair(uuid,text,text,text) to service_role;

comment on function public.claim_genesis_g8_discovery_repairs(integer,text,integer) is 'R9 claims exact G8 repair contracts with leases, prioritising blocking and critical work without widening scope.';
comment on function public.settle_genesis_g8_discovery_repair(uuid,text,text,text) is 'R9 lease-fenced settlement with bounded retry backoff; COMPLETED means research finished, not that the claim became true.';

-- Evidence retry idempotency: a resumed worker must not multiply the same cited
-- evidence if it completed persistence before losing its repair lease.
alter table public.genesis_g8_intelligence_evidence
  add column if not exists evidence_fingerprint text generated always as (
    md5(coalesce(lower(source_uri),'')||'|'||direction||'|'||coalesce(excerpt,''))
  ) stored;
create unique index if not exists genesis_g8_evidence_claim_fingerprint_uidx
  on public.genesis_g8_intelligence_evidence(claim_id,evidence_fingerprint);

create or replace function public.insert_genesis_g8_evidence(
  p_claim_id uuid,
  p_direction text,
  p_source_class text,
  p_source_uri text,
  p_source_ref text,
  p_source_family text,
  p_excerpt text,
  p_strength double precision,
  p_traceability double precision,
  p_independence double precision,
  p_observed_at timestamptz,
  p_channel text,
  p_provenance jsonb default '{}'::jsonb
) returns setof public.genesis_g8_intelligence_evidence
language plpgsql security definer set search_path=public as $$
begin
  if not exists(select 1 from public.genesis_g8_intelligence_claims where id=p_claim_id) then raise exception 'GENESIS_G8_CLAIM_NOT_FOUND'; end if;
  if p_direction not in ('SUPPORTS','CONTRADICTS') then raise exception 'GENESIS_G8_INVALID_EVIDENCE_DIRECTION'; end if;
  if p_channel not in ('KNOWLEDGE_INTELLIGENCE','DISCOVERY_INTELLIGENCE') then raise exception 'GENESIS_G8_INVALID_CHANNEL'; end if;
  if p_strength not between 0 and 1 or p_traceability not between 0 and 1 or p_independence not between 0 and 1 then raise exception 'GENESIS_G8_EVIDENCE_FACTOR_OUT_OF_RANGE'; end if;

  return query
  insert into public.genesis_g8_intelligence_evidence(
    claim_id,direction,source_class,source_uri,source_ref,source_family,excerpt,strength,traceability,independence,observed_at,intelligence_channel,provenance_json
  ) values (
    p_claim_id,p_direction,p_source_class,p_source_uri,p_source_ref,p_source_family,p_excerpt,p_strength,p_traceability,p_independence,p_observed_at,p_channel,coalesce(p_provenance,'{}'::jsonb)
  )
  on conflict (claim_id,evidence_fingerprint) do update set
    source_ref=coalesce(genesis_g8_intelligence_evidence.source_ref,excluded.source_ref)
  returning *;
end $$;


-- Extend the existing authoritative governance reservation function so R9 repairs
-- are budgeted and share the same workspace/campaign parallelism limits.
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
  if p_job_type not in ('BUSINESS_ANALYSIS','COMPANY_DISCOVERY','CONTACT_DISCOVERY','OUTREACH','COMMERCIAL_REASONING','REPLY_INTELLIGENCE','GENESIS_G8_REPAIR') then raise exception 'invalid AI job type'; end if;
  if p_organisation_id is null then return query select false,null::uuid,'ORGANISATION_REQUIRED',0,0::numeric,0,0::numeric; return; end if;

  -- Serialise reservations per organisation so parallel serverless invocations
  -- cannot race past the in-flight cap.
  perform pg_advisory_xact_lock(hashtextextended('salespilot-ai-parallel:'||p_organisation_id::text,0));

  select * into v_policy from public.ensure_ai_governance_policy(p_organisation_id);
  select count(*),coalesce(sum(case when status='SUCCEEDED' then actual_cost_usd else estimated_cost_usd end),0) into v_requests,v_cost
  from public.ai_usage_ledger where organisation_id=p_organisation_id and created_at>=date_trunc('day',now()) and status in ('RESERVED','SUCCEEDED','FAILED');
  if p_campaign_id is not null then select count(*) into v_campaign_requests from public.ai_usage_ledger where campaign_id=p_campaign_id and created_at>=date_trunc('day',now()) and status in ('RESERVED','SUCCEEDED','FAILED'); end if;

  v_is_heavy := p_job_type in ('BUSINESS_ANALYSIS','COMPANY_DISCOVERY','CONTACT_DISCOVERY','OUTREACH','COMMERCIAL_REASONING','REPLY_INTELLIGENCE','GENESIS_G8_REPAIR');
  if v_is_heavy then
    select count(*) into v_org_in_flight
      from public.ai_usage_ledger
     where organisation_id=p_organisation_id
       and status='RESERVED'
       and job_type in ('BUSINESS_ANALYSIS','COMPANY_DISCOVERY','CONTACT_DISCOVERY','OUTREACH','COMMERCIAL_REASONING','REPLY_INTELLIGENCE','GENESIS_G8_REPAIR')
       and created_at>=now()-interval '2 hours';
    if v_org_in_flight>=2 then
      return query select false,null::uuid,'PARALLEL_ORGANISATION_LIMIT',v_requests,v_cost,v_policy.daily_request_limit,v_policy.daily_cost_limit_usd;
      return;
    end if;
  end if;

  if p_campaign_id is not null and p_job_type in ('COMPANY_DISCOVERY','CONTACT_DISCOVERY','GENESIS_G8_REPAIR') then
    select count(*) into v_campaign_research_in_flight
      from public.ai_usage_ledger
     where campaign_id=p_campaign_id
       and status='RESERVED'
       and job_type in ('COMPANY_DISCOVERY','CONTACT_DISCOVERY','GENESIS_G8_REPAIR')
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

create or replace function public.ai_parallelism_snapshot(p_organisation_id uuid)
returns table(organisation_in_flight integer,campaigns jsonb)
language sql security definer set search_path=public as $$
  select
    (select count(*)::integer from public.ai_usage_ledger l where l.organisation_id=p_organisation_id and l.status='RESERVED' and l.created_at>=now()-interval '2 hours'),
    coalesce((
      select jsonb_agg(jsonb_build_object('campaignId',q.campaign_id,'inFlight',q.in_flight) order by q.in_flight desc)
      from (
        select c.campaign_id,count(*)::integer as in_flight
        from public.ai_usage_ledger c
        where c.organisation_id=p_organisation_id and c.status='RESERVED' and c.created_at>=now()-interval '2 hours' and c.campaign_id is not null
        group by c.campaign_id
      ) q
    ),'[]'::jsonb);
$$;

