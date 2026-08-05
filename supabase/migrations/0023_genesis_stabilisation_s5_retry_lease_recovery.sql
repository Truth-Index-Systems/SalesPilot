-- Genesis Stabilisation S5: deterministic retry, lease and recovery engine.
-- Preserves legacy status columns for UI compatibility while adding canonical job state.

alter table public.discovery_sessions
  add column if not exists job_state text not null default 'QUEUED',
  add column if not exists claimed_at timestamptz,
  add column if not exists last_heartbeat_at timestamptz,
  add column if not exists last_error_code text,
  add column if not exists last_error_message text,
  add column if not exists next_retry_at timestamptz,
  add column if not exists result_summary_json jsonb,
  add column if not exists scheduler_run_id uuid references public.pipeline_scheduler_runs(id) on delete set null;

alter table public.contact_discovery_sessions
  add column if not exists job_state text not null default 'QUEUED',
  add column if not exists claimed_at timestamptz,
  add column if not exists last_heartbeat_at timestamptz,
  add column if not exists last_error_code text,
  add column if not exists last_error_message text,
  add column if not exists next_retry_at timestamptz,
  add column if not exists result_summary_json jsonb,
  add column if not exists scheduler_run_id uuid references public.pipeline_scheduler_runs(id) on delete set null;

alter table public.pipeline_scheduler_runs
  add column if not exists outcome_json jsonb,
  add column if not exists recovered_jobs integer not null default 0;

alter table public.discovery_sessions drop constraint if exists discovery_sessions_job_state_check;
alter table public.discovery_sessions add constraint discovery_sessions_job_state_check check(job_state in(
  'QUEUED','RUNNING','COMPLETED','NO_RESULTS','EXHAUSTED','PAUSED','CANCELLED','FAILED_RETRYABLE','FAILED_TERMINAL'
));
alter table public.contact_discovery_sessions drop constraint if exists contact_discovery_sessions_job_state_check;
alter table public.contact_discovery_sessions add constraint contact_discovery_sessions_job_state_check check(job_state in(
  'QUEUED','RUNNING','COMPLETED','NO_RESULTS','EXHAUSTED','PAUSED','CANCELLED','FAILED_RETRYABLE','FAILED_TERMINAL'
));

create index if not exists discovery_sessions_retry_idx on public.discovery_sessions(job_state,next_retry_at,created_at);
create index if not exists contact_discovery_sessions_retry_idx on public.contact_discovery_sessions(job_state,next_retry_at,created_at);

-- Future autonomy policy foundation. All existing and new campaigns remain human-guided.
create table if not exists public.campaign_autonomy_policies(
  campaign_id uuid primary key references public.campaigns(id) on delete cascade,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  company_review text not null default 'MANUAL' check(company_review in('MANUAL','AUTO')),
  contact_review text not null default 'MANUAL' check(contact_review in('MANUAL','AUTO')),
  outreach_approval text not null default 'MANUAL' check(outreach_approval in('MANUAL','REVIEW_FIRST','AUTO_SEND')),
  reply_handling text not null default 'SUGGEST' check(reply_handling in('MANUAL','SUGGEST','AUTO_RESPOND')),
  market_learning_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organisation_id,campaign_id)
);
alter table public.campaign_autonomy_policies enable row level security;
drop policy if exists campaign_autonomy_policies_member_read on public.campaign_autonomy_policies;
create policy campaign_autonomy_policies_member_read on public.campaign_autonomy_policies
for select to authenticated using(public.is_active_org_member(organisation_id));
insert into public.campaign_autonomy_policies(campaign_id,organisation_id)
select id,organisation_id from public.campaigns on conflict(campaign_id) do nothing;

create or replace function public.pipeline_retry_delay(p_attempt integer,p_error_code text)
returns interval language sql immutable as $$
 select case
  when p_attempt>=5 then null
  when p_error_code='RATE_LIMIT' and p_attempt<=2 then interval '5 minutes'
  when p_attempt<=1 then interval '1 minute'
  when p_attempt=2 then interval '5 minutes'
  when p_attempt=3 then interval '30 minutes'
  else interval '2 hours'
 end
$$;

