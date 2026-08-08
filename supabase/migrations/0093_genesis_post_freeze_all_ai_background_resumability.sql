-- MarketRoute Genesis — post-freeze all-AI background resumability.
-- Full GPT-5 reasoning can legitimately take several minutes. Persist the OpenAI
-- Responses API response id and poll it across scheduler claims instead of holding
-- a serverless request open. AI judgement/schema/state authority is unchanged.

create table if not exists public.ai_background_responses (
  checkpoint_key text primary key,
  organisation_id uuid references public.organisations(id) on delete cascade,
  campaign_id uuid references public.campaigns(id) on delete cascade,
  job_type text not null,
  job_id uuid,
  task text not null,
  request_scope text not null,
  model text not null,
  response_id text not null unique,
  status text not null check (status in ('queued','in_progress','completed')),
  ledger_id uuid not null references public.ai_usage_ledger(id) on delete cascade,
  response_json jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists ai_background_responses_job_idx
  on public.ai_background_responses(job_type,job_id,updated_at desc);

alter table public.ai_background_responses enable row level security;
revoke all on table public.ai_background_responses from public,anon,authenticated;
grant select,insert,update,delete on table public.ai_background_responses to service_role;

create or replace function public.upsert_ai_background_response(
  p_checkpoint_key text,
  p_organisation_id uuid,
  p_campaign_id uuid,
  p_job_type text,
  p_job_id uuid,
  p_task text,
  p_request_scope text,
  p_model text,
  p_response_id text,
  p_status text,
  p_ledger_id uuid,
  p_response_json jsonb default null
) returns void
language plpgsql security definer set search_path=public as $$
begin
  if p_checkpoint_key is null or length(p_checkpoint_key) < 16 then raise exception 'invalid background checkpoint key'; end if;
  if p_status not in ('queued','in_progress','completed') then raise exception 'invalid background response status'; end if;
  insert into public.ai_background_responses(
    checkpoint_key,organisation_id,campaign_id,job_type,job_id,task,request_scope,model,response_id,status,ledger_id,response_json,completed_at
  ) values(
    p_checkpoint_key,p_organisation_id,p_campaign_id,p_job_type,p_job_id,p_task,p_request_scope,p_model,p_response_id,p_status,p_ledger_id,p_response_json,
    case when p_status='completed' then now() else null end
  )
  on conflict(checkpoint_key) do update set
    response_id=excluded.response_id,
    status=excluded.status,
    response_json=coalesce(excluded.response_json,public.ai_background_responses.response_json),
    completed_at=case when excluded.status='completed' then coalesce(public.ai_background_responses.completed_at,now()) else public.ai_background_responses.completed_at end,
    updated_at=now();
end $$;

create or replace function public.delete_ai_background_response(p_checkpoint_key text) returns void
language plpgsql security definer set search_path=public as $$
begin
  delete from public.ai_background_responses where checkpoint_key=p_checkpoint_key;
end $$;

-- Background work is neither a technical failure nor a governance block. Release
-- ownership without consuming an attempt so the same persisted OpenAI response is
-- polled on the next scheduler invocation.
create or replace function public.defer_company_discovery_background_owned(p_session_id uuid,p_scheduler_run_id uuid) returns boolean
language plpgsql security definer set search_path=public as $$
declare s public.discovery_sessions%rowtype;
begin
  perform public.assert_active_pipeline_scheduler_run(p_scheduler_run_id);
  select * into s from public.discovery_sessions where id=p_session_id for update;
  if s.id is null or s.status<>'RUNNING' or s.scheduler_run_id is distinct from p_scheduler_run_id then return false; end if;
  update public.discovery_sessions set status='QUEUED',job_state='QUEUED',attempt_count=greatest(attempt_count-1,0),claimed_at=null,lease_expires_at=null,scheduler_run_id=null,next_attempt_at=now()+interval '10 seconds',next_retry_at=null,last_error=null,last_error_code=null,last_error_message=null,heartbeat_at=now(),last_heartbeat_at=now(),updated_at=now() where id=p_session_id;
  return true;
end $$;

create or replace function public.defer_contact_discovery_background_owned(p_session_id uuid,p_scheduler_run_id uuid) returns boolean
language plpgsql security definer set search_path=public as $$
declare s public.contact_discovery_sessions%rowtype;
begin
  perform public.assert_active_pipeline_scheduler_run(p_scheduler_run_id);
  select * into s from public.contact_discovery_sessions where id=p_session_id for update;
  if s.id is null or s.status<>'RUNNING' or s.scheduler_run_id is distinct from p_scheduler_run_id then return false; end if;
  update public.contact_discovery_sessions set status='QUEUED',job_state='QUEUED',attempt_count=greatest(attempt_count-1,0),claimed_at=null,lease_expires_at=null,scheduler_run_id=null,next_attempt_at=now()+interval '10 seconds',next_retry_at=null,last_error=null,last_error_code=null,last_error_message=null,heartbeat_at=now(),last_heartbeat_at=now(),updated_at=now() where id=p_session_id;
  return true;
end $$;

create or replace function public.defer_g5_engagement_background_owned(
  p_strategy_id uuid,p_scheduler_run_id uuid,p_lease_token uuid,p_active_state text,p_resume_state text
) returns boolean
language plpgsql security definer set search_path=public as $$
declare s public.engagement_strategies%rowtype;
begin
  perform public.assert_active_pipeline_scheduler_run(p_scheduler_run_id);
  select * into s from public.engagement_strategies where id=p_strategy_id for update;
  if s.id is null then return false; end if;
  if s.state<>p_active_state or s.scheduler_run_id is distinct from p_scheduler_run_id or s.lease_token is distinct from p_lease_token then return false; end if;
  update public.engagement_strategies set previous_state=p_active_state,state=p_resume_state,attempt_count=greatest(attempt_count-1,0),scheduler_run_id=null,lease_token=null,claimed_at=null,lease_expires_at=null,next_retry_at=now()+interval '10 seconds',failure_stage=null,failure_reason=null,updated_at=now() where id=p_strategy_id;
  insert into public.engagement_strategy_events(organisation_id,campaign_id,strategy_id,opportunity_id,scheduler_run_id,event_type,previous_state,next_state,lease_token,metadata_json)
  values(s.organisation_id,s.campaign_id,s.id,s.opportunity_id,p_scheduler_run_id,'LEASE_RELEASED',p_active_state,p_resume_state,p_lease_token,jsonb_build_object('release','OPENAI_BACKGROUND_PENDING','attemptConsumed',false));
  return true;
end $$;

create or replace function public.defer_business_analysis_background_owned(
  p_job_id uuid,p_access_token_hash text,p_worker_token uuid
) returns boolean
language plpgsql security definer set search_path=public as $$
begin
  update public.business_analysis_jobs set status='QUEUED',stage='ANALYSING_BUSINESS',attempt_count=greatest(attempt_count-1,0),claimed_at=null,lease_expires_at=null,worker_token=null,next_retry_at=now()+interval '10 seconds',last_error_code=null,last_error_message=null,updated_at=now()
  where id=p_job_id and access_token_hash=p_access_token_hash and worker_token=p_worker_token and status='RUNNING';
  return found;
end $$;

revoke all on function public.upsert_ai_background_response(text,uuid,uuid,text,uuid,text,text,text,text,text,uuid,jsonb) from public,anon,authenticated;
revoke all on function public.delete_ai_background_response(text) from public,anon,authenticated;
revoke all on function public.defer_company_discovery_background_owned(uuid,uuid) from public,anon,authenticated;
revoke all on function public.defer_contact_discovery_background_owned(uuid,uuid) from public,anon,authenticated;
revoke all on function public.defer_g5_engagement_background_owned(uuid,uuid,uuid,text,text) from public,anon,authenticated;
revoke all on function public.defer_business_analysis_background_owned(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.upsert_ai_background_response(text,uuid,uuid,text,uuid,text,text,text,text,text,uuid,jsonb) to service_role;
grant execute on function public.delete_ai_background_response(text) to service_role;
grant execute on function public.defer_company_discovery_background_owned(uuid,uuid) to service_role;
grant execute on function public.defer_contact_discovery_background_owned(uuid,uuid) to service_role;
grant execute on function public.defer_g5_engagement_background_owned(uuid,uuid,uuid,text,text) to service_role;
grant execute on function public.defer_business_analysis_background_owned(uuid,text,uuid) to service_role;
