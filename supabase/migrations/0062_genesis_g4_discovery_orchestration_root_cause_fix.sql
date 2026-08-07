-- Genesis G4: Company Discovery orchestration root-cause fix.
-- Aligns the effective progress RPC with the G4 state machine and expands the
-- evidence-preserving market search contract to six ordered passes.

-- The effective RPC was still the legacy G2 implementation and rejected
-- PLANNING/VERIFYING before the first real search could begin.
create or replace function public.update_company_discovery_progress(
  p_session_id uuid,
  p_stage text,
  p_progress integer,
  p_candidates integer default null
)
returns void language plpgsql security definer set search_path=public as $$
declare
  v_stage text:=upper(coalesce(nullif(trim(p_stage),''),'PREPARING'));
begin
  if v_stage not in ('PREPARING','PLANNING','SEARCHING','VERIFYING','VALIDATING','SAVING','EXPANDING') then
    raise exception 'invalid discovery running stage: %',v_stage;
  end if;

  update public.discovery_sessions
  set stage=v_stage,
      progress=greatest(coalesce(progress,0),least(95,greatest(0,p_progress))),
      candidates_found=coalesce(p_candidates,candidates_found),
      heartbeat_at=now(),
      last_heartbeat_at=now(),
      lease_expires_at=now()+interval '10 minutes',
      updated_at=now()
  where id=p_session_id
    and status='RUNNING'
    and job_state='RUNNING';

  if not found then
    raise exception 'discovery session is not running';
  end if;
end $$;

revoke all on function public.update_company_discovery_progress(uuid,text,integer,integer) from public,anon,authenticated;
grant execute on function public.update_company_discovery_progress(uuid,text,integer,integer) to service_role;

-- Universal expansion now follows six distinct angles. Evidence thresholds do
-- not change; only the market-search angle widens.
alter table public.discovery_sessions
  alter column max_expansion_passes set default 6;

update public.discovery_sessions
set max_expansion_passes=6,
    updated_at=now()
where max_expansion_passes<6;

-- Reclaim due retry/expansion rows without stale scheduler ownership.
update public.discovery_sessions
set claimed_at=null,
    lease_expires_at=null,
    scheduler_run_id=null,
    next_attempt_at=case
      when job_state='FAILED_RETRYABLE' then coalesce(next_retry_at,next_attempt_at,now())
      else next_attempt_at
    end,
    next_retry_at=case
      when job_state='FAILED_RETRYABLE' then coalesce(next_retry_at,next_attempt_at,now())
      else next_retry_at
    end,
    stage=case
      when job_state='FAILED_RETRYABLE' then 'TECHNICAL_RETRY'
      when job_state='FAILED_TERMINAL' then 'NEEDS_ATTENTION'
      when job_state='QUEUED' and coalesce(result_summary_json->>'expansionPending','false')='true' then 'EXPANDING'
      else stage
    end,
    updated_at=now()
where job_state in ('QUEUED','FAILED_RETRYABLE','FAILED_TERMINAL')
  and status not in ('COMPLETED','CANCELLED');
