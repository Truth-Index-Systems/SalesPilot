-- Genesis post-freeze: GPT-5 transport timeout + retry hardening.
-- Scope: Company Discovery transient transport failures only.
-- AI judgement, G4/G5 state ownership and evidence contracts are unchanged.

create or replace function public.record_company_discovery_failure_v2(
  p_session_id uuid,
  p_error_code text,
  p_error_message text,
  p_retryable boolean,
  p_failure_phase text
) returns void language plpgsql security definer set search_path=public as $$
declare
  v_attempt integer;
  v_delay interval;
  v_phase text:=upper(coalesce(nullif(trim(p_failure_phase),''),'PREPARING'));
  v_code text:=upper(coalesce(nullif(trim(p_error_code),''),'UNKNOWN'));
begin
  select attempt_count into v_attempt from public.discovery_sessions where id=p_session_id for update;

  -- Timeout/network/service failures are infrastructure conditions, not research
  -- judgement failures. Give GPT-5 bounded exponential backoff across scheduler
  -- cycles: 30s -> 60s -> 2m. Never spin immediately in the same cron request.
  v_delay:=case
    when not p_retryable then null
    when v_code in ('TIMEOUT','NETWORK','RATE_LIMIT','WORKER_INTERRUPTED') and coalesce(v_attempt,0)<=1 then interval '30 seconds'
    when v_code in ('TIMEOUT','NETWORK','RATE_LIMIT','WORKER_INTERRUPTED') and v_attempt=2 then interval '1 minute'
    when v_code in ('TIMEOUT','NETWORK','RATE_LIMIT','WORKER_INTERRUPTED') and v_attempt=3 then interval '2 minutes'
    when v_code in ('TIMEOUT','NETWORK','RATE_LIMIT','WORKER_INTERRUPTED') then null
    when coalesce(v_attempt,0)<=1 then interval '30 seconds'
    when v_attempt=2 then interval '2 minutes'
    else null
  end;

  update public.discovery_sessions set
    status='FAILED',
    job_state=case when v_delay is null then 'FAILED_TERMINAL' else 'FAILED_RETRYABLE' end,
    stage=case when v_delay is null then 'NEEDS_ATTENTION' else 'TECHNICAL_RETRY' end,
    progress=case when v_phase in ('PREPARING','PLANNING') then 15 else greatest(coalesce(progress,0),25) end,
    last_error=left(v_code,1000),
    last_error_code=left(v_code,100),
    last_error_message=left(p_error_message,1000),
    result_summary_json=coalesce(result_summary_json,'{}'::jsonb) || jsonb_build_object(
      'technicalFailure',true,
      'failurePhase',v_phase,
      'expansionPending',false,
      'transientTransportFailure',v_code in ('TIMEOUT','NETWORK','RATE_LIMIT','WORKER_INTERRUPTED')
    ),
    next_retry_at=case when v_delay is null then null else now()+v_delay end,
    next_attempt_at=case when v_delay is null then null else now()+v_delay end,
    lease_expires_at=null,
    claimed_at=null,
    scheduler_run_id=null,
    updated_at=now()
  where id=p_session_id;
end $$;

revoke all on function public.record_company_discovery_failure_v2(uuid,text,text,boolean,text) from public,anon,authenticated;
grant execute on function public.record_company_discovery_failure_v2(uuid,text,text,boolean,text) to service_role;
