-- Genesis G4 testing polish: fast company-discovery recovery during first-use flows.
-- First failure retries after 30 seconds, second after 2 minutes, third requires attention.
create or replace function public.record_company_discovery_failure(
  p_session_id uuid,
  p_error_code text,
  p_error_message text,
  p_retryable boolean
) returns void language plpgsql security definer set search_path=public as $$
declare
  v_attempt integer;
  v_delay interval;
begin
  select attempt_count into v_attempt from public.discovery_sessions where id=p_session_id for update;
  v_delay:=case
    when not p_retryable then null
    when v_attempt<=1 then interval '30 seconds'
    when v_attempt=2 then interval '2 minutes'
    else null
  end;
  update public.discovery_sessions set
    status='FAILED',
    job_state=case when v_delay is null then 'FAILED_TERMINAL' else 'FAILED_RETRYABLE' end,
    stage='PREPARING',
    progress=0,
    last_error=left(p_error_code,1000),
    last_error_code=left(p_error_code,100),
    last_error_message=left(p_error_message,1000),
    next_retry_at=case when v_delay is null then null else now()+v_delay end,
    next_attempt_at=case when v_delay is null then null else now()+v_delay end,
    lease_expires_at=null,
    updated_at=now()
  where id=p_session_id;
end $$;

revoke all on function public.record_company_discovery_failure(uuid,text,text,boolean) from public,anon,authenticated;
grant execute on function public.record_company_discovery_failure(uuid,text,text,boolean) to service_role;
