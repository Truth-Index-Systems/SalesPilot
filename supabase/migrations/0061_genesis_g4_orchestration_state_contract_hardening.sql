-- Genesis G4: Company Discovery orchestration contract hardening.
-- Keeps business phases separate from canonical job state and prevents due
-- technical retries from becoming stranded behind stale lease/legacy fields.

-- The original G2 inline check only knew the legacy stages. Explicitly evolve
-- it to the complete G4 state-machine vocabulary.
alter table public.discovery_sessions
  drop constraint if exists discovery_sessions_stage_check;

alter table public.discovery_sessions
  add constraint discovery_sessions_stage_check check(stage in(
    'PREPARING','PLANNING','SEARCHING','VERIFYING','VALIDATING','SAVING',
    'ANALYSING','EXPANDING','READY','COMPLETE','TECHNICAL_RETRY','NEEDS_ATTENTION'
  ));

-- Normalise active rows without changing the absolute retry instant.
update public.discovery_sessions
set claimed_at=null,
    lease_expires_at=null,
    scheduler_run_id=null,
    stage=case
      when job_state='FAILED_RETRYABLE' then 'TECHNICAL_RETRY'
      when job_state='FAILED_TERMINAL' then 'NEEDS_ATTENTION'
      when job_state='QUEUED' and coalesce(result_summary_json->>'expansionPending','false')='true' then 'EXPANDING'
      when job_state='QUEUED' and stage not in ('PREPARING','PLANNING','EXPANDING') then 'PREPARING'
      else stage
    end,
    next_attempt_at=case
      when job_state='FAILED_RETRYABLE' then coalesce(next_retry_at,next_attempt_at,now())
      else next_attempt_at
    end,
    next_retry_at=case
      when job_state='FAILED_RETRYABLE' then coalesce(next_retry_at,next_attempt_at,now())
      else next_retry_at
    end,
    updated_at=now()
where job_state in ('QUEUED','FAILED_RETRYABLE','FAILED_TERMINAL')
  and status not in ('COMPLETED','CANCELLED');

create or replace function public.recover_pipeline_jobs(p_run_id uuid)
returns integer language plpgsql security definer set search_path=public as $$
declare v_count integer:=0; v_changed integer:=0;
begin
 if not exists(select 1 from public.pipeline_scheduler_lease where singleton and run_id=p_run_id and lease_expires_at>now()) then
  raise exception 'PIPELINE_SCHEDULER_LEASE_NOT_HELD';
 end if;

 update public.discovery_sessions as target set
  status='FAILED',
  job_state=case when target.attempt_count>=5 then 'FAILED_TERMINAL' else 'FAILED_RETRYABLE' end,
  stage=case when target.attempt_count>=5 then 'NEEDS_ATTENTION' else 'TECHNICAL_RETRY' end,
  progress=greatest(coalesce(target.progress,0),15),
  last_error='WORKER_LEASE_EXPIRED',
  last_error_code='WORKER_LEASE_EXPIRED',
  last_error_message='The worker lease expired before completion.',
  result_summary_json=coalesce(target.result_summary_json,'{}'::jsonb)||jsonb_build_object(
    'technicalFailure',true,
    'failurePhase',case when target.stage in ('PLANNING','SEARCHING','VERIFYING','VALIDATING','SAVING') then target.stage else 'PREPARING' end
  ),
  next_retry_at=case when target.attempt_count>=5 then null else now()+public.pipeline_retry_delay(target.attempt_count,'WORKER_LEASE_EXPIRED') end,
  next_attempt_at=case when target.attempt_count>=5 then null else now()+public.pipeline_retry_delay(target.attempt_count,'WORKER_LEASE_EXPIRED') end,
  claimed_at=null,
  lease_expires_at=null,
  scheduler_run_id=null,
  last_heartbeat_at=now(),heartbeat_at=now(),updated_at=now()
 where target.status='RUNNING' and (target.lease_expires_at is null or target.lease_expires_at<=now());
 get diagnostics v_changed=row_count; v_count:=v_count+v_changed;

 update public.contact_discovery_sessions as target set
  status='FAILED',job_state=case when target.attempt_count>=5 then 'FAILED_TERMINAL' else 'FAILED_RETRYABLE' end,
  result_status='FAILED',stage='PREPARING',progress=0,last_error='WORKER_LEASE_EXPIRED',last_error_code='WORKER_LEASE_EXPIRED',
  last_error_message='The worker lease expired before completion.',next_retry_at=case when target.attempt_count>=5 then null else now()+public.pipeline_retry_delay(target.attempt_count,'WORKER_LEASE_EXPIRED') end,
  next_attempt_at=case when target.attempt_count>=5 then null else now()+public.pipeline_retry_delay(target.attempt_count,'WORKER_LEASE_EXPIRED') end,
  claimed_at=null,lease_expires_at=null,scheduler_run_id=null,last_heartbeat_at=now(),heartbeat_at=now(),updated_at=now()
 where target.status='RUNNING' and (target.lease_expires_at is null or target.lease_expires_at<=now());
 get diagnostics v_changed=row_count; v_count:=v_count+v_changed;
 update public.pipeline_scheduler_runs set recovered_jobs=v_count where id=p_run_id;
 return v_count;
