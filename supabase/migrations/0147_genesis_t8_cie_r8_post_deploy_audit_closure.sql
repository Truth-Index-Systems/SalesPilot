-- Genesis T8 CIE-R8 post-deploy audit closure.
-- Permanently tombstone pre-CIE opportunity authority RPCs so stale service-role
-- callers cannot restore legacy commercial mathematics after the CIE freeze.

create or replace function public.sync_opportunity_foundations(p_scheduler_run_id uuid)
returns table(created integer,updated integer,ranked integer,ready integer,"needsContact" integer)
language plpgsql security definer set search_path=public as $$
begin
  raise exception 'CIE_R8_AUTHORITY_VIOLATION:LEGACY_SYNC_OPPORTUNITY_FOUNDATIONS_ERADICATED';
end $$;
revoke all on function public.sync_opportunity_foundations(uuid) from public,anon,authenticated,service_role;

create or replace function public.score_opportunity_intelligence(p_scheduler_run_id uuid)
returns table(
  scored integer,
  reranked integer,
  recommended integer,
  review integer,
  "needsContact" integer,
  "needsEvidence" integer,
  "lowPriority" integer
)
language plpgsql security definer set search_path=public as $$
begin
  raise exception 'CIE_R8_AUTHORITY_VIOLATION:LEGACY_OPPORTUNITY_SCORING_RPC_ERADICATED';
end $$;
revoke all on function public.score_opportunity_intelligence(uuid) from public,anon,authenticated,service_role;

create or replace function public.apply_route_intelligence_opportunity_scoring(p_scheduler_run_id uuid)
returns integer language plpgsql security definer set search_path=public as $$
begin
  raise exception 'CIE_R8_AUTHORITY_VIOLATION:LEGACY_ROUTE_SCORING_RPC_ERADICATED';
end $$;
revoke all on function public.apply_route_intelligence_opportunity_scoring(uuid) from public,anon,authenticated,service_role;

create or replace function public.enforce_opportunity_route_readiness(p_scheduler_run_id uuid)
returns integer language plpgsql security definer set search_path=public as $$
begin
  raise exception 'CIE_R8_AUTHORITY_VIOLATION:LEGACY_ROUTE_READINESS_RPC_ERADICATED';
end $$;
revoke all on function public.enforce_opportunity_route_readiness(uuid) from public,anon,authenticated,service_role;
