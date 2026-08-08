-- MarketRoute G5.1.5 — anonymous governance identity fix.
-- Self-contained hardening for the public Business Analysis lane.
-- This intentionally re-declares the public reservation and progress RPCs so
-- environments that missed 0098 are repaired by applying this migration.

create or replace function public.reserve_public_business_analysis_ai_request(
  p_job_id uuid,
  p_request_key text,
  p_model text,
  p_estimated_cost_usd numeric,
  p_daily_request_limit integer,
  p_daily_cost_limit_usd numeric,
  p_in_flight_limit integer
) returns table(allowed boolean, ledger_id uuid, reason_code text, requests_today integer, cost_today numeric, request_limit integer, cost_limit numeric)
language plpgsql security definer set search_path=public as $$
declare
  v_requests integer:=0;
  v_cost numeric:=0;
  v_in_flight integer:=0;
  v_ledger uuid;
  v_request_limit integer:=greatest(1,least(coalesce(p_daily_request_limit,100),100000));
  v_cost_limit numeric:=greatest(0,least(coalesce(p_daily_cost_limit_usd,10),100000));
  v_in_flight_limit integer:=greatest(1,least(coalesce(p_in_flight_limit,8),100));
begin
  if p_job_id is null or p_request_key is null or length(p_request_key)<20 or p_model is null then
    raise exception 'invalid public business analysis reservation';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('marketroute-public-business-analysis-ai',0));

  select id into v_ledger
    from public.ai_usage_ledger
   where request_key=p_request_key
     and job_type='BUSINESS_ANALYSIS'
     and organisation_id is null
     and status in ('RESERVED','SUCCEEDED')
   limit 1;
  if v_ledger is not null then
    return query select true,v_ledger,null::text,0,0::numeric,v_request_limit,v_cost_limit;
    return;
  end if;

  select count(*),coalesce(sum(case when status='SUCCEEDED' then actual_cost_usd else estimated_cost_usd end),0)
    into v_requests,v_cost
    from public.ai_usage_ledger
   where organisation_id is null
     and campaign_id is null
     and job_type='BUSINESS_ANALYSIS'
     and created_at>=date_trunc('day',now())
     and status in ('RESERVED','SUCCEEDED','FAILED');

  select count(*) into v_in_flight
    from public.ai_usage_ledger
   where organisation_id is null
     and campaign_id is null
     and job_type='BUSINESS_ANALYSIS'
     and status='RESERVED'
     and created_at>=now()-interval '2 hours';

  if v_in_flight>=v_in_flight_limit then
    return query select false,null::uuid,'PARALLEL_PUBLIC_ANALYSIS_LIMIT',v_requests,v_cost,v_request_limit,v_cost_limit;
    return;
  end if;
  if v_requests>=v_request_limit then
    return query select false,null::uuid,'PUBLIC_DAILY_REQUEST_LIMIT',v_requests,v_cost,v_request_limit,v_cost_limit;
    return;
  end if;
  if v_cost+greatest(coalesce(p_estimated_cost_usd,0),0)>v_cost_limit then
    return query select false,null::uuid,'PUBLIC_DAILY_COST_LIMIT',v_requests,v_cost,v_request_limit,v_cost_limit;
    return;
  end if;

  insert into public.ai_usage_ledger(
    organisation_id,campaign_id,scheduler_run_id,job_type,job_id,request_key,model,status,estimated_cost_usd
  ) values(
    null,null,null,'BUSINESS_ANALYSIS',p_job_id,p_request_key,p_model,'RESERVED',greatest(coalesce(p_estimated_cost_usd,0),0)
  )
  on conflict(request_key) do update set request_key=excluded.request_key
  returning id into v_ledger;

  return query select true,v_ledger,null::text,v_requests+1,v_cost+greatest(coalesce(p_estimated_cost_usd,0),0),v_request_limit,v_cost_limit;
end $$;

revoke all on function public.reserve_public_business_analysis_ai_request(uuid,text,text,numeric,integer,numeric,integer) from public,anon,authenticated;
grant execute on function public.reserve_public_business_analysis_ai_request(uuid,text,text,numeric,integer,numeric,integer) to service_role;

