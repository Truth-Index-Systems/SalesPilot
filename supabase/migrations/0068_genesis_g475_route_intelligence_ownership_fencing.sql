-- Genesis G4.7.5: Route Intelligence ownership fencing.
-- Prevents stale/previous workers from mutating a contact discovery session
-- that has been reclaimed by a newer scheduler run.

create or replace function public.assert_contact_discovery_owner(
  p_session_id uuid,
  p_scheduler_run_id uuid
) returns void
language plpgsql security definer set search_path=public as $$
declare s public.contact_discovery_sessions%rowtype;
begin
  select * into s from public.contact_discovery_sessions where id=p_session_id for update;
  if s.id is null then raise exception 'CONTACT_DISCOVERY_SESSION_MISSING'; end if;
  if s.scheduler_run_id is distinct from p_scheduler_run_id then
    raise exception 'CONTACT_DISCOVERY_OWNERSHIP_LOST';
  end if;
  if s.status<>'RUNNING' then raise exception 'CONTACT_DISCOVERY_SESSION_NOT_RUNNING'; end if;
end $$;

create or replace function public.update_contact_discovery_progress_owned(
  p_session_id uuid,
  p_scheduler_run_id uuid,
  p_stage text,
  p_progress integer,
  p_candidates integer default null
) returns void
language plpgsql security definer set search_path=public as $$
begin
  perform public.assert_contact_discovery_owner(p_session_id,p_scheduler_run_id);
  perform public.update_contact_discovery_progress(p_session_id,p_stage,p_progress,p_candidates);
end $$;

create or replace function public.save_route_intelligence_owned(
  p_session_id uuid,
  p_scheduler_run_id uuid,
  p_organisation_map jsonb,
  p_buying_paths jsonb,
  p_routes jsonb,
  p_research_summary text
) returns integer
language plpgsql security definer set search_path=public as $$
begin
  perform public.assert_contact_discovery_owner(p_session_id,p_scheduler_run_id);
  return public.save_route_intelligence(p_session_id,p_organisation_map,p_buying_paths,p_routes,p_research_summary);
end $$;

create or replace function public.save_company_contact_channels_owned(
  p_session_id uuid,
  p_scheduler_run_id uuid,
  p_channels jsonb
) returns integer
language plpgsql security definer set search_path=public as $$
begin
  perform public.assert_contact_discovery_owner(p_session_id,p_scheduler_run_id);
  return public.save_company_contact_channels(p_session_id,p_channels);
end $$;

create or replace function public.save_contact_discovery_batch_owned(
  p_session_id uuid,
  p_scheduler_run_id uuid,
  p_contacts jsonb,
  p_research_summary text,
  p_uncertainties jsonb default '[]'::jsonb,
  p_unresolved_roles jsonb default '[]'::jsonb
) returns integer
language plpgsql security definer set search_path=public as $$
begin
  perform public.assert_contact_discovery_owner(p_session_id,p_scheduler_run_id);
  return public.save_contact_discovery_batch(p_session_id,p_contacts,p_research_summary,p_uncertainties,p_unresolved_roles);
end $$;

create or replace function public.evaluate_contact_discovery_route_readiness_owned(
  p_session_id uuid,
  p_scheduler_run_id uuid,
  p_research_summary text default null,
  p_uncertainties jsonb default '[]'::jsonb,
  p_unresolved_roles jsonb default '[]'::jsonb
) returns table(action text,primary_ready boolean,fallback_ready boolean,route_count integer,expansion_pass integer)
language plpgsql security definer set search_path=public as $$
begin
  perform public.assert_contact_discovery_owner(p_session_id,p_scheduler_run_id);
  return query
    select * from public.evaluate_contact_discovery_route_readiness(
      p_session_id,p_research_summary,p_uncertainties,p_unresolved_roles
    );
end $$;

