-- Genesis post-freeze: Company Discovery workload decomposition for full GPT-5.
-- Scope: persist the deterministic market plan and execute one bounded account
-- archetype per scheduler claim. Existing evidence validation/finalisation remains
-- authoritative. G5 and Route Intelligence are unchanged.

alter table public.discovery_sessions
  add column if not exists company_search_plan_json jsonb,
  add column if not exists company_search_plan_pass integer,
  add column if not exists company_search_archetype_cursor integer not null default 0 check (company_search_archetype_cursor >= 0),
  add column if not exists company_search_archetype_total integer not null default 0 check (company_search_archetype_total >= 0),
  add column if not exists company_search_cumulative_json jsonb not null default '{}'::jsonb,
  add column if not exists company_search_active_result_index integer,
  add column if not exists company_search_active_result_json jsonb;

create or replace function public.persist_company_discovery_search_plan_owned(
  p_session_id uuid,
  p_scheduler_run_id uuid,
  p_search_pass integer,
  p_search_plan jsonb,
  p_archetype_total integer
) returns void
language plpgsql security definer set search_path=public as $$
begin
  perform public.assert_company_discovery_owner(p_session_id,p_scheduler_run_id,true);
  if p_search_pass < 1 then raise exception 'invalid company discovery search pass'; end if;
  if p_archetype_total < 1 or p_archetype_total > 8 then raise exception 'invalid company discovery archetype total'; end if;
  if p_search_plan is null or jsonb_typeof(p_search_plan) <> 'object' then raise exception 'invalid company discovery search plan'; end if;

  update public.discovery_sessions set
    company_search_plan_json=p_search_plan,
    company_search_plan_pass=p_search_pass,
    company_search_archetype_cursor=0,
    company_search_archetype_total=p_archetype_total,
    company_search_cumulative_json='{}'::jsonb,
    company_search_active_result_index=null,
    company_search_active_result_json=null,
    heartbeat_at=now(),last_heartbeat_at=now(),updated_at=now()
  where id=p_session_id;
end $$;


create or replace function public.persist_company_discovery_archetype_result_owned(
  p_session_id uuid,
  p_scheduler_run_id uuid,
  p_archetype_index integer,
  p_result jsonb
) returns void
language plpgsql security definer set search_path=public as $$
declare s public.discovery_sessions%rowtype;
begin
  perform public.assert_company_discovery_owner(p_session_id,p_scheduler_run_id,true);
  select * into s from public.discovery_sessions where id=p_session_id for update;
  if s.id is null then raise exception 'discovery session missing'; end if;
  if p_archetype_index <> coalesce(s.company_search_archetype_cursor,0) then raise exception 'COMPANY_DISCOVERY_ARCHETYPE_CURSOR_MISMATCH'; end if;
  if p_result is null or jsonb_typeof(p_result) <> 'object' then raise exception 'invalid company discovery archetype result'; end if;
  update public.discovery_sessions set
    company_search_active_result_index=p_archetype_index,
    company_search_active_result_json=p_result,
    heartbeat_at=now(),last_heartbeat_at=now(),updated_at=now()
  where id=p_session_id;
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
  if p_completed_archetype_index <> coalesce(s.company_search_archetype_cursor,0) then
    raise exception 'COMPANY_DISCOVERY_ARCHETYPE_CURSOR_MISMATCH';
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

revoke all on function public.persist_company_discovery_search_plan_owned(uuid,uuid,integer,jsonb,integer) from public,anon,authenticated;
revoke all on function public.persist_company_discovery_archetype_result_owned(uuid,uuid,integer,jsonb) from public,anon,authenticated;
revoke all on function public.complete_company_discovery_archetype_owned(uuid,uuid,integer,integer,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.persist_company_discovery_search_plan_owned(uuid,uuid,integer,jsonb,integer) to service_role;
grant execute on function public.persist_company_discovery_archetype_result_owned(uuid,uuid,integer,jsonb) to service_role;
grant execute on function public.complete_company_discovery_archetype_owned(uuid,uuid,integer,integer,jsonb,boolean) to service_role;

-- Existing in-flight sessions safely start a fresh bounded unit on next claim.
update public.discovery_sessions
set company_search_plan_json=null,
    company_search_plan_pass=null,
    company_search_archetype_cursor=0,
    company_search_archetype_total=0,
    company_search_cumulative_json='{}'::jsonb,
    company_search_active_result_index=null,
    company_search_active_result_json=null,
    updated_at=now()
where status in ('QUEUED','FAILED') and coalesce(job_state,status) in ('QUEUED','FAILED_RETRYABLE');
