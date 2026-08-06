-- Genesis G4 route claim ambiguity hotfix
-- Qualifies contact_discovery_sessions columns that collide with RETURNS TABLE output variables.

drop function if exists public.claim_contact_discovery(uuid,uuid,boolean);
create or replace function public.claim_contact_discovery(
  p_scheduler_run_id uuid,
  p_campaign_id uuid default null,
  p_fresh_only boolean default false
)
returns table(session_id uuid,organisation_id uuid,campaign_id uuid,company_id uuid,route_expansion_pass integer)
language plpgsql security definer set search_path=public as $$
declare v_id uuid;
begin
  select s.id into v_id
  from public.contact_discovery_sessions s
  join public.companies c on c.id=s.company_id and c.review_status='APPROVED'
  join public.campaigns ca on ca.id=s.campaign_id and ca.status not in('PAUSED','CANCELLED','ARCHIVED','FAILED')
  join public.ai_governance_policies g on g.organisation_id=s.organisation_id and g.autonomy_enabled=true
  where s.attempt_count<8
    and coalesce(s.route_expansion_pass,0)<4
    and (p_campaign_id is null or s.campaign_id=p_campaign_id)
    and (
      (s.status='QUEUED' and coalesce(s.next_attempt_at,s.next_retry_at,now())<=now()
        and (not p_fresh_only or (coalesce(s.job_state,'QUEUED')='QUEUED' and s.attempt_count=0)))
      or
      (not p_fresh_only and s.status='FAILED' and s.job_state='FAILED_RETRYABLE'
        and coalesce(s.next_retry_at,s.next_attempt_at,now())<=now())
    )
  order by case when s.stage='EXPANDING' then 0 when s.status='QUEUED' then 1 else 2 end,
    coalesce(s.next_retry_at,s.next_attempt_at,s.created_at),s.created_at
  for update of s skip locked limit 1;

  if v_id is null then return; end if;

  update public.contact_discovery_sessions as target set
    status='RUNNING',
    job_state='RUNNING',
    stage=case when target.route_expansion_pass>0 then 'EXPANDING' else 'PREPARING' end,
    progress=5,
    attempt_count=target.attempt_count+1,
    claimed_at=now(),
    started_at=coalesce(target.started_at,now()),
    heartbeat_at=now(),
    last_heartbeat_at=now(),
    lease_expires_at=now()+interval '8 minutes',
    last_error=null,
    last_error_code=null,
    last_error_message=null,
    next_attempt_at=null,
    next_retry_at=null,
    scheduler_run_id=p_scheduler_run_id,
    updated_at=now()
  where target.id=v_id;

  return query
    select s.id,s.organisation_id,s.campaign_id,s.company_id,s.route_expansion_pass
    from public.contact_discovery_sessions s
    where s.id=v_id;
end $$;

revoke all on function public.claim_contact_discovery(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.claim_contact_discovery(uuid,uuid,boolean) to service_role;
