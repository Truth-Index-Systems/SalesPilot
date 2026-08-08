-- MarketRoute G5.1.11 — Company Discovery work-unit authority hardening.
-- 1) Timeline start events are idempotent per search-pass/archetype so background
--    resumes do not look like repeated execution.
-- 2) The archetype cursor cannot advance unless that exact unit's AI result was
--    durably persisted first.

create or replace function public.record_discovery_activity_once_owned(
  p_session_id uuid,
  p_scheduler_run_id uuid,
  p_dedupe_key text,
  p_activity_type text,
  p_title text,
  p_description text default null,
  p_metadata jsonb default '{}'::jsonb
) returns boolean
language plpgsql security definer set search_path=public as $$
declare s public.discovery_sessions%rowtype;
begin
  perform public.assert_company_discovery_owner(p_session_id,p_scheduler_run_id,false);
  select * into s from public.discovery_sessions where id=p_session_id;
  if s.id is null then raise exception 'discovery session missing'; end if;
  if nullif(trim(coalesce(p_dedupe_key,'')),'') is null then raise exception 'discovery activity dedupe key required'; end if;

  -- The scheduler is already single-authority, but lock the event identity too so
  -- overlapping serverless tails cannot race the NOT EXISTS check.
  perform pg_advisory_xact_lock(hashtextextended('marketroute-discovery-activity:'||p_session_id::text||':'||p_dedupe_key,0));

  if exists(
    select 1 from public.discovery_activity a
    where a.discovery_session_id=p_session_id
      and a.activity_type=left(p_activity_type,80)
      and a.metadata_json->>'dedupeKey'=p_dedupe_key
  ) then
    return false;
  end if;

  insert into public.discovery_activity(
    organisation_id,campaign_id,discovery_session_id,activity_type,title,description,metadata_json
  ) values(
    s.organisation_id,s.campaign_id,s.id,left(p_activity_type,80),left(p_title,160),left(p_description,500),
    coalesce(p_metadata,'{}'::jsonb)||jsonb_build_object('dedupeKey',p_dedupe_key)
  );
  return true;
end $$;

create or replace function public.complete_company_discovery_archetype_owned(
  p_session_id uuid,
  p_scheduler_run_id uuid,
  p_completed_archetype_index integer,
  p_archetype_total integer,
  p_cumulative_summary jsonb,
  p_release_for_next boolean
) returns void
language plpgsql security definer set search_path=public as $$
declare s public.discovery_sessions%rowtype; v_next integer;
begin
  perform public.assert_company_discovery_owner(p_session_id,p_scheduler_run_id,true);
  select * into s from public.discovery_sessions where id=p_session_id for update;
  if s.id is null then raise exception 'discovery session missing'; end if;
  if p_archetype_total < 1 or p_archetype_total > 8 then raise exception 'invalid company discovery archetype total'; end if;
  if p_archetype_total <> coalesce(s.company_search_archetype_total,0) then
    raise exception 'COMPANY_DISCOVERY_ARCHETYPE_TOTAL_MISMATCH';
  end if;
  if p_completed_archetype_index <> coalesce(s.company_search_archetype_cursor,0) then
    raise exception 'COMPANY_DISCOVERY_ARCHETYPE_CURSOR_MISMATCH';
  end if;
  if s.company_search_active_result_index is distinct from p_completed_archetype_index
     or s.company_search_active_result_json is null then
    raise exception 'COMPANY_DISCOVERY_ARCHETYPE_RESULT_NOT_PERSISTED';
  end if;

  v_next:=p_completed_archetype_index+1;
  if v_next > p_archetype_total then raise exception 'invalid company discovery archetype cursor'; end if;

  update public.discovery_sessions set
    company_search_archetype_cursor=v_next,
    company_search_archetype_total=p_archetype_total,
    company_search_cumulative_json=coalesce(p_cumulative_summary,'{}'::jsonb),
    company_search_active_result_index=null,
    company_search_active_result_json=null,
    candidates_found=coalesce((p_cumulative_summary->>'candidatesReturned')::integer,candidates_found,0),
    recommendations_saved=(select count(*) from public.companies c where c.organisation_id=s.organisation_id and c.campaign_id=s.campaign_id),
    attempt_count=0,
    status=case when p_release_for_next then 'QUEUED' else status end,
    job_state=case when p_release_for_next then 'QUEUED' else job_state end,
    stage=case when p_release_for_next then 'SEARCHING' else stage end,
    progress=greatest(coalesce(progress,0), least(70,40+round((v_next::numeric/p_archetype_total::numeric)*30)::integer)),
    next_attempt_at=case when p_release_for_next then now()+interval '2 seconds' else next_attempt_at end,
    next_retry_at=case when p_release_for_next then null else next_retry_at end,
    claimed_at=case when p_release_for_next then null else claimed_at end,
    scheduler_run_id=case when p_release_for_next then null else scheduler_run_id end,
    lease_expires_at=case when p_release_for_next then null else lease_expires_at end,
    last_error=null,last_error_code=null,last_error_message=null,
    heartbeat_at=now(),last_heartbeat_at=now(),updated_at=now()
  where id=p_session_id;
end $$;

revoke all on function public.record_discovery_activity_once_owned(uuid,uuid,text,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.record_discovery_activity_once_owned(uuid,uuid,text,text,text,text,jsonb) to service_role;
revoke all on function public.complete_company_discovery_archetype_owned(uuid,uuid,integer,integer,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.complete_company_discovery_archetype_owned(uuid,uuid,integer,integer,jsonb,boolean) to service_role;
