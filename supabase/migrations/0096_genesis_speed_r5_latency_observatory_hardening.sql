-- MarketRoute Genesis — Speed R5: latency observatory and hardening.
-- Measures the durable background lifecycle, records prompt-cache/reasoning token
-- detail, reconciles webhook/checkpoint races, repairs stale collector ownership,
-- and makes recovery collection fair across campaigns. Commercial stage authority
-- and all R1-R4 execution boundaries remain unchanged.

alter table public.ai_background_responses
  add column if not exists submitted_at timestamptz,
  add column if not exists provider_completed_at timestamptz,
  add column if not exists collected_at timestamptz,
  add column if not exists owner_woken_at timestamptz;

update public.ai_background_responses
   set submitted_at=coalesce(submitted_at,created_at),
       provider_completed_at=case when status='completed' then coalesce(provider_completed_at,provider_event_at,completed_at) else provider_completed_at end,
       collected_at=case when response_json is not null then coalesce(collected_at,completed_at,updated_at) else collected_at end;

alter table public.ai_background_responses
  alter column submitted_at set default now();

alter table public.ai_usage_ledger
  add column if not exists cached_input_tokens integer,
  add column if not exists reasoning_tokens integer,
  add column if not exists validated_at timestamptz,
  add column if not exists persisted_at timestamptz;

create index if not exists ai_background_responses_observability_idx
  on public.ai_background_responses(organisation_id,task,submitted_at desc);
create index if not exists ai_background_responses_campaign_fairness_idx
  on public.ai_background_responses(organisation_id,campaign_id,status,provider_event_at,last_polled_at,created_at);

-- Record owner wake-up as an explicit lifecycle timestamp.
create or replace function public.wake_ai_background_owner(p_response_id text) returns void
language plpgsql security definer set search_path=public as $$
declare b public.ai_background_responses%rowtype;
begin
  select * into b from public.ai_background_responses where response_id=p_response_id;
  if b.response_id is null then return; end if;

  update public.ai_background_responses
     set owner_woken_at=coalesce(owner_woken_at,now()),updated_at=now()
   where response_id=p_response_id;

  if b.job_type='COMPANY_DISCOVERY' and b.job_id is not null then
    update public.discovery_sessions set next_attempt_at=now(),next_retry_at=null,updated_at=now()
     where id=b.job_id and status='QUEUED';
  elsif b.job_type='CONTACT_DISCOVERY' and b.job_id is not null then
    update public.contact_discovery_sessions set next_attempt_at=now(),next_retry_at=null,updated_at=now()
     where id=b.job_id and status='QUEUED';
  elsif b.job_type='BUSINESS_ANALYSIS' and b.job_id is not null then
    update public.business_analysis_jobs set next_retry_at=now(),updated_at=now()
     where id=b.job_id and status='QUEUED';
  elsif b.job_type in ('COMMERCIAL_REASONING','OUTREACH') and b.job_id is not null then
    update public.engagement_strategies set next_retry_at=now(),updated_at=now()
     where id=b.job_id and scheduler_run_id is null;
  end if;
end $$;

-- Close the webhook-before-checkpoint race. If a terminal provider event arrived
-- before the checkpoint was persisted, adopt it immediately during upsert.
create or replace function public.upsert_ai_background_response(
  p_checkpoint_key text,p_organisation_id uuid,p_campaign_id uuid,p_job_type text,p_job_id uuid,
  p_task text,p_request_scope text,p_model text,p_response_id text,p_status text,p_ledger_id uuid,p_response_json jsonb default null
) returns void
language plpgsql security definer set search_path=public as $$
declare
  v_event public.openai_webhook_events%rowtype;
  v_status text;