create or replace function public.complete_contact_discovery_without_matches_owned(
  p_session_id uuid,
  p_scheduler_run_id uuid,
  p_research_summary text,
  p_uncertainties jsonb default '[]'::jsonb,
  p_unresolved_roles jsonb default '[]'::jsonb
) returns integer
language plpgsql security definer set search_path=public as $$
begin
  perform public.assert_contact_discovery_owner(p_session_id,p_scheduler_run_id);
  return public.complete_contact_discovery_without_matches(p_session_id,p_research_summary,p_uncertainties,p_unresolved_roles);
end $$;

create or replace function public.finalize_contact_discovery_owned(
  p_session_id uuid,
  p_scheduler_run_id uuid,
  p_result_summary jsonb
) returns integer
language plpgsql security definer set search_path=public as $$
begin
  perform public.assert_contact_discovery_owner(p_session_id,p_scheduler_run_id);
  return public.finalize_contact_discovery(p_session_id,p_result_summary);
end $$;

create or replace function public.record_contact_discovery_failure_owned(
  p_session_id uuid,
  p_scheduler_run_id uuid,
  p_error_code text,
  p_error_message text,
  p_retryable boolean
) returns boolean
language plpgsql security definer set search_path=public as $$
declare s public.contact_discovery_sessions%rowtype;
begin
  select * into s from public.contact_discovery_sessions where id=p_session_id for update;
  if s.id is null then return false; end if;
  if s.status<>'RUNNING' or s.scheduler_run_id is distinct from p_scheduler_run_id then
    -- Stale workers are intentionally powerless.
    return false;
  end if;
  perform public.record_contact_discovery_failure(p_session_id,p_error_code,p_error_message,p_retryable);
  return true;
end $$;

revoke all on function public.assert_contact_discovery_owner(uuid,uuid) from public,anon,authenticated;
revoke all on function public.update_contact_discovery_progress_owned(uuid,uuid,text,integer,integer) from public,anon,authenticated;
revoke all on function public.save_route_intelligence_owned(uuid,uuid,jsonb,jsonb,jsonb,text) from public,anon,authenticated;
revoke all on function public.save_company_contact_channels_owned(uuid,uuid,jsonb) from public,anon,authenticated;
revoke all on function public.save_contact_discovery_batch_owned(uuid,uuid,jsonb,text,jsonb,jsonb) from public,anon,authenticated;
revoke all on function public.evaluate_contact_discovery_route_readiness_owned(uuid,uuid,text,jsonb,jsonb) from public,anon,authenticated;
revoke all on function public.complete_contact_discovery_without_matches_owned(uuid,uuid,text,jsonb,jsonb) from public,anon,authenticated;
revoke all on function public.finalize_contact_discovery_owned(uuid,uuid,jsonb) from public,anon,authenticated;
revoke all on function public.record_contact_discovery_failure_owned(uuid,uuid,text,text,boolean) from public,anon,authenticated;

grant execute on function public.assert_contact_discovery_owner(uuid,uuid) to service_role;
grant execute on function public.update_contact_discovery_progress_owned(uuid,uuid,text,integer,integer) to service_role;
grant execute on function public.save_route_intelligence_owned(uuid,uuid,jsonb,jsonb,jsonb,text) to service_role;
grant execute on function public.save_company_contact_channels_owned(uuid,uuid,jsonb) to service_role;
grant execute on function public.save_contact_discovery_batch_owned(uuid,uuid,jsonb,text,jsonb,jsonb) to service_role;
grant execute on function public.evaluate_contact_discovery_route_readiness_owned(uuid,uuid,text,jsonb,jsonb) to service_role;
grant execute on function public.complete_contact_discovery_without_matches_owned(uuid,uuid,text,jsonb,jsonb) to service_role;
grant execute on function public.finalize_contact_discovery_owned(uuid,uuid,jsonb) to service_role;
grant execute on function public.record_contact_discovery_failure_owned(uuid,uuid,text,text,boolean) to service_role;
