-- MarketRoute G5.1.13.2 — Parallel Evidence Engine.
-- Each staged breadth candidate becomes an independently fenced evidence work unit.
-- The archetype cursor may advance only after every candidate in that archetype is terminal.

alter table public.company_discovery_candidates
  drop constraint if exists company_discovery_candidates_candidate_status_check;

alter table public.company_discovery_candidates
  add constraint company_discovery_candidates_candidate_status_check
  check(candidate_status in ('DISCOVERED','VERIFYING','VERIFIED','HELD'));

alter table public.company_discovery_candidates
  add column if not exists verification_attempt_count integer not null default 0,
  add column if not exists verification_worker_token uuid,
  add column if not exists verification_claimed_at timestamptz,
  add column if not exists verification_lease_expires_at timestamptz,
  add column if not exists verification_last_error text,
  add column if not exists verification_diagnostics_json jsonb not null default '{}'::jsonb;

create index if not exists company_discovery_candidates_verification_queue_idx
  on public.company_discovery_candidates(discovery_session_id,search_pass,archetype_index,candidate_status,verification_lease_expires_at);

create or replace function public.claim_company_discovery_candidate_verification_owned(
  p_session_id uuid,
  p_scheduler_run_id uuid,
  p_search_pass integer,
  p_archetype_index integer,
  p_website_url text,
  p_lease_seconds integer default 45
) returns table(candidate_id uuid,worker_token uuid,attempt_count integer,candidate_status text)
language plpgsql security definer set search_path=public as $$
declare
  v_domain text;
  v_token uuid:=gen_random_uuid();
begin
  perform public.assert_company_discovery_owner(p_session_id,p_scheduler_run_id,true);
  v_domain:=lower(regexp_replace(regexp_replace(coalesce(p_website_url,''),'^https?://',''),'[/#?].*$',''));
  v_domain:=regexp_replace(v_domain,'^www\\.','');
  if v_domain='' then return; end if;

  return query
  update public.company_discovery_candidates c set
    candidate_status='VERIFYING',
    verification_worker_token=v_token,
    verification_claimed_at=now(),
    verification_lease_expires_at=now()+make_interval(secs=>greatest(15,least(coalesce(p_lease_seconds,45),120))),
    verification_attempt_count=c.verification_attempt_count+1,
    verification_last_error=null,
    updated_at=now()
  where c.discovery_session_id=p_session_id
    and c.search_pass=p_search_pass
    and c.archetype_index=p_archetype_index
    and c.canonical_domain=v_domain
    and (
      c.candidate_status='DISCOVERED'
      or (c.candidate_status='VERIFYING' and coalesce(c.verification_lease_expires_at,now()-interval '1 second')<now())
    )
  returning c.id,v_token,c.verification_attempt_count,c.candidate_status;
end $$;

create or replace function public.complete_company_discovery_candidate_verification_owned(
  p_session_id uuid,
  p_scheduler_run_id uuid,
  p_candidate_id uuid,
  p_worker_token uuid,
  p_status text,
  p_hold_reason text default null,
  p_diagnostics jsonb default '{}'::jsonb
) returns boolean
language plpgsql security definer set search_path=public as $$
declare v_status text:=upper(coalesce(p_status,''));
begin
  perform public.assert_company_discovery_owner(p_session_id,p_scheduler_run_id,true);
  if v_status not in ('VERIFIED','HELD') then raise exception 'invalid candidate verification terminal status'; end if;

  update public.company_discovery_candidates c set
    candidate_status=v_status,
    hold_reason=case when v_status='HELD' then left(p_hold_reason,160) else null end,
    verified_at=now(),
    verification_diagnostics_json=coalesce(p_diagnostics,'{}'::jsonb),
    verification_worker_token=null,
    verification_claimed_at=null,
    verification_lease_expires_at=null,
    verification_last_error=null,
    updated_at=now()
  where c.id=p_candidate_id
    and c.discovery_session_id=p_session_id
    and c.candidate_status='VERIFYING'
    and c.verification_worker_token=p_worker_token;

  if not found then raise exception 'COMPANY_DISCOVERY_CANDIDATE_OWNERSHIP_LOST'; end if;
  return true;
end $$;

create or replace function public.release_company_discovery_candidate_verification_owned(
  p_session_id uuid,
  p_scheduler_run_id uuid,
  p_candidate_id uuid,
  p_worker_token uuid,
  p_error_message text,
  p_max_attempts integer default 3
) returns text
language plpgsql security definer set search_path=public as $$
declare
  v_attempt integer;
  v_next_status text;