-- Reclaims never reduce already achieved progress.
create or replace function public.claim_business_analysis_job(
  p_job_id uuid,p_access_token_hash text,p_lease_seconds integer default 290
) returns public.business_analysis_jobs
language plpgsql security definer set search_path=public as $$
declare v_job public.business_analysis_jobs%rowtype; v_token uuid:=gen_random_uuid();
begin
  update public.business_analysis_jobs baj set
    status='RUNNING',stage=case when coalesce(baj.progress,0)>=52 then baj.stage else 'READING_WEBSITE' end,
    progress=greatest(coalesce(baj.progress,0),8),attempt_count=baj.attempt_count+1,
    claimed_at=now(),lease_expires_at=now()+make_interval(secs=>greatest(60,least(p_lease_seconds,600))),
    worker_token=v_token,next_retry_at=null,last_error_code=null,last_error_message=null,
    started_at=coalesce(baj.started_at,now()),updated_at=now()
  where baj.id=p_job_id and baj.access_token_hash=p_access_token_hash and (
    baj.status='QUEUED' or
    (baj.status='FAILED_RETRYABLE' and coalesce(baj.next_retry_at,now())<=now()) or
    (baj.status='RUNNING' and baj.lease_expires_at<now())
  ) returning * into v_job;
  return v_job;
end $$;

-- Progress updates are monotonic too. Stage and progress are persisted together,
-- making the percentage badge and stage checklist describe the same saved state.
create or replace function public.update_business_analysis_progress_owned(
 p_job_id uuid,p_access_token_hash text,p_worker_token uuid,p_stage text,p_progress integer,p_canonical_url text default null,p_pages_read integer default null
) returns boolean language plpgsql security definer set search_path=public as $$
begin
 update public.business_analysis_jobs baj set
   stage=p_stage,
   progress=greatest(coalesce(baj.progress,0),greatest(0,least(p_progress,99))),
   canonical_url=coalesce(p_canonical_url,baj.canonical_url),
   pages_read=coalesce(p_pages_read,baj.pages_read),
   lease_expires_at=now()+interval '5 minutes',updated_at=now()
 where baj.id=p_job_id and baj.access_token_hash=p_access_token_hash and baj.worker_token=p_worker_token and baj.status='RUNNING';
 if not found then raise exception 'BUSINESS_ANALYSIS_OWNERSHIP_LOST'; end if;
 return true;
end $$;

-- Retryable infrastructure failures keep the last truthful stage/progress.
create or replace function public.fail_business_analysis_job_owned(
 p_job_id uuid,p_access_token_hash text,p_worker_token uuid,p_error_code text,p_error_message text,p_retryable boolean
) returns boolean language plpgsql security definer set search_path=public as $$
declare v_attempt integer;
begin
 select attempt_count into v_attempt
 from public.business_analysis_jobs
 where id=p_job_id and access_token_hash=p_access_token_hash and worker_token=p_worker_token and status='RUNNING'
 for update;
 if not found then raise exception 'BUSINESS_ANALYSIS_OWNERSHIP_LOST'; end if;

 update public.business_analysis_jobs
 set status=case when p_retryable and v_attempt<5 then 'FAILED_RETRYABLE' else 'FAILED_TERMINAL' end,
     stage=case when p_retryable and v_attempt<5 then stage else 'FAILED' end,
     progress=case when p_retryable and v_attempt<5 then greatest(coalesce(progress,0),8) else progress end,
     last_error_code=p_error_code,
     last_error_message=left(p_error_message,1000),
     next_retry_at=case
       when not p_retryable or v_attempt>=5 then null
       when v_attempt<=1 then now()+interval '5 seconds'
       when v_attempt=2 then now()+interval '15 seconds'
       when v_attempt=3 then now()+interval '1 minute'
       else now()+interval '5 minutes'
     end,
     claimed_at=null,lease_expires_at=null,worker_token=null,updated_at=now()
 where id=p_job_id and worker_token=p_worker_token and status='RUNNING';
 return true;
end $$;

revoke all on function public.claim_business_analysis_job(uuid,text,integer) from public,anon,authenticated;
grant execute on function public.claim_business_analysis_job(uuid,text,integer) to service_role;
revoke all on function public.update_business_analysis_progress_owned(uuid,text,uuid,text,integer,text,integer) from public,anon,authenticated;
grant execute on function public.update_business_analysis_progress_owned(uuid,text,uuid,text,integer,text,integer) to service_role;
revoke all on function public.fail_business_analysis_job_owned(uuid,text,uuid,text,text,boolean) from public,anon,authenticated;
grant execute on function public.fail_business_analysis_job_owned(uuid,text,uuid,text,text,boolean) to service_role;
