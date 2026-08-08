-- MarketRoute G5.1.6 — Business Analysis workload decomposition.
-- Persist Core Business DNA independently so Growth Strategy can resume without
-- repeating the expensive first reasoning phase. Existing final analysis_json
-- remains the canonical downstream contract.

alter table public.business_analysis_jobs
  add column if not exists core_analysis_json jsonb;

create or replace function public.persist_business_analysis_core_owned(
 p_job_id uuid,p_access_token_hash text,p_worker_token uuid,p_canonical_url text,p_pages_read integer,p_core jsonb
) returns boolean language plpgsql security definer set search_path=public as $$
begin
 update public.business_analysis_jobs baj set
   core_analysis_json=p_core,
   canonical_url=coalesce(p_canonical_url,baj.canonical_url),
   pages_read=coalesce(p_pages_read,baj.pages_read),
   stage='BUSINESS_DNA_READY',
   progress=greatest(coalesce(baj.progress,0),70),
   lease_expires_at=now()+interval '5 minutes',
   last_error_code=null,last_error_message=null,updated_at=now()
 where baj.id=p_job_id and baj.access_token_hash=p_access_token_hash and baj.worker_token=p_worker_token and baj.status='RUNNING';
 if not found then raise exception 'BUSINESS_ANALYSIS_OWNERSHIP_LOST'; end if;
 return true;
end $$;

-- A lower-progress update must never rewind either the percentage or the stage.
create or replace function public.update_business_analysis_progress_owned(
 p_job_id uuid,p_access_token_hash text,p_worker_token uuid,p_stage text,p_progress integer,p_canonical_url text default null,p_pages_read integer default null
) returns boolean language plpgsql security definer set search_path=public as $$
begin
 update public.business_analysis_jobs baj set
   stage=case when greatest(0,least(p_progress,99)) >= coalesce(baj.progress,0) then p_stage else baj.stage end,
   progress=greatest(coalesce(baj.progress,0),greatest(0,least(p_progress,99))),
   canonical_url=coalesce(p_canonical_url,baj.canonical_url),
   pages_read=coalesce(p_pages_read,baj.pages_read),
   lease_expires_at=now()+interval '5 minutes',updated_at=now()
 where baj.id=p_job_id and baj.access_token_hash=p_access_token_hash and baj.worker_token=p_worker_token and baj.status='RUNNING';
 if not found then raise exception 'BUSINESS_ANALYSIS_OWNERSHIP_LOST'; end if;
 return true;
end $$;

-- Background provider work is a resumable handoff, not a stage reset. Preserve
-- truthful progress (20% for Core, 72%+ for Growth) when yielding the lease.
create or replace function public.defer_business_analysis_background_owned(
 p_job_id uuid,p_access_token_hash text,p_worker_token uuid
) returns boolean language plpgsql security definer set search_path=public as $$
begin
 update public.business_analysis_jobs baj set
   status='QUEUED',
   attempt_count=greatest(baj.attempt_count-1,0),
   claimed_at=null,lease_expires_at=null,worker_token=null,
   next_retry_at=now()+interval '5 seconds',
   last_error_code=null,last_error_message=null,updated_at=now()
 where baj.id=p_job_id and baj.access_token_hash=p_access_token_hash and baj.worker_token=p_worker_token and baj.status='RUNNING';
 if not found then raise exception 'BUSINESS_ANALYSIS_OWNERSHIP_LOST'; end if;
 return true;
end $$;

revoke all on function public.persist_business_analysis_core_owned(uuid,text,uuid,text,integer,jsonb) from public,anon,authenticated;
grant execute on function public.persist_business_analysis_core_owned(uuid,text,uuid,text,integer,jsonb) to service_role;
revoke all on function public.update_business_analysis_progress_owned(uuid,text,uuid,text,integer,text,integer) from public,anon,authenticated;
grant execute on function public.update_business_analysis_progress_owned(uuid,text,uuid,text,integer,text,integer) to service_role;
revoke all on function public.defer_business_analysis_background_owned(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.defer_business_analysis_background_owned(uuid,text,uuid) to service_role;