create or replace function public.recover_pipeline_jobs(p_run_id uuid)
returns integer language plpgsql security definer set search_path=public as $$
declare v_count integer:=0; v_changed integer:=0;
begin
 if not exists(select 1 from public.pipeline_scheduler_lease where singleton and run_id=p_run_id and lease_expires_at>now()) then
  raise exception 'PIPELINE_SCHEDULER_LEASE_NOT_HELD';
 end if;
 update public.discovery_sessions set
  status='FAILED',job_state=case when attempt_count>=5 then 'FAILED_TERMINAL' else 'FAILED_RETRYABLE' end,
  stage='PREPARING',progress=0,last_error='WORKER_LEASE_EXPIRED',last_error_code='WORKER_LEASE_EXPIRED',
  last_error_message='The worker lease expired before completion.',next_retry_at=case when attempt_count>=5 then null else now()+public.pipeline_retry_delay(attempt_count,'WORKER_LEASE_EXPIRED') end,
  next_attempt_at=case when attempt_count>=5 then null else now()+public.pipeline_retry_delay(attempt_count,'WORKER_LEASE_EXPIRED') end,
  lease_expires_at=null,last_heartbeat_at=now(),heartbeat_at=now(),updated_at=now()
 where status='RUNNING' and (lease_expires_at is null or lease_expires_at<=now());
 get diagnostics v_changed=row_count; v_count:=v_count+v_changed;
 update public.contact_discovery_sessions set
  status='FAILED',job_state=case when attempt_count>=5 then 'FAILED_TERMINAL' else 'FAILED_RETRYABLE' end,
  result_status='FAILED',stage='PREPARING',progress=0,last_error='WORKER_LEASE_EXPIRED',last_error_code='WORKER_LEASE_EXPIRED',
  last_error_message='The worker lease expired before completion.',next_retry_at=case when attempt_count>=5 then null else now()+public.pipeline_retry_delay(attempt_count,'WORKER_LEASE_EXPIRED') end,
  next_attempt_at=case when attempt_count>=5 then null else now()+public.pipeline_retry_delay(attempt_count,'WORKER_LEASE_EXPIRED') end,
  lease_expires_at=null,last_heartbeat_at=now(),heartbeat_at=now(),updated_at=now()
 where status='RUNNING' and (lease_expires_at is null or lease_expires_at<=now());
 get diagnostics v_changed=row_count; v_count:=v_count+v_changed;
 update public.pipeline_scheduler_runs set recovered_jobs=v_count where id=p_run_id;
 return v_count;
end $$;

create or replace function public.claim_company_discovery(p_scheduler_run_id uuid)
returns table(session_id uuid,organisation_id uuid,campaign_id uuid)
language plpgsql security definer set search_path=public as $$
declare v_id uuid;
begin
 select s.id into v_id from public.discovery_sessions s join public.campaigns c on c.id=s.campaign_id
 where c.status not in('PAUSED','CANCELLED') and s.attempt_count<5 and (
  (s.status='QUEUED' and coalesce(s.next_attempt_at,s.next_retry_at,now())<=now()) or
  (s.status='FAILED' and s.job_state='FAILED_RETRYABLE' and coalesce(s.next_retry_at,s.next_attempt_at,now())<=now())
 ) order by case when s.status='QUEUED' then 0 else 1 end,coalesce(s.next_retry_at,s.next_attempt_at,s.created_at),s.created_at
 for update of s skip locked limit 1;
 if v_id is null then return; end if;
 update public.discovery_sessions set status='RUNNING',job_state='RUNNING',stage='SEARCHING',progress=10,
  attempt_count=attempt_count+1,claimed_at=now(),started_at=coalesce(started_at,now()),heartbeat_at=now(),last_heartbeat_at=now(),
  lease_expires_at=now()+interval '8 minutes',last_error=null,last_error_code=null,last_error_message=null,
  next_attempt_at=null,next_retry_at=null,scheduler_run_id=p_scheduler_run_id,updated_at=now() where id=v_id;
 return query select s.id,s.organisation_id,s.campaign_id from public.discovery_sessions s where s.id=v_id;
end $$;

