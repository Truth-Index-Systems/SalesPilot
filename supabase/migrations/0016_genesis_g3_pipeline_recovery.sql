-- Genesis G3 reliability patch: keep both autonomous queues moving.
-- Safe to apply after 0015 and safe to rerun.

-- Re-evaluate every active campaign on each pipeline tick. This removes the
-- dependency on a review-status trigger being the only way to request a top-up.
create or replace function public.ensure_active_company_review_queues()
returns integer
language plpgsql security definer set search_path=public as $$
declare
  r record;
  queued_count integer := 0;
begin
  for r in
    select organisation_id,id as campaign_id
    from public.campaigns
    where status not in ('PAUSED','ARCHIVED','CANCELLED')
  loop
    if public.ensure_company_review_queue(r.organisation_id,r.campaign_id) then
      queued_count := queued_count + 1;
    end if;
  end loop;
  return queued_count;
end $$;

-- Prefer untouched queued work over a stale RUNNING lease. A timed-out company
-- can therefore no longer monopolise the worker while other approved companies
-- are still waiting for their first contact search.
create or replace function public.claim_contact_discovery()
returns table(session_id uuid,organisation_id uuid,campaign_id uuid,company_id uuid)
language plpgsql security definer set search_path=public as $$
declare v_id uuid;
begin
  -- Convert expired leases into retryable failures first.
  update public.contact_discovery_sessions
  set status='FAILED',
      stage='PREPARING',
      progress=0,
      last_error=coalesce(last_error,'WORKER_LEASE_EXPIRED'),
      lease_expires_at=null,
      heartbeat_at=now(),
      next_attempt_at=now(),
      updated_at=now()
  where status='RUNNING'
    and lease_expires_at is not null
    and lease_expires_at < now()
    and attempt_count < 5;

  select s.id into v_id
  from public.contact_discovery_sessions s
  join public.companies c
    on c.id=s.company_id
   and c.campaign_id=s.campaign_id
   and c.organisation_id=s.organisation_id
  join public.campaigns ca
    on ca.id=s.campaign_id
   and ca.organisation_id=s.organisation_id
  where c.review_status='APPROVED'
    and ca.status not in ('PAUSED','ARCHIVED','CANCELLED')
    and s.status in ('QUEUED','FAILED')
    and coalesce(s.next_attempt_at,now())<=now()
    and s.attempt_count<5
  order by
    case when s.status='QUEUED' then 0 else 1 end,
    s.created_at asc
  for update of s skip locked
  limit 1;

  if v_id is null then return; end if;

  update public.contact_discovery_sessions set
    status='RUNNING',stage='PREPARING',progress=5,
    attempt_count=attempt_count+1,last_error=null,
    started_at=coalesce(started_at,now()),heartbeat_at=now(),
    lease_expires_at=now()+interval '5 minutes',
    next_attempt_at=null,updated_at=now()
  where id=v_id;

  return query
  select s.id,s.organisation_id,s.campaign_id,s.company_id
  from public.contact_discovery_sessions s
  where s.id=v_id;
end $$;

-- Keep the lease within the Vercel function window and make early retries fast.
create or replace function public.update_contact_discovery_progress(
  p_session_id uuid,p_stage text,p_progress integer,p_candidates integer default null
) returns void language plpgsql security definer set search_path=public as $$
begin
  if p_stage not in ('PREPARING','RESEARCHING','IDENTIFYING','VALIDATING','SAVING','COMPLETE') then
    raise exception 'invalid stage';
  end if;
  update public.contact_discovery_sessions set
    stage=p_stage,
    progress=greatest(progress,least(99,greatest(0,p_progress))),
    candidates_found=coalesce(p_candidates,candidates_found),
    heartbeat_at=now(),
    lease_expires_at=now()+interval '5 minutes',
    updated_at=now()
  where id=p_session_id and status='RUNNING';
  if not found then raise exception 'contact discovery session is not running'; end if;
end $$;

create or replace function public.fail_contact_discovery(p_session_id uuid,p_error text)
returns void language plpgsql security definer set search_path=public as $$
declare s public.contact_discovery_sessions%rowtype; v_delay interval;
begin
  select * into s from public.contact_discovery_sessions where id=p_session_id for update;
  if s.id is null then return; end if;
  v_delay:=case
    when s.attempt_count<=1 then interval '1 minute'
    when s.attempt_count=2 then interval '3 minutes'
    when s.attempt_count=3 then interval '10 minutes'
    else interval '30 minutes'
  end;
  update public.contact_discovery_sessions set
    status='FAILED',stage='PREPARING',progress=0,
    last_error=left(coalesce(p_error,'CONTACT_DISCOVERY_FAILED'),500),
    lease_expires_at=null,heartbeat_at=now(),
    next_attempt_at=case when attempt_count<5 then now()+v_delay else null end,
    updated_at=now()
  where id=p_session_id;
  insert into public.campaign_timeline(
    organisation_id,campaign_id,event_type,title,description,visibility,metadata_json
  ) values(
    s.organisation_id,s.campaign_id,'CONTACT_DISCOVERY_RETRY',
    'Contact research will retry',
    'SalesPilot held back uncertain contact results and will safely continue with the remaining approved companies.',
    'CUSTOMER',jsonb_build_object('companyId',s.company_id,'sessionId',s.id,'attemptCount',s.attempt_count)
  );
end $$;

revoke all on function public.ensure_active_company_review_queues() from public,anon,authenticated;
revoke all on function public.claim_contact_discovery() from public,anon,authenticated;
revoke all on function public.update_contact_discovery_progress(uuid,text,integer,integer) from public,anon,authenticated;
revoke all on function public.fail_contact_discovery(uuid,text) from public,anon,authenticated;
grant execute on function public.ensure_active_company_review_queues() to service_role;
grant execute on function public.claim_contact_discovery() to service_role;
grant execute on function public.update_contact_discovery_progress(uuid,text,integer,integer) to service_role;
grant execute on function public.fail_contact_discovery(uuid,text) to service_role;

-- Recover currently stranded work immediately when this migration is applied.
update public.contact_discovery_sessions
set status='FAILED',stage='PREPARING',progress=0,
    last_error=coalesce(last_error,'RECOVERED_BY_G3_PIPELINE_PATCH'),
    lease_expires_at=null,next_attempt_at=now(),updated_at=now()
where status='RUNNING'
  and (lease_expires_at is null or lease_expires_at < now());

select public.ensure_active_company_review_queues();
