-- Genesis G4: Company Discovery structured-output boundary recovery.
-- Search planning, search order, evidence verification and expansion remain frozen.
-- This migration only recovers sessions terminalised by the former response-schema mismatch.

update public.discovery_sessions
set status='QUEUED',
    job_state='QUEUED',
    stage='PREPARING',
    progress=0,
    attempt_count=0,
    last_error=null,
    last_error_code=null,
    last_error_message=null,
    next_attempt_at=now(),
    next_retry_at=null,
    heartbeat_at=null,
    last_heartbeat_at=null,
    lease_expires_at=null,
    claimed_at=null,
    scheduler_run_id=null,
    result_summary_json=coalesce(result_summary_json,'{}'::jsonb)
      - 'technicalFailure'
      - 'failurePhase'
      - 'expansionPending',
    updated_at=now()
where status='FAILED'
  and job_state in ('FAILED_RETRYABLE','FAILED_TERMINAL')
  and last_error_code='INVALID_AI_OUTPUT'
  and coalesce(recommendations_saved,0)=0;
