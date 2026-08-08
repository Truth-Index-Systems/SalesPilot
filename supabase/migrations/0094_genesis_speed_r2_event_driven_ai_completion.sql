-- MarketRoute Genesis — Speed R2: event-driven OpenAI completion.
-- Webhook notification becomes the primary completion signal. A dedicated
-- collector owns response retrieval/polling; AI workers only submit or consume
-- cached completed responses and therefore never block on provider thinking time.

alter table public.ai_background_responses
  drop constraint if exists ai_background_responses_status_check;

alter table public.ai_background_responses
  add constraint ai_background_responses_status_check
  check (status in ('queued','in_progress','completed','failed','cancelled','incomplete'));

alter table public.ai_background_responses
  add column if not exists provider_event_type text,
  add column if not exists provider_event_at timestamptz,
  add column if not exists last_polled_at timestamptz,
  add column if not exists collector_attempt_count integer not null default 0,
  add column if not exists collector_lease_token uuid,
  add column if not exists collector_lease_owner text,
  add column if not exists collector_lease_expires_at timestamptz,
  add column if not exists collector_last_error text,
  add column if not exists terminal_at timestamptz;

create index if not exists ai_background_responses_collection_due_idx
  on public.ai_background_responses(status,provider_event_at,last_polled_at,collector_lease_expires_at,updated_at);

create table if not exists public.openai_webhook_events (
  event_id text primary key,
  event_type text not null,
  response_id text not null,
  provider_created_at timestamptz not null,
  matched boolean not null default false,
  received_at timestamptz not null default now()
);

create index if not exists openai_webhook_events_response_idx
  on public.openai_webhook_events(response_id,received_at desc);

alter table public.openai_webhook_events enable row level security;
revoke all on table public.openai_webhook_events from public,anon,authenticated;
grant select,insert,update,delete on table public.openai_webhook_events to service_role;

-- Make the owning MarketRoute job eligible immediately after a provider event.
-- This changes timing only; it does not alter stage authority or transition rules.
create or replace function public.wake_ai_background_owner(p_response_id text) returns void
language plpgsql security definer set search_path=public as $$
declare b public.ai_background_responses%rowtype;
begin
  select * into b from public.ai_background_responses where response_id=p_response_id;
  if b.response_id is null then return; end if;

  if b.job_type='COMPANY_DISCOVERY' and b.job_id is not null then
    update public.discovery_sessions
       set next_attempt_at=now(),next_retry_at=null,updated_at=now()
     where id=b.job_id and status='QUEUED';
  elsif b.job_type='CONTACT_DISCOVERY' and b.job_id is not null then
    update public.contact_discovery_sessions
       set next_attempt_at=now(),next_retry_at=null,updated_at=now()
     where id=b.job_id and status='QUEUED';
  elsif b.job_type='BUSINESS_ANALYSIS' and b.job_id is not null then
    update public.business_analysis_jobs
       set next_retry_at=now(),updated_at=now()
     where id=b.job_id and status='QUEUED';
  elsif b.job_type in ('COMMERCIAL_REASONING','OUTREACH') and b.job_id is not null then
    update public.engagement_strategies
       set next_retry_at=now(),updated_at=now()
     where id=b.job_id and scheduler_run_id is null;
  end if;
end $$;

create or replace function public.record_openai_background_webhook_event(
  p_event_id text,
  p_event_type text,
  p_response_id text,
  p_created_at bigint
) returns table(accepted boolean,duplicate boolean,matched boolean)
language plpgsql security definer set search_path=public as $$
declare
  v_inserted boolean := false;
  v_insert_count integer := 0;
  v_matched boolean := false;
  v_status text;
begin
  if p_event_id is null or p_response_id is null then raise exception 'webhook ids required'; end if;
  if p_event_type not in ('response.completed','response.failed','response.cancelled','response.incomplete') then
    return query select false,false,false;
    return;
  end if;

  insert into public.openai_webhook_events(event_id,event_type,response_id,provider_created_at)
  values(p_event_id,p_event_type,p_response_id,to_timestamp(p_created_at))
  on conflict(event_id) do nothing;
  get diagnostics v_insert_count = row_count;
  v_inserted := v_insert_count > 0;

  v_status := case p_event_type
    when 'response.completed' then 'completed'
    when 'response.failed' then 'failed'
    when 'response.cancelled' then 'cancelled'
    else 'incomplete'
  end;

  update public.ai_background_responses
     set status=v_status,
         provider_event_type=p_event_type,
         provider_event_at=to_timestamp(p_created_at),
         terminal_at=case when v_status in ('failed','cancelled','incomplete') then coalesce(terminal_at,now()) else terminal_at end,
         collector_last_error=null,
         updated_at=now()
   where response_id=p_response_id;
  v_matched := found;

  update public.openai_webhook_events set matched=v_matched where event_id=p_event_id;
  if v_matched then perform public.wake_ai_background_owner(p_response_id); end if;

  return query select true,not v_inserted,v_matched;