end $$;

create or replace function public.claim_company_discovery(p_scheduler_run_id uuid)
returns table(session_id uuid,organisation_id uuid,campaign_id uuid)
language plpgsql security definer set search_path=public as $$
declare v_id uuid;
begin
  select s.id into v_id
  from public.discovery_sessions s
  join public.campaigns c on c.id=s.campaign_id
  join public.ai_governance_policies g on g.organisation_id=s.organisation_id and g.autonomy_enabled=true
  where c.status not in('PAUSED','CANCELLED','ARCHIVED')
    and s.attempt_count<5
    and (
      (s.status='QUEUED' and s.job_state='QUEUED' and coalesce(s.next_attempt_at,now())<=now())
      or
      (s.status='FAILED' and s.job_state='FAILED_RETRYABLE' and coalesce(s.next_retry_at,s.next_attempt_at,now())<=now())
    )
    and (s.lease_expires_at is null or s.lease_expires_at<=now())
  order by
    case
      when s.status='FAILED' and s.job_state='FAILED_RETRYABLE' then 0
      when s.stage='EXPANDING' then 1
      else 2
    end,
    coalesce(s.next_retry_at,s.next_attempt_at,s.created_at),s.created_at
  for update of s skip locked
  limit 1;

  if v_id is null then return; end if;

  update public.discovery_sessions as target
  set status='RUNNING',job_state='RUNNING',
      stage=case
        when target.stage='EXPANDING' or coalesce(target.result_summary_json->>'expansionPending','false')='true' then 'EXPANDING'
        else 'PREPARING'
      end,
      progress=case when target.stage='EXPANDING' then greatest(target.progress,15) else 5 end,
      attempt_count=target.attempt_count+1,claimed_at=now(),started_at=coalesce(target.started_at,now()),
      heartbeat_at=now(),last_heartbeat_at=now(),lease_expires_at=now()+interval '8 minutes',
      last_error=null,last_error_code=null,last_error_message=null,
      next_attempt_at=null,next_retry_at=null,scheduler_run_id=p_scheduler_run_id,updated_at=now()
  where target.id=v_id;

  return query select s.id,s.organisation_id,s.campaign_id from public.discovery_sessions s where s.id=v_id;
end $$;

revoke all on function public.claim_company_discovery(uuid) from public,anon,authenticated;
grant execute on function public.claim_company_discovery(uuid) to service_role;
revoke all on function public.recover_pipeline_jobs(uuid) from public,anon,authenticated;
grant execute on function public.recover_pipeline_jobs(uuid) to service_role;