create or replace function public.claim_contact_discovery(p_scheduler_run_id uuid)
returns table(session_id uuid,organisation_id uuid,campaign_id uuid,company_id uuid)
language plpgsql security definer set search_path=public as $$
declare v_id uuid;
begin
 select s.id into v_id from public.contact_discovery_sessions s
 join public.companies c on c.id=s.company_id and c.review_status='APPROVED'
 join public.campaigns ca on ca.id=s.campaign_id and ca.status not in('PAUSED','CANCELLED')
 where s.attempt_count<5 and ((s.status='QUEUED' and coalesce(s.next_attempt_at,s.next_retry_at,now())<=now()) or
 (s.status='FAILED' and s.job_state='FAILED_RETRYABLE' and coalesce(s.next_retry_at,s.next_attempt_at,now())<=now()))
 order by case when s.status='QUEUED' then 0 else 1 end,coalesce(s.next_retry_at,s.next_attempt_at,s.created_at),s.created_at
 for update of s skip locked limit 1;
 if v_id is null then return; end if;
 update public.contact_discovery_sessions set status='RUNNING',job_state='RUNNING',stage='PREPARING',progress=5,
  attempt_count=attempt_count+1,claimed_at=now(),started_at=coalesce(started_at,now()),heartbeat_at=now(),last_heartbeat_at=now(),
  lease_expires_at=now()+interval '8 minutes',last_error=null,last_error_code=null,last_error_message=null,
  next_attempt_at=null,next_retry_at=null,scheduler_run_id=p_scheduler_run_id,updated_at=now() where id=v_id;
 return query select s.id,s.organisation_id,s.campaign_id,s.company_id from public.contact_discovery_sessions s where s.id=v_id;
end $$;

create or replace function public.heartbeat_company_discovery(p_session_id uuid) returns void
language plpgsql security definer set search_path=public as $$ begin
 update public.discovery_sessions set heartbeat_at=now(),last_heartbeat_at=now(),lease_expires_at=now()+interval '8 minutes',updated_at=now()
 where id=p_session_id and status='RUNNING';
end $$;
create or replace function public.heartbeat_contact_discovery(p_session_id uuid) returns void
language plpgsql security definer set search_path=public as $$ begin
 update public.contact_discovery_sessions set heartbeat_at=now(),last_heartbeat_at=now(),lease_expires_at=now()+interval '8 minutes',updated_at=now()
 where id=p_session_id and status='RUNNING';
end $$;

create or replace function public.record_company_discovery_failure(p_session_id uuid,p_error_code text,p_error_message text,p_retryable boolean)
returns void language plpgsql security definer set search_path=public as $$
declare v_attempt integer; v_delay interval;
begin
 select attempt_count into v_attempt from public.discovery_sessions where id=p_session_id for update;
 v_delay:=case when p_retryable then public.pipeline_retry_delay(v_attempt,p_error_code) else null end;
 update public.discovery_sessions set status='FAILED',job_state=case when v_delay is null then 'FAILED_TERMINAL' else 'FAILED_RETRYABLE' end,
  stage='PREPARING',progress=0,last_error=left(p_error_code,1000),last_error_code=left(p_error_code,100),last_error_message=left(p_error_message,1000),
  next_retry_at=case when v_delay is null then null else now()+v_delay end,next_attempt_at=case when v_delay is null then null else now()+v_delay end,
  lease_expires_at=null,updated_at=now() where id=p_session_id;
end $$;
create or replace function public.record_contact_discovery_failure(p_session_id uuid,p_error_code text,p_error_message text,p_retryable boolean)
returns void language plpgsql security definer set search_path=public as $$
declare v_attempt integer; v_delay interval;
begin
 select attempt_count into v_attempt from public.contact_discovery_sessions where id=p_session_id for update;
 v_delay:=case when p_retryable then public.pipeline_retry_delay(v_attempt,p_error_code) else null end;
 update public.contact_discovery_sessions set status='FAILED',job_state=case when v_delay is null then 'FAILED_TERMINAL' else 'FAILED_RETRYABLE' end,result_status='FAILED',
  stage='PREPARING',progress=0,last_error=left(p_error_code,1000),last_error_code=left(p_error_code,100),last_error_message=left(p_error_message,1000),
  next_retry_at=case when v_delay is null then null else now()+v_delay end,next_attempt_at=case when v_delay is null then null else now()+v_delay end,
  lease_expires_at=null,updated_at=now() where id=p_session_id;
