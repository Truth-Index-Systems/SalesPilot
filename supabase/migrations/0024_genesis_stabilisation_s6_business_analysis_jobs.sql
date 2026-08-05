-- Genesis Stabilisation S6: persisted and recoverable website analysis jobs.

create table if not exists public.business_analysis_jobs (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid references public.organisations(id) on delete cascade,
  requested_by uuid,
  access_token_hash text not null,
  website_input text not null,
  canonical_url text,
  status text not null default 'QUEUED'
    check (status in ('QUEUED','RUNNING','COMPLETED','FAILED_RETRYABLE','FAILED_TERMINAL','CANCELLED')),
  stage text not null default 'QUEUED'
    check (stage in ('QUEUED','READING_WEBSITE','ANALYSING_BUSINESS','PREPARING_RECOMMENDATIONS','COMPLETE','FAILED')),
  progress integer not null default 0 check (progress between 0 and 100),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  claimed_at timestamptz,
  lease_expires_at timestamptz,
  next_retry_at timestamptz,
  last_error_code text,
  last_error_message text,
  pages_read integer not null default 0 check (pages_read >= 0),
  analysis_json jsonb,
  result_summary_json jsonb not null default '{}'::jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists business_analysis_jobs_access_idx
  on public.business_analysis_jobs(access_token_hash, created_at desc);
create index if not exists business_analysis_jobs_status_idx
  on public.business_analysis_jobs(status, next_retry_at, created_at);
create index if not exists business_analysis_jobs_org_idx
  on public.business_analysis_jobs(organisation_id, created_at desc)
  where organisation_id is not null;

alter table public.business_analysis_jobs enable row level security;
drop policy if exists business_analysis_jobs_member_read on public.business_analysis_jobs;
create policy business_analysis_jobs_member_read on public.business_analysis_jobs
for select to authenticated using (
  organisation_id is not null and public.is_active_org_member(organisation_id)
);

create or replace function public.claim_business_analysis_job(
  p_job_id uuid,
  p_access_token_hash text,
  p_lease_seconds integer default 240
) returns public.business_analysis_jobs
language plpgsql security definer set search_path=public as $$
declare v_job public.business_analysis_jobs%rowtype;
begin
  update public.business_analysis_jobs
  set
    status='RUNNING',
    stage='READING_WEBSITE',
    progress=8,
    attempt_count=attempt_count+1,
    claimed_at=now(),
    lease_expires_at=now()+make_interval(secs => greatest(60,least(p_lease_seconds,600))),
    next_retry_at=null,
    last_error_code=null,
    last_error_message=null,
    started_at=coalesce(started_at,now()),
    updated_at=now()
  where id=p_job_id
    and access_token_hash=p_access_token_hash
    and (
      status='QUEUED'
      or (status='FAILED_RETRYABLE' and coalesce(next_retry_at,now())<=now())
      or (status='RUNNING' and lease_expires_at<now())
    )
  returning * into v_job;
  return v_job;
end $$;

create or replace function public.update_business_analysis_progress(
  p_job_id uuid,
  p_access_token_hash text,
  p_stage text,
  p_progress integer,
  p_canonical_url text default null,
  p_pages_read integer default null
) returns boolean
language plpgsql security definer set search_path=public as $$
begin
  update public.business_analysis_jobs set
    stage=p_stage,
    progress=greatest(0,least(p_progress,99)),
    canonical_url=coalesce(p_canonical_url,canonical_url),
    pages_read=coalesce(p_pages_read,pages_read),
    lease_expires_at=now()+interval '4 minutes',
    updated_at=now()
  where id=p_job_id and access_token_hash=p_access_token_hash and status='RUNNING';
  return found;
end $$;

create or replace function public.complete_business_analysis_job(
  p_job_id uuid,
  p_access_token_hash text,
  p_canonical_url text,
  p_pages_read integer,
  p_analysis jsonb,
  p_result_summary jsonb default '{}'::jsonb
) returns boolean
language plpgsql security definer set search_path=public as $$
begin
  update public.business_analysis_jobs set
    status='COMPLETED', stage='COMPLETE', progress=100,
    canonical_url=p_canonical_url, pages_read=p_pages_read,
    analysis_json=p_analysis,
    result_summary_json=coalesce(p_result_summary,'{}'::jsonb),
    claimed_at=null, lease_expires_at=null, next_retry_at=null,
    completed_at=now(), updated_at=now()
  where id=p_job_id and access_token_hash=p_access_token_hash and status='RUNNING';
  return found;
end $$;

create or replace function public.fail_business_analysis_job(
  p_job_id uuid,
  p_access_token_hash text,
  p_error_code text,
  p_error_message text,
  p_retryable boolean
) returns boolean
language plpgsql security definer set search_path=public as $$
declare v_attempt integer;
begin
  select attempt_count into v_attempt from public.business_analysis_jobs
  where id=p_job_id and access_token_hash=p_access_token_hash for update;
  if not found then return false; end if;
  update public.business_analysis_jobs set
    status=case when p_retryable and v_attempt<5 then 'FAILED_RETRYABLE' else 'FAILED_TERMINAL' end,
    stage='FAILED', progress=0,
    last_error_code=p_error_code,
    last_error_message=left(p_error_message,1000),
    next_retry_at=case
      when not p_retryable or v_attempt>=5 then null
      when v_attempt<=1 then now()+interval '1 minute'
      when v_attempt=2 then now()+interval '5 minutes'
      when v_attempt=3 then now()+interval '30 minutes'
      else now()+interval '2 hours'
    end,
    claimed_at=null, lease_expires_at=null, updated_at=now()
  where id=p_job_id and access_token_hash=p_access_token_hash;
  return true;
end $$;

revoke all on function public.claim_business_analysis_job(uuid,text,integer) from public,anon,authenticated;
revoke all on function public.update_business_analysis_progress(uuid,text,text,integer,text,integer) from public,anon,authenticated;
revoke all on function public.complete_business_analysis_job(uuid,text,text,integer,jsonb,jsonb) from public,anon,authenticated;
revoke all on function public.fail_business_analysis_job(uuid,text,text,text,boolean) from public,anon,authenticated;
grant execute on function public.claim_business_analysis_job(uuid,text,integer) to service_role;
grant execute on function public.update_business_analysis_progress(uuid,text,text,integer,text,integer) to service_role;
grant execute on function public.complete_business_analysis_job(uuid,text,text,integer,jsonb,jsonb) to service_role;
grant execute on function public.fail_business_analysis_job(uuid,text,text,text,boolean) to service_role;
