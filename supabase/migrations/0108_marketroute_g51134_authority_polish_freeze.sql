-- MarketRoute G5.1.13.4 — Authority & Polish Freeze.
-- Freeze the incremental Company Discovery architecture after R1-R3:
-- 1) stale candidate verification leases cannot remain non-terminal forever;
-- 2) retry ceilings are enforced even when a worker dies instead of releasing cleanly;
-- 3) verification lifecycle timing is retained for production observability.
-- Commercial scoring, evidence quality and downstream route intelligence are unchanged.

alter table public.company_discovery_candidates
  add column if not exists verification_first_started_at timestamptz,
  add column if not exists verification_completed_at timestamptz;

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

  -- A worker can disappear without calling the release RPC. Once the bounded
  -- attempt budget is exhausted, an expired lease is terminal rather than an
  -- indefinitely reclaimable VERIFYING unit.
  update public.company_discovery_candidates c set
    candidate_status='HELD',
    hold_reason='VERIFICATION_TECHNICAL_FAILURE',
    verification_last_error=coalesce(c.verification_last_error,'Evidence verification worker lease expired after the retry ceiling.'),
    verification_worker_token=null,
    verification_claimed_at=null,
    verification_lease_expires_at=null,
    verified_at=coalesce(c.verified_at,now()),
    verification_completed_at=coalesce(c.verification_completed_at,now()),
    updated_at=now()
  where c.discovery_session_id=p_session_id
    and c.search_pass=p_search_pass
    and c.archetype_index=p_archetype_index
    and c.canonical_domain=v_domain
    and c.candidate_status='VERIFYING'
    and c.verification_attempt_count>=3
    and coalesce(c.verification_lease_expires_at,now()-interval '1 second')<now();

  return query
  update public.company_discovery_candidates c set
    candidate_status='VERIFYING',
    verification_worker_token=v_token,
    verification_claimed_at=now(),
    verification_first_started_at=coalesce(c.verification_first_started_at,now()),
    verification_lease_expires_at=now()+make_interval(secs=>greatest(15,least(coalesce(p_lease_seconds,45),120))),
    verification_attempt_count=c.verification_attempt_count+1,
    verification_last_error=null,
    updated_at=now()
  where c.discovery_session_id=p_session_id
    and c.search_pass=p_search_pass
    and c.archetype_index=p_archetype_index
    and c.canonical_domain=v_domain
    and c.verification_attempt_count<3
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
    verification_completed_at=now(),
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
  v_max_attempts integer:=greatest(1,least(coalesce(p_max_attempts,3),3));
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

  v_next_status:=case when v_attempt>=v_max_attempts then 'HELD' else 'DISCOVERED' end;
  update public.company_discovery_candidates set
    candidate_status=v_next_status,
    hold_reason=case when v_next_status='HELD' then 'VERIFICATION_TECHNICAL_FAILURE' else hold_reason end,
    verification_last_error=left(coalesce(p_error_message,'Evidence verification interrupted'),500),
    verification_worker_token=null,
    verification_claimed_at=null,
    verification_lease_expires_at=null,
    verified_at=case when v_next_status='HELD' then coalesce(verified_at,now()) else verified_at end,
    verification_completed_at=case when v_next_status='HELD' then coalesce(verification_completed_at,now()) else verification_completed_at end,
    updated_at=now()
  where id=p_candidate_id and verification_worker_token=p_worker_token;
  return v_next_status;
end $$;

-- Repair stale verification units before reporting archetype state. This makes
-- state inspection itself a recovery boundary and prevents an orphaned lease
-- from holding the archetype cursor forever after the bounded attempt ceiling.
create or replace function public.company_discovery_archetype_verification_state_owned(
  p_session_id uuid,
  p_scheduler_run_id uuid,
  p_search_pass integer,
  p_archetype_index integer
) returns table(total integer,discovered integer,verifying integer,verified integer,held integer)
language plpgsql security definer set search_path=public as $$
begin
  perform public.assert_company_discovery_owner(p_session_id,p_scheduler_run_id,true);

  update public.company_discovery_candidates c set
    candidate_status='HELD',
    hold_reason='VERIFICATION_TECHNICAL_FAILURE',
    verification_last_error=coalesce(c.verification_last_error,'Evidence verification worker lease expired after the retry ceiling.'),
    verification_worker_token=null,
    verification_claimed_at=null,
    verification_lease_expires_at=null,
    verified_at=coalesce(c.verified_at,now()),
    verification_completed_at=coalesce(c.verification_completed_at,now()),
    updated_at=now()
  where c.discovery_session_id=p_session_id
    and c.search_pass=p_search_pass
    and c.archetype_index=p_archetype_index
    and c.candidate_status='VERIFYING'
    and c.verification_attempt_count>=3
    and coalesce(c.verification_lease_expires_at,now()-interval '1 second')<now();

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

create index if not exists company_discovery_candidates_verification_timing_idx
  on public.company_discovery_candidates(discovery_session_id,verification_first_started_at,verification_completed_at);

revoke all on function public.claim_company_discovery_candidate_verification_owned(uuid,uuid,integer,integer,text,integer) from public,anon,authenticated;
revoke all on function public.complete_company_discovery_candidate_verification_owned(uuid,uuid,uuid,uuid,text,text,jsonb) from public,anon,authenticated;
revoke all on function public.release_company_discovery_candidate_verification_owned(uuid,uuid,uuid,uuid,text,integer) from public,anon,authenticated;
revoke all on function public.company_discovery_archetype_verification_state_owned(uuid,uuid,integer,integer) from public,anon,authenticated;
grant execute on function public.claim_company_discovery_candidate_verification_owned(uuid,uuid,integer,integer,text,integer) to service_role;
grant execute on function public.complete_company_discovery_candidate_verification_owned(uuid,uuid,uuid,uuid,text,text,jsonb) to service_role;
grant execute on function public.release_company_discovery_candidate_verification_owned(uuid,uuid,uuid,uuid,text,integer) to service_role;
grant execute on function public.company_discovery_archetype_verification_state_owned(uuid,uuid,integer,integer) to service_role;

comment on table public.company_discovery_candidates is
  'MarketRoute staged Company Discovery candidates. DISCOVERED/VERIFYING are provisional; VERIFIED/HELD are terminal evidence decisions. Canonical companies remain evidence-gated.';
