-- Genesis G8.1 Release 14 — Business DNA -> Knowledge Matching activation boundary.
-- Stores only the retrieval result on the private analysis job. Business DNA is
-- never promoted into the shared G8 graph by this release.

alter table public.business_analysis_jobs
  add column if not exists genesis_g8_match_status text not null default 'NOT_STARTED',
  add column if not exists genesis_g8_match_version text,
  add column if not exists genesis_g8_match_json jsonb,
  add column if not exists genesis_g8_match_error text,
  add column if not exists genesis_g8_match_started_at timestamptz,
  add column if not exists genesis_g8_match_completed_at timestamptz;

alter table public.business_analysis_jobs drop constraint if exists business_analysis_jobs_genesis_g8_match_status_check;
alter table public.business_analysis_jobs add constraint business_analysis_jobs_genesis_g8_match_status_check
  check (genesis_g8_match_status in ('NOT_STARTED','RUNNING','COMPLETED','SKIPPED','FAILED'));

create or replace function public.start_business_analysis_g8_match_owned(
  p_job_id uuid,p_access_token_hash text,p_worker_token uuid,p_version text
) returns boolean language plpgsql security definer set search_path=public as $$
begin
  update public.business_analysis_jobs baj set
    genesis_g8_match_status='RUNNING',genesis_g8_match_version=p_version,
    genesis_g8_match_error=null,genesis_g8_match_started_at=coalesce(baj.genesis_g8_match_started_at,now()),updated_at=now()
  where baj.id=p_job_id and baj.access_token_hash=p_access_token_hash and baj.worker_token=p_worker_token and baj.status='RUNNING';
  if not found then raise exception 'BUSINESS_ANALYSIS_OWNERSHIP_LOST'; end if;
  return true;
end $$;

create or replace function public.complete_business_analysis_g8_match_owned(
  p_job_id uuid,p_access_token_hash text,p_worker_token uuid,p_version text,p_match jsonb
) returns boolean language plpgsql security definer set search_path=public as $$
begin
  update public.business_analysis_jobs baj set
    genesis_g8_match_status='COMPLETED',genesis_g8_match_version=p_version,genesis_g8_match_json=coalesce(p_match,'{}'::jsonb),
    genesis_g8_match_error=null,genesis_g8_match_completed_at=now(),updated_at=now()
  where baj.id=p_job_id and baj.access_token_hash=p_access_token_hash and baj.worker_token=p_worker_token and baj.status='RUNNING';
  if not found then raise exception 'BUSINESS_ANALYSIS_OWNERSHIP_LOST'; end if;
  return true;
end $$;

create or replace function public.fail_business_analysis_g8_match_owned(
  p_job_id uuid,p_access_token_hash text,p_worker_token uuid,p_version text,p_error text
) returns boolean language plpgsql security definer set search_path=public as $$
begin
  update public.business_analysis_jobs baj set
    genesis_g8_match_status='FAILED',genesis_g8_match_version=p_version,genesis_g8_match_error=left(coalesce(p_error,'G8_MATCH_FAILED'),500),
    genesis_g8_match_completed_at=now(),updated_at=now()
  where baj.id=p_job_id and baj.access_token_hash=p_access_token_hash and baj.worker_token=p_worker_token and baj.status='RUNNING';
  if not found then raise exception 'BUSINESS_ANALYSIS_OWNERSHIP_LOST'; end if;
  return true;
end $$;

create or replace function public.skip_business_analysis_g8_match_owned(
  p_job_id uuid,p_access_token_hash text,p_worker_token uuid,p_version text
) returns boolean language plpgsql security definer set search_path=public as $$
begin
  update public.business_analysis_jobs baj set
    genesis_g8_match_status='SKIPPED',genesis_g8_match_version=p_version,genesis_g8_match_error=null,genesis_g8_match_completed_at=now(),updated_at=now()
  where baj.id=p_job_id and baj.access_token_hash=p_access_token_hash and baj.worker_token=p_worker_token and baj.status='RUNNING';
  if not found then raise exception 'BUSINESS_ANALYSIS_OWNERSHIP_LOST'; end if;
  return true;
end $$;

revoke all on function public.start_business_analysis_g8_match_owned(uuid,text,uuid,text) from public,anon,authenticated;
revoke all on function public.complete_business_analysis_g8_match_owned(uuid,text,uuid,text,jsonb) from public,anon,authenticated;
revoke all on function public.fail_business_analysis_g8_match_owned(uuid,text,uuid,text,text) from public,anon,authenticated;
revoke all on function public.skip_business_analysis_g8_match_owned(uuid,text,uuid,text) from public,anon,authenticated;
grant execute on function public.start_business_analysis_g8_match_owned(uuid,text,uuid,text) to service_role;
grant execute on function public.complete_business_analysis_g8_match_owned(uuid,text,uuid,text,jsonb) to service_role;
grant execute on function public.fail_business_analysis_g8_match_owned(uuid,text,uuid,text,text) to service_role;
grant execute on function public.skip_business_analysis_g8_match_owned(uuid,text,uuid,text) to service_role;

comment on column public.business_analysis_jobs.genesis_g8_match_json is 'Private R14 Business DNA knowledge-match snapshot. Never shared back into the G8 evidence graph.';
