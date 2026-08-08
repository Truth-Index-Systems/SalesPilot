-- MarketRoute G5.1.10 — Background incomplete recovery & ledger closure.
-- Terminal OpenAI background responses are durable evidence, not pending work.
-- Capture their provider reason, close the associated AI ledger reservation, and
-- allow webhook-signalled terminal responses to be collected once for details.

create or replace function public.claim_ai_background_responses_for_collection(
  p_limit integer,p_lease_owner text,p_lease_seconds integer default 45
) returns table(checkpoint_key text,response_id text,status text,collector_lease_token uuid)
language plpgsql security definer set search_path=public as $$
begin
  return query
  with eligible as (
    select b.checkpoint_key,b.organisation_id,b.campaign_id,b.status,b.provider_event_at,b.last_polled_at,b.created_at,
      row_number() over(partition by b.organisation_id,coalesce(b.campaign_id,'00000000-0000-0000-0000-000000000000'::uuid)
        order by case when b.status='completed' then 0 when b.status in ('failed','cancelled','incomplete') then 1 else 2 end,
        coalesce(b.provider_event_at,b.last_polled_at,b.created_at),b.created_at) as lane_rank
    from public.ai_background_responses b
    where b.response_json is null
      and (
        b.status in ('queued','in_progress','completed')
        or (b.status in ('failed','cancelled','incomplete') and b.collector_last_error is null)
      )
      and (b.collector_lease_expires_at is null or b.collector_lease_expires_at<=now())
      and (
        b.status='completed'
        or (b.status in ('failed','cancelled','incomplete') and b.collector_last_error is null)
        or b.last_polled_at is null
        or b.last_polled_at<=now()-interval '45 seconds'
      )
  ), candidates as (
    select b.checkpoint_key from public.ai_background_responses b
    join eligible e on e.checkpoint_key=b.checkpoint_key
    order by e.lane_rank,
      case when e.status='completed' then 0 when e.status in ('failed','cancelled','incomplete') then 1 else 2 end,
      coalesce(e.provider_event_at,e.last_polled_at,e.created_at),e.created_at
    for update of b skip locked limit greatest(1,least(coalesce(p_limit,6),12))
  ), claimed as (
    update public.ai_background_responses b set
      collector_lease_token=gen_random_uuid(),collector_lease_owner=left(coalesce(p_lease_owner,'collector'),200),
      collector_lease_expires_at=now()+make_interval(secs=>greatest(15,least(coalesce(p_lease_seconds,45),120))),
      collector_attempt_count=b.collector_attempt_count+1,last_polled_at=now(),updated_at=now()
    from candidates c where b.checkpoint_key=c.checkpoint_key
    returning b.checkpoint_key,b.response_id,b.status,b.collector_lease_token
  ) select c.checkpoint_key,c.response_id,c.status,c.collector_lease_token from claimed c;
end $$;

create or replace function public.cache_ai_background_response_collection(
  p_response_id text,p_status text,p_response_json jsonb,p_collector_lease_token uuid default null,p_error_message text default null
) returns boolean
language plpgsql security definer set search_path=public as $$
declare
  v_background public.ai_background_responses%rowtype;
  v_updated boolean:=false;
  v_input_tokens integer;
  v_output_tokens integer;
  v_reasoning_tokens integer;
begin
  if p_status not in ('queued','in_progress','completed','failed','cancelled','incomplete') then raise exception 'invalid background collection status'; end if;

  select * into v_background
    from public.ai_background_responses
   where response_id=p_response_id
     and (p_collector_lease_token is null or collector_lease_token=p_collector_lease_token)
   for update;
  if v_background.response_id is null then return false; end if;

  if p_response_json is not null then
    begin v_input_tokens:=nullif(p_response_json#>>'{usage,input_tokens}','')::integer; exception when others then v_input_tokens:=null; end;
    begin v_output_tokens:=nullif(p_response_json#>>'{usage,output_tokens}','')::integer; exception when others then v_output_tokens:=null; end;
    begin v_reasoning_tokens:=nullif(p_response_json#>>'{usage,output_tokens_details,reasoning_tokens}','')::integer; exception when others then v_reasoning_tokens:=null; end;
  end if;

  update public.ai_background_responses set
    status=p_status,
    response_json=case when p_status='completed' then coalesce(p_response_json,response_json) else response_json end,
    provider_completed_at=case when p_status='completed' then coalesce(provider_completed_at,provider_event_at,now()) else provider_completed_at end,
    collected_at=case when p_status='completed' then coalesce(collected_at,now()) else collected_at end,
    completed_at=case when p_status='completed' then coalesce(completed_at,now()) else completed_at end,
    terminal_at=case when p_status in ('failed','cancelled','incomplete') then coalesce(terminal_at,now()) else terminal_at end,
    collector_lease_token=null,collector_lease_owner=null,collector_lease_expires_at=null,
    collector_last_error=case
      when p_status in ('failed','cancelled','incomplete') then left(coalesce(p_error_message,'OPENAI_BACKGROUND_'||upper(p_status)),1000)
      else null
    end,
    updated_at=now()
   where response_id=p_response_id;
  v_updated:=found;

  -- Terminal provider work must never remain RESERVED. Keep estimated cost for
  -- governance accounting; record any token detail returned by the provider.
  if v_updated and p_status in ('failed','cancelled','incomplete') and v_background.ledger_id is not null then
    update public.ai_usage_ledger set
      status='FAILED',
      response_id=left(p_response_id,200),
      error_code=left('OPENAI_BACKGROUND_'||upper(p_status),120),
      error_message=left(coalesce(p_error_message,'Provider background response ended with status '||p_status),1000),
      input_tokens=coalesce(v_input_tokens,input_tokens),
      output_tokens=coalesce(v_output_tokens,output_tokens),
      reasoning_tokens=coalesce(v_reasoning_tokens,reasoning_tokens),
      validated_at=coalesce(validated_at,now()),persisted_at=now(),completed_at=coalesce(completed_at,now())
     where id=v_background.ledger_id and status in ('RESERVED','FAILED');
  end if;

  if v_updated and p_status in ('completed','failed','cancelled','incomplete') then
    perform public.wake_ai_background_owner(p_response_id);
  end if;
  return v_updated;
end $$;

-- Repair terminal rows created before this migration so they cannot consume the
-- public/workspace in-flight cap forever. The collector will enrich the generic
-- reason on its next run where provider detail remains available.
update public.ai_usage_ledger l set
  status='FAILED',
  response_id=left(b.response_id,200),
  error_code=left('OPENAI_BACKGROUND_'||upper(b.status),120),
  error_message=left(coalesce(b.collector_last_error,'Provider background response ended with status '||b.status),1000),
  validated_at=coalesce(l.validated_at,now()),persisted_at=now(),completed_at=coalesce(l.completed_at,now())
from public.ai_background_responses b
where b.ledger_id=l.id
  and b.status in ('failed','cancelled','incomplete')
  and l.status='RESERVED';

revoke all on function public.claim_ai_background_responses_for_collection(integer,text,integer) from public,anon,authenticated;
revoke all on function public.cache_ai_background_response_collection(text,text,jsonb,uuid,text) from public,anon,authenticated;
grant execute on function public.claim_ai_background_responses_for_collection(integer,text,integer) to service_role;
grant execute on function public.cache_ai_background_response_collection(text,text,jsonb,uuid,text) to service_role;