begin
  if p_checkpoint_key is null or length(p_checkpoint_key)<16 then raise exception 'invalid background checkpoint key'; end if;
  if p_status not in ('queued','in_progress','completed','failed','cancelled','incomplete') then raise exception 'invalid background response status'; end if;

  select * into v_event from public.openai_webhook_events
   where response_id=p_response_id
   order by provider_created_at desc,received_at desc limit 1;

  v_status := case when v_event.event_id is not null then case v_event.event_type
    when 'response.completed' then 'completed'
    when 'response.failed' then 'failed'
    when 'response.cancelled' then 'cancelled'
    when 'response.incomplete' then 'incomplete'
    else p_status end else p_status end;

  insert into public.ai_background_responses(
    checkpoint_key,organisation_id,campaign_id,job_type,job_id,task,request_scope,model,response_id,status,ledger_id,response_json,
    submitted_at,provider_event_type,provider_event_at,provider_completed_at,completed_at,terminal_at
  ) values(
    p_checkpoint_key,p_organisation_id,p_campaign_id,p_job_type,p_job_id,p_task,p_request_scope,p_model,p_response_id,v_status,p_ledger_id,p_response_json,
    now(),v_event.event_type,v_event.provider_created_at,
    case when v_status='completed' then v_event.provider_created_at else null end,
    case when v_status='completed' and p_response_json is not null then now() else null end,
    case when v_status in ('failed','cancelled','incomplete') then now() else null end
  ) on conflict(checkpoint_key) do update set
    response_id=excluded.response_id,status=excluded.status,
    response_json=coalesce(excluded.response_json,public.ai_background_responses.response_json),
    submitted_at=coalesce(public.ai_background_responses.submitted_at,excluded.submitted_at),
    provider_event_type=coalesce(excluded.provider_event_type,public.ai_background_responses.provider_event_type),
    provider_event_at=coalesce(excluded.provider_event_at,public.ai_background_responses.provider_event_at),
    provider_completed_at=coalesce(excluded.provider_completed_at,public.ai_background_responses.provider_completed_at),
    completed_at=case when excluded.status='completed' and excluded.response_json is not null then coalesce(public.ai_background_responses.completed_at,now()) else public.ai_background_responses.completed_at end,
    terminal_at=case when excluded.status in ('failed','cancelled','incomplete') then coalesce(public.ai_background_responses.terminal_at,now()) else public.ai_background_responses.terminal_at end,
    updated_at=now();

  if v_event.event_id is not null then
    update public.openai_webhook_events set matched=true where response_id=p_response_id and matched=false;
    perform public.wake_ai_background_owner(p_response_id);
  end if;
end $$;

create or replace function public.record_openai_background_webhook_event(
  p_event_id text,p_event_type text,p_response_id text,p_created_at bigint
) returns table(accepted boolean,duplicate boolean,matched boolean)
language plpgsql security definer set search_path=public as $$
declare v_inserted boolean:=false; v_insert_count integer:=0; v_matched boolean:=false; v_status text;
begin
  if p_event_id is null or p_response_id is null then raise exception 'webhook ids required'; end if;
  if p_event_type not in ('response.completed','response.failed','response.cancelled','response.incomplete') then return query select false,false,false; return; end if;
  insert into public.openai_webhook_events(event_id,event_type,response_id,provider_created_at)
  values(p_event_id,p_event_type,p_response_id,to_timestamp(p_created_at)) on conflict(event_id) do nothing;
  get diagnostics v_insert_count=row_count; v_inserted:=v_insert_count>0;
  v_status:=case p_event_type when 'response.completed' then 'completed' when 'response.failed' then 'failed' when 'response.cancelled' then 'cancelled' else 'incomplete' end;
  update public.ai_background_responses set
    status=v_status,provider_event_type=p_event_type,provider_event_at=to_timestamp(p_created_at),
    provider_completed_at=case when v_status='completed' then coalesce(provider_completed_at,to_timestamp(p_created_at)) else provider_completed_at end,
    terminal_at=case when v_status in ('failed','cancelled','incomplete') then coalesce(terminal_at,now()) else terminal_at end,
    collector_last_error=null,updated_at=now()
   where response_id=p_response_id;
  v_matched:=found;
  update public.openai_webhook_events set matched=v_matched where event_id=p_event_id;
  if v_matched then perform public.wake_ai_background_owner(p_response_id); end if;
  return query select true,not v_inserted,v_matched;
end $$;

