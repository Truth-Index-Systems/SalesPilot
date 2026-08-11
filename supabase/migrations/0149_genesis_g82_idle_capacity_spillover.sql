-- Genesis G8.2 — Idle Capacity Spillover
-- Keeps the system-organisation governance policy aligned with the configured
-- runtime budget without changing autonomy state, and lets the application
-- distinguish actual customer pressure from unused customer allocation.

create or replace function public.sync_genesis_g8_system_governance_limits(
  p_system_organisation_id uuid,
  p_daily_request_limit integer,
  p_daily_cost_limit_usd numeric
) returns public.ai_governance_policies
language plpgsql
security definer
set search_path=public
as $$
declare
  v_result public.ai_governance_policies%rowtype;
begin
  if p_system_organisation_id is null then
    raise exception 'GENESIS_G8_SYSTEM_ORGANISATION_REQUIRED';
  end if;

  perform public.ensure_ai_governance_policy(p_system_organisation_id);

  update public.ai_governance_policies
  set daily_request_limit = least(greatest(coalesce(p_daily_request_limit, 1), 1), 100000),
      daily_cost_limit_usd = least(greatest(coalesce(p_daily_cost_limit_usd, 0), 0), 100000),
      updated_at = now()
  where organisation_id = p_system_organisation_id
  returning * into v_result;

  return v_result;
end
$$;

revoke all on function public.sync_genesis_g8_system_governance_limits(uuid,integer,numeric)
  from public,anon,authenticated;
grant execute on function public.sync_genesis_g8_system_governance_limits(uuid,integer,numeric)
  to service_role;

comment on function public.sync_genesis_g8_system_governance_limits(uuid,integer,numeric) is
  'G8.2 system-only limit synchronisation. Updates request/cost ceilings only; autonomy state and customer priority remain unchanged.';
