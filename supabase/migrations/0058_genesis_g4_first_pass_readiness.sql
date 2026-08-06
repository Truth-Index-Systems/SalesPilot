-- Genesis G4: distinguish first-pass preparation from genuine retry work.
-- Initial QUEUED work is claimable from next_attempt_at only. Retry timing is
-- reserved exclusively for FAILED_RETRYABLE jobs after a real worker attempt.

-- Normalise any active first-pass rows that inherited a stale retry timestamp.
update public.discovery_sessions s
set job_state='QUEUED',
    status='QUEUED',
    stage='PREPARING',
    next_attempt_at=coalesce(s.next_attempt_at,now()),
    next_retry_at=null,
    last_error=null,
    last_error_code=null,
    last_error_message=null,
    updated_at=now()
from public.campaigns c
where c.id=s.campaign_id
  and c.status not in ('PAUSED','CANCELLED','ARCHIVED')
  and coalesce(s.attempt_count,0)=0
  and coalesce(s.expansion_pass_count,0)=0
  and coalesce(s.result_summary_json->>'expansionPending','false')<>'true'
  and (s.status='QUEUED' or s.job_state='QUEUED');

create or replace function public.claim_company_discovery(p_scheduler_run_id uuid)
returns table(session_id uuid,organisation_id uuid,campaign_id uuid)
language plpgsql security definer set search_path=public as $$
declare v_id uuid;
begin
  select s.id into v_id
  from public.discovery_sessions s
  join public.campaigns c on c.id=s.campaign_id
  join public.ai_governance_policies g
    on g.organisation_id=s.organisation_id and g.autonomy_enabled=true
  where c.status not in('PAUSED','CANCELLED','ARCHIVED')
    and s.attempt_count<5
    and (
      (s.status='QUEUED' and coalesce(s.next_attempt_at,now())<=now())
      or
      (s.status='FAILED' and s.job_state='FAILED_RETRYABLE' and coalesce(s.next_retry_at,now())<=now())
    )
  order by
    case when s.status='QUEUED' then 0 else 1 end,
    case when s.status='QUEUED' then coalesce(s.next_attempt_at,s.created_at)
         else coalesce(s.next_retry_at,s.created_at) end,
    s.created_at
  for update of s skip locked
  limit 1;

  if v_id is null then return; end if;

  update public.discovery_sessions
  set status='RUNNING',job_state='RUNNING',stage='SEARCHING',progress=10,
      attempt_count=attempt_count+1,claimed_at=now(),started_at=coalesce(started_at,now()),
      heartbeat_at=now(),last_heartbeat_at=now(),lease_expires_at=now()+interval '8 minutes',
      last_error=null,last_error_code=null,last_error_message=null,
      next_attempt_at=null,next_retry_at=null,scheduler_run_id=p_scheduler_run_id,updated_at=now()
  where id=v_id;

  return query
  select s.id,s.organisation_id,s.campaign_id
  from public.discovery_sessions s
  where s.id=v_id;
end $$;

revoke all on function public.claim_company_discovery(uuid) from public,anon,authenticated;
grant execute on function public.claim_company_discovery(uuid) to service_role;
