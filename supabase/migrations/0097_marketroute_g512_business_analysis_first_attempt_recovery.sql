-- MarketRoute G5.1.2 — Business analysis first-attempt recovery
-- Keeps transient first-run interruptions invisible to anonymous visitors and
-- retries the same persisted analysis job quickly without consuming another
-- complimentary analysis entitlement.

create or replace function public.fail_business_analysis_job_owned(
 p_job_id uuid,p_access_token_hash text,p_worker_token uuid,p_error_code text,p_error_message text,p_retryable boolean
) returns boolean language plpgsql security definer set search_path=public as $$
declare v_attempt integer;
begin
 select attempt_count into v_attempt
 from public.business_analysis_jobs
 where id=p_job_id
   and access_token_hash=p_access_token_hash
   and worker_token=p_worker_token
   and status='RUNNING'
 for update;

 if not found then raise exception 'BUSINESS_ANALYSIS_OWNERSHIP_LOST'; end if;

 update public.business_analysis_jobs
 set status=case when p_retryable and v_attempt<5 then 'FAILED_RETRYABLE' else 'FAILED_TERMINAL' end,
     stage='FAILED',
     progress=0,
     last_error_code=p_error_code,
     last_error_message=left(p_error_message,1000),
     next_retry_at=case
       when not p_retryable or v_attempt>=5 then null
       -- A visitor should not have to click twice because the first provider/
       -- network attempt was transient. Keep early recovery fast, then back off.
       when v_attempt<=1 then now()+interval '5 seconds'
       when v_attempt=2 then now()+interval '15 seconds'
       when v_attempt=3 then now()+interval '1 minute'
       else now()+interval '5 minutes'
     end,
     claimed_at=null,
     lease_expires_at=null,
     worker_token=null,
     updated_at=now()
 where id=p_job_id and worker_token=p_worker_token and status='RUNNING';

 return true;
end $$;

revoke all on function public.fail_business_analysis_job_owned(uuid,text,uuid,text,text,boolean) from public,anon,authenticated;
grant execute on function public.fail_business_analysis_job_owned(uuid,text,uuid,text,text,boolean) to service_role;