begin
  perform public.assert_company_discovery_owner(p_session_id,p_scheduler_run_id,true);
  select verification_attempt_count into v_attempt
    from public.company_discovery_candidates
   where id=p_candidate_id
     and discovery_session_id=p_session_id
     and candidate_status='VERIFYING'
     and verification_worker_token=p_worker_token
   for update;
  if not found then raise exception 'COMPANY_DISCOVERY_CANDIDATE_OWNERSHIP_LOST'; end if;

  v_next_status:=case when v_attempt>=greatest(1,least(coalesce(p_max_attempts,3),6)) then 'HELD' else 'DISCOVERED' end;
  update public.company_discovery_candidates set
    candidate_status=v_next_status,
    hold_reason=case when v_next_status='HELD' then 'VERIFICATION_TECHNICAL_FAILURE' else hold_reason end,
    verification_last_error=left(coalesce(p_error_message,'Evidence verification interrupted'),500),
    verification_worker_token=null,
    verification_claimed_at=null,
    verification_lease_expires_at=null,
    verified_at=case when v_next_status='HELD' then now() else verified_at end,
    updated_at=now()
  where id=p_candidate_id and verification_worker_token=p_worker_token;
  return v_next_status;
end $$;

create or replace function public.company_discovery_archetype_verification_state_owned(
  p_session_id uuid,
  p_scheduler_run_id uuid,
  p_search_pass integer,
  p_archetype_index integer
) returns table(total integer,discovered integer,verifying integer,verified integer,held integer)
language plpgsql security definer set search_path=public as $$
begin
  perform public.assert_company_discovery_owner(p_session_id,p_scheduler_run_id,true);
  return query
  select count(*)::integer,
         count(*) filter(where c.candidate_status='DISCOVERED')::integer,
         count(*) filter(where c.candidate_status='VERIFYING')::integer,
         count(*) filter(where c.candidate_status='VERIFIED')::integer,
         count(*) filter(where c.candidate_status='HELD')::integer
    from public.company_discovery_candidates c
   where c.discovery_session_id=p_session_id
     and c.search_pass=p_search_pass
     and c.archetype_index=p_archetype_index;
end $$;

revoke all on function public.claim_company_discovery_candidate_verification_owned(uuid,uuid,integer,integer,text,integer) from public,anon,authenticated;
revoke all on function public.complete_company_discovery_candidate_verification_owned(uuid,uuid,uuid,uuid,text,text,jsonb) from public,anon,authenticated;
revoke all on function public.release_company_discovery_candidate_verification_owned(uuid,uuid,uuid,uuid,text,integer) from public,anon,authenticated;
revoke all on function public.company_discovery_archetype_verification_state_owned(uuid,uuid,integer,integer) from public,anon,authenticated;
grant execute on function public.claim_company_discovery_candidate_verification_owned(uuid,uuid,integer,integer,text,integer) to service_role;
grant execute on function public.complete_company_discovery_candidate_verification_owned(uuid,uuid,uuid,uuid,text,text,jsonb) to service_role;
grant execute on function public.release_company_discovery_candidate_verification_owned(uuid,uuid,uuid,uuid,text,integer) to service_role;
grant execute on function public.company_discovery_archetype_verification_state_owned(uuid,uuid,integer,integer) to service_role;

-- Evidence retries are expected unit-level recovery, not a failed archetype attempt.
create or replace function public.defer_company_discovery_evidence_owned(
  p_session_id uuid,p_scheduler_run_id uuid
) returns boolean
language plpgsql security definer set search_path=public as $$
declare s public.discovery_sessions%rowtype;
begin
  perform public.assert_active_pipeline_scheduler_run(p_scheduler_run_id);
  select * into s from public.discovery_sessions where id=p_session_id for update;
  if s.id is null or s.status<>'RUNNING' or s.scheduler_run_id is distinct from p_scheduler_run_id then return false; end if;
  update public.discovery_sessions set
    status='QUEUED',job_state='QUEUED',attempt_count=greatest(attempt_count-1,0),
    claimed_at=null,lease_expires_at=null,scheduler_run_id=null,
    next_attempt_at=now()+interval '3 seconds',next_retry_at=null,
    last_error=null,last_error_code=null,last_error_message=null,
    heartbeat_at=now(),last_heartbeat_at=now(),updated_at=now()
  where id=p_session_id;
  return true;
end $$;
revoke all on function public.defer_company_discovery_evidence_owned(uuid,uuid) from public,anon,authenticated;
grant execute on function public.defer_company_discovery_evidence_owned(uuid,uuid) to service_role;
