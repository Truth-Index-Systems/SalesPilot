-- MarketRoute G5.1.9 — Business Analysis hardening and legacy-authority cleanup.
-- Keeps the decomposed G5.1.x worker as the sole mutation authority, removes
-- superseded pre-worker-token RPCs, and adds a narrowly fenced cleanup path for
-- anonymous jobs that were durably created but rejected by entitlement checks.

-- These S6-era mutation RPCs were already revoked from service_role in G4.7.10.
-- Drop them completely so a future permission/migration change cannot revive an
-- unfenced Business Analysis execution path.
drop function if exists public.update_business_analysis_progress(uuid,text,text,integer,text,integer);
drop function if exists public.complete_business_analysis_job(uuid,text,text,integer,jsonb,jsonb);
drop function if exists public.fail_business_analysis_job(uuid,text,text,text,boolean);

create or replace function public.delete_queued_anonymous_business_analysis_job(
  p_job_id uuid,
  p_access_token_hash text
) returns boolean
language plpgsql security definer set search_path=public as $$
begin
  delete from public.business_analysis_jobs
   where id=p_job_id
     and access_token_hash=p_access_token_hash
     and organisation_id is null
     and requested_by is null
     and status='QUEUED'
     and core_analysis_json is null
     and analysis_json is null;
  return found;
end $$;

revoke all on function public.delete_queued_anonymous_business_analysis_job(uuid,text) from public,anon,authenticated;
grant execute on function public.delete_queued_anonymous_business_analysis_job(uuid,text) to service_role;