-- Fair recovery: take at most the earliest-due item from each campaign first,
-- then fill remaining capacity. A high-volume campaign cannot monopolise polling.
create or replace function public.claim_ai_background_responses_for_collection(
  p_limit integer,p_lease_owner text,p_lease_seconds integer default 45
) returns table(checkpoint_key text,response_id text,status text,collector_lease_token uuid)
language plpgsql security definer set search_path=public as $$
begin
  return query
  with eligible as (
    select b.checkpoint_key,b.organisation_id,b.campaign_id,b.status,b.provider_event_at,b.last_polled_at,b.created_at,
      row_number() over(partition by b.organisation_id,coalesce(b.campaign_id,'00000000-0000-0000-0000-000000000000'::uuid)
        order by case when b.status='completed' then 0 else 1 end,coalesce(b.provider_event_at,b.last_polled_at,b.created_at),b.created_at) as lane_rank
    from public.ai_background_responses b
    where b.response_json is null and b.status in ('queued','in_progress','completed')
      and (b.collector_lease_expires_at is null or b.collector_lease_expires_at<=now())
      and (b.status='completed' or b.last_polled_at is null or b.last_polled_at<=now()-interval '45 seconds')
  ), candidates as (
    select b.checkpoint_key from public.ai_background_responses b
    join eligible e on e.checkpoint_key=b.checkpoint_key
    order by e.lane_rank,case when e.status='completed' then 0 else 1 end,coalesce(e.provider_event_at,e.last_polled_at,e.created_at),e.created_at
    for update of b skip locked limit greatest(1,least(coalesce(p_limit,6),12))
  ), claimed as (
    update public.ai_background_responses b set
      collector_lease_token=gen_random_uuid(),collector_lease_owner=left(coalesce(p_lease_owner,'collector'),200),
      collector_lease_expires_at=now()+make_interval(secs=>greatest(15,least(coalesce(p_lease_seconds,45),120))),
      collector_attempt_count=b.collector_attempt_count+1,last_polled_at=now(),collector_last_error=null,updated_at=now()
    from candidates c where b.checkpoint_key=c.checkpoint_key
    returning b.checkpoint_key,b.response_id,b.status,b.collector_lease_token
  ) select c.checkpoint_key,c.response_id,c.status,c.collector_lease_token from claimed c;
end $$;

create or replace function public.cache_ai_background_response_collection(
  p_response_id text,p_status text,p_response_json jsonb,p_collector_lease_token uuid default null,p_error_message text default null
) returns boolean
language plpgsql security definer set search_path=public as $$
declare v_updated boolean;
begin
  if p_status not in ('queued','in_progress','completed','failed','cancelled','incomplete') then raise exception 'invalid background collection status'; end if;
  update public.ai_background_responses set
    status=p_status,response_json=case when p_status='completed' then coalesce(p_response_json,response_json) else response_json end,
    provider_completed_at=case when p_status='completed' then coalesce(provider_completed_at,provider_event_at,now()) else provider_completed_at end,
    collected_at=case when p_status='completed' then coalesce(collected_at,now()) else collected_at end,
    completed_at=case when p_status='completed' then coalesce(completed_at,now()) else completed_at end,
    terminal_at=case when p_status in ('failed','cancelled','incomplete') then coalesce(terminal_at,now()) else terminal_at end,
    collector_lease_token=null,collector_lease_owner=null,collector_lease_expires_at=null,collector_last_error=left(p_error_message,1000),updated_at=now()
   where response_id=p_response_id and (p_collector_lease_token is null or collector_lease_token=p_collector_lease_token);
  v_updated:=found;
  if v_updated and p_status in ('completed','failed','cancelled','incomplete') then perform public.wake_ai_background_owner(p_response_id); end if;
  return v_updated;
end $$;