end $$;

-- Overloads preserve existing finalisers while attaching diagnostics.
create or replace function public.finalize_company_discovery(p_session_id uuid,p_result_summary jsonb)
returns integer language plpgsql security definer set search_path=public as $$
declare v_saved integer;
begin
 v_saved:=public.finalize_company_discovery(p_session_id);
 update public.discovery_sessions set job_state=case when v_saved>0 then 'COMPLETED' else 'NO_RESULTS' end,
  result_summary_json=coalesce(p_result_summary,'{}'::jsonb),last_heartbeat_at=now(),lease_expires_at=null,updated_at=now() where id=p_session_id;
 return v_saved;
end $$;
create or replace function public.finalize_contact_discovery(p_session_id uuid,p_result_summary jsonb)
returns integer language plpgsql security definer set search_path=public as $$
declare v_saved integer;
begin
 v_saved:=public.finalize_contact_discovery(p_session_id);
 update public.contact_discovery_sessions set job_state=case when v_saved>0 then 'COMPLETED' else 'NO_RESULTS' end,
  result_summary_json=coalesce(p_result_summary,'{}'::jsonb),last_heartbeat_at=now(),lease_expires_at=null,updated_at=now() where id=p_session_id;
 return v_saved;
end $$;

create or replace function public.record_pipeline_scheduler_outcome(p_run_id uuid,p_company_result jsonb,p_contact_result jsonb)
returns void language plpgsql security definer set search_path=public as $$ begin
 update public.pipeline_scheduler_runs set outcome_json=jsonb_build_object('company',coalesce(p_company_result,'{}'::jsonb),'contact',coalesce(p_contact_result,'{}'::jsonb)) where id=p_run_id;
end $$;

-- Align existing rows to canonical state without changing customer-visible status.
update public.discovery_sessions set job_state=case status when 'QUEUED' then 'QUEUED' when 'RUNNING' then 'RUNNING' when 'COMPLETED' then case when coalesce(recommendations_saved,0)>0 then 'COMPLETED' else 'NO_RESULTS' end when 'CANCELLED' then 'CANCELLED' when 'FAILED' then case when attempt_count>=5 or next_attempt_at is null then 'FAILED_TERMINAL' else 'FAILED_RETRYABLE' end else 'FAILED_TERMINAL' end;
update public.contact_discovery_sessions set job_state=case status when 'QUEUED' then 'QUEUED' when 'RUNNING' then 'RUNNING' when 'COMPLETED' then case when coalesce(contacts_saved,0)>0 then 'COMPLETED' else 'NO_RESULTS' end when 'CANCELLED' then 'CANCELLED' when 'FAILED' then case when attempt_count>=5 or next_attempt_at is null then 'FAILED_TERMINAL' else 'FAILED_RETRYABLE' end else 'FAILED_TERMINAL' end;

revoke all on function public.recover_pipeline_jobs(uuid),public.claim_company_discovery(uuid),public.claim_contact_discovery(uuid),public.heartbeat_company_discovery(uuid),public.heartbeat_contact_discovery(uuid),public.record_company_discovery_failure(uuid,text,text,boolean),public.record_contact_discovery_failure(uuid,text,text,boolean),public.finalize_company_discovery(uuid,jsonb),public.finalize_contact_discovery(uuid,jsonb),public.record_pipeline_scheduler_outcome(uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.recover_pipeline_jobs(uuid),public.claim_company_discovery(uuid),public.claim_contact_discovery(uuid),public.heartbeat_company_discovery(uuid),public.heartbeat_contact_discovery(uuid),public.record_company_discovery_failure(uuid,text,text,boolean),public.record_contact_discovery_failure(uuid,text,text,boolean),public.finalize_company_discovery(uuid,jsonb),public.finalize_contact_discovery(uuid,jsonb),public.record_pipeline_scheduler_outcome(uuid,jsonb,jsonb) to service_role;