end $$;

-- Recovery poller claims rows independently of the pipeline scheduler. Completed
-- webhook signals receive first priority, then stale queued/in_progress rows.
create or replace function public.claim_ai_background_responses_for_collection(
  p_limit integer,
  p_lease_owner text,
  p_lease_seconds integer default 45
) returns table(checkpoint_key text,response_id text,status text,collector_lease_token uuid)
language plpgsql security definer set search_path=public as $$
begin
  return query
  with candidates as (
    select b.checkpoint_key
      from public.ai_background_responses b
     where b.response_json is null
       and b.status in ('queued','in_progress','completed')
       and (b.collector_lease_expires_at is null or b.collector_lease_expires_at<=now())
       and (
         b.status='completed'
         or b.last_polled_at is null
         or b.last_polled_at<=now()-interval '45 seconds'
       )
     order by case when b.status='completed' then 0 else 1 end,
              coalesce(b.provider_event_at,b.last_polled_at,b.created_at),b.created_at
     for update skip locked
     limit greatest(1,least(coalesce(p_limit,6),12))
  ), claimed as (
    update public.ai_background_responses b
       set collector_lease_token=gen_random_uuid(),
           collector_lease_owner=left(coalesce(p_lease_owner,'collector'),200),
           collector_lease_expires_at=now()+make_interval(secs=>greatest(15,least(coalesce(p_lease_seconds,45),120))),
           collector_attempt_count=b.collector_attempt_count+1,
           last_polled_at=now(),
           collector_last_error=null,
           updated_at=now()
      from candidates c
     where b.checkpoint_key=c.checkpoint_key
     returning b.checkpoint_key,b.response_id,b.status,b.collector_lease_token
  )
  select c.checkpoint_key,c.response_id,c.status,c.collector_lease_token from claimed c;
end $$;

create or replace function public.cache_ai_background_response_collection(
  p_response_id text,
  p_status text,
  p_response_json jsonb,
  p_collector_lease_token uuid default null,
  p_error_message text default null
) returns boolean
language plpgsql security definer set search_path=public as $$
declare v_updated boolean;
begin
  if p_status not in ('queued','in_progress','completed','failed','cancelled','incomplete') then
    raise exception 'invalid background collection status';
  end if;

  update public.ai_background_responses
     set status=p_status,
         response_json=case when p_status='completed' then coalesce(p_response_json,response_json) else response_json end,
         completed_at=case when p_status='completed' then coalesce(completed_at,now()) else completed_at end,
         terminal_at=case when p_status in ('failed','cancelled','incomplete') then coalesce(terminal_at,now()) else terminal_at end,
         collector_lease_token=null,
         collector_lease_owner=null,
         collector_lease_expires_at=null,
         collector_last_error=left(p_error_message,1000),
         updated_at=now()
   where response_id=p_response_id
     and (p_collector_lease_token is null or collector_lease_token=p_collector_lease_token);
  v_updated := found;
  if v_updated and p_status in ('completed','failed','cancelled','incomplete') then
    perform public.wake_ai_background_owner(p_response_id);
  end if;
  return v_updated;
end $$;

create or replace function public.release_ai_background_collection_lease(
  p_response_id text,
  p_collector_lease_token uuid,
  p_error_message text
) returns boolean
language plpgsql security definer set search_path=public as $$
begin
  update public.ai_background_responses
     set collector_lease_token=null,
         collector_lease_owner=null,
         collector_lease_expires_at=null,
         collector_last_error=left(coalesce(p_error_message,'BACKGROUND_COLLECTION_FAILED'),1000),
         updated_at=now()
   where response_id=p_response_id and collector_lease_token=p_collector_lease_token;
  return found;
end $$;

revoke all on function public.wake_ai_background_owner(text) from public,anon,authenticated;
revoke all on function public.record_openai_background_webhook_event(text,text,text,bigint) from public,anon,authenticated;
revoke all on function public.claim_ai_background_responses_for_collection(integer,text,integer) from public,anon,authenticated;
revoke all on function public.cache_ai_background_response_collection(text,text,jsonb,uuid,text) from public,anon,authenticated;
revoke all on function public.release_ai_background_collection_lease(text,uuid,text) from public,anon,authenticated;
grant execute on function public.wake_ai_background_owner(text) to service_role;
grant execute on function public.record_openai_background_webhook_event(text,text,text,bigint) to service_role;
grant execute on function public.claim_ai_background_responses_for_collection(integer,text,integer) to service_role;
grant execute on function public.cache_ai_background_response_collection(text,text,jsonb,uuid,text) to service_role;
grant execute on function public.release_ai_background_collection_lease(text,uuid,text) to service_role;