-- Reconcile races and stale ownership without creating provider work.
create or replace function public.repair_ai_background_observability() returns table(
  reconciled_webhooks integer,released_collector_leases integer,orphaned_reservations integer
)
language plpgsql security definer set search_path=public as $$
declare v_reconciled integer:=0; v_released integer:=0; v_orphans integer:=0; v_response_id text;
begin
  with matches as (
    select distinct on(e.response_id) e.response_id,e.event_type,e.provider_created_at
    from public.openai_webhook_events e join public.ai_background_responses b on b.response_id=e.response_id
    where e.matched=false order by e.response_id,e.provider_created_at desc
  ) update public.ai_background_responses b set
      status=case m.event_type when 'response.completed' then 'completed' when 'response.failed' then 'failed' when 'response.cancelled' then 'cancelled' else 'incomplete' end,
      provider_event_type=m.event_type,provider_event_at=m.provider_created_at,
      provider_completed_at=case when m.event_type='response.completed' then coalesce(b.provider_completed_at,m.provider_created_at) else b.provider_completed_at end,
      updated_at=now()
    from matches m where b.response_id=m.response_id;
  get diagnostics v_reconciled=row_count;
  update public.openai_webhook_events e set matched=true where matched=false and exists(select 1 from public.ai_background_responses b where b.response_id=e.response_id);
  for v_response_id in select distinct e.response_id from public.openai_webhook_events e join public.ai_background_responses b on b.response_id=e.response_id where e.matched=true and b.response_json is null and b.owner_woken_at is null loop
    perform public.wake_ai_background_owner(v_response_id);
  end loop;

  update public.ai_background_responses set collector_lease_token=null,collector_lease_owner=null,collector_lease_expires_at=null,
    collector_last_error=coalesce(collector_last_error,'R5_EXPIRED_COLLECTOR_LEASE_RECOVERED'),updated_at=now()
   where collector_lease_expires_at is not null and collector_lease_expires_at<now();
  get diagnostics v_released=row_count;

  -- A RESERVED ledger entry with no checkpoint and no response id after 30 minutes
  -- cannot occupy the R3 in-flight cap forever. Mark it failed for observability.
  update public.ai_usage_ledger l set status='FAILED',error_code='ORPHANED_RESERVATION_NO_RESPONSE_ID',
    error_message='R5 recovered a stale AI reservation with no durable provider response id',completed_at=now(),persisted_at=now()
   where l.status='RESERVED' and l.created_at<now()-interval '30 minutes'
     and l.response_id is null and not exists(select 1 from public.ai_background_responses b where b.ledger_id=l.id);
  get diagnostics v_orphans=row_count;

  return query select v_reconciled,v_released,v_orphans;
end $$;

-- Extend completion telemetry while keeping the existing RPC signature stable.
create or replace function public.complete_ai_request(
  p_ledger_id uuid,p_status text,p_actual_cost_usd numeric default 0,p_input_tokens integer default null,p_output_tokens integer default null,
  p_web_search_calls integer default 0,p_duration_ms integer default null,p_response_id text default null,p_error_code text default null,p_error_message text default null
) returns void
language plpgsql security definer set search_path=public as $$
begin
  if p_status not in ('SUCCEEDED','FAILED') then raise exception 'invalid completion status'; end if;
  update public.ai_usage_ledger set status=p_status,actual_cost_usd=greatest(coalesce(p_actual_cost_usd,0),0),input_tokens=p_input_tokens,output_tokens=p_output_tokens,
    web_search_calls=greatest(coalesce(p_web_search_calls,0),0),duration_ms=p_duration_ms,response_id=left(p_response_id,200),error_code=left(p_error_code,120),
    error_message=left(p_error_message,1000),validated_at=coalesce(validated_at,now()),persisted_at=now(),completed_at=now()
   where id=p_ledger_id;
end $$;

create or replace function public.record_ai_token_details(p_ledger_id uuid,p_cached_input_tokens integer,p_reasoning_tokens integer) returns void
language plpgsql security definer set search_path=public as $$
begin
  update public.ai_usage_ledger set cached_input_tokens=greatest(coalesce(p_cached_input_tokens,0),0),reasoning_tokens=greatest(coalesce(p_reasoning_tokens,0),0)
   where id=p_ledger_id;
end $$;

revoke all on function public.repair_ai_background_observability() from public,anon,authenticated;
revoke all on function public.record_ai_token_details(uuid,integer,integer) from public,anon,authenticated;
grant execute on function public.repair_ai_background_observability() to service_role;
grant execute on function public.record_ai_token_details(uuid,integer,integer) to service_role;
