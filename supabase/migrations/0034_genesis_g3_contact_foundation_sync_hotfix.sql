-- Genesis G3.1 hotfix: explicit scheduler-owned Contact Foundation Sync.
--
-- Approved companies could previously remain without a contact discovery session
-- because session creation was nested inside prepare_pipeline_work(), whose
-- campaign loop only inspected PREPARING and READY campaigns. This RPC makes
-- the Company -> Buyer Intelligence hand-off explicit, idempotent and safe for
-- every live campaign state without reintroducing trigger-owned orchestration.

create or replace function public.sync_contact_discovery_foundations(
  p_scheduler_run_id uuid
) returns table(
  "companiesInspected" integer,
  "sessionsCreated" integer,
  "sessionsRequeued" integer,
  "sessionsCancelled" integer
)
language plpgsql
security definer
set search_path=public
as $$
declare
  v_companies_inspected integer := 0;
  v_sessions_created integer := 0;
  v_sessions_requeued integer := 0;
  v_sessions_cancelled integer := 0;
  v_count integer := 0;
begin
  if not exists(
    select 1
    from public.pipeline_scheduler_lease
    where singleton=true
      and run_id=p_scheduler_run_id
      and lease_expires_at>now()
  ) then
    raise exception 'PIPELINE_SCHEDULER_LEASE_NOT_HELD';
  end if;

  select count(*) into v_companies_inspected
  from public.companies co
  join public.campaigns ca
    on ca.id=co.campaign_id
   and ca.organisation_id=co.organisation_id
  where co.review_status='APPROVED'
    and ca.status not in ('PAUSED','FAILED','ARCHIVED');

  -- Create exactly one foundation session for every approved company attached
  -- to a live campaign. The existing tenant/campaign/company unique constraint
  -- is the final concurrency guard.
  insert into public.contact_discovery_sessions(
    organisation_id,
    campaign_id,
    company_id,
    status,
    job_state,
    stage,
    progress,
    next_attempt_at,
    next_retry_at,
    scheduler_run_id,
    updated_at
  )
  select
    co.organisation_id,
    co.campaign_id,
    co.id,
    'QUEUED',
    'QUEUED',
    'PREPARING',
    0,
    now(),
    now(),
    p_scheduler_run_id,
    now()
  from public.companies co
  join public.campaigns ca
    on ca.id=co.campaign_id
   and ca.organisation_id=co.organisation_id
  where co.review_status='APPROVED'
    and ca.status not in ('PAUSED','FAILED','ARCHIVED')
    and not exists(
      select 1
      from public.contact_discovery_sessions cs
      where cs.organisation_id=co.organisation_id
        and cs.campaign_id=co.campaign_id
        and cs.company_id=co.id
    )
  on conflict (organisation_id,campaign_id,company_id) do nothing;
  get diagnostics v_sessions_created=row_count;

  -- Re-approval must not leave a previously cancelled, never-completed
  -- foundation permanently dead. Existing contacts are preserved and prevent
  -- unnecessary rediscovery.
  update public.contact_discovery_sessions cs
  set status='QUEUED',
      job_state='QUEUED',
      stage='PREPARING',
      progress=0,
      result_status=null,
      last_error=null,
      last_error_code=null,
      last_error_message=null,
      next_attempt_at=now(),
      next_retry_at=now(),
      lease_expires_at=null,
      claimed_at=null,
      scheduler_run_id=p_scheduler_run_id,
      updated_at=now()
  from public.companies co
  join public.campaigns ca
    on ca.id=co.campaign_id
   and ca.organisation_id=co.organisation_id
  where cs.organisation_id=co.organisation_id
    and cs.campaign_id=co.campaign_id
    and cs.company_id=co.id
    and co.review_status='APPROVED'
    and ca.status not in ('PAUSED','FAILED','ARCHIVED')
    and (cs.status='CANCELLED' or cs.job_state='CANCELLED')
    and not exists(
      select 1 from public.contacts c
      where c.organisation_id=cs.organisation_id
        and c.campaign_id=cs.campaign_id
        and c.company_id=cs.company_id
    );
  get diagnostics v_sessions_requeued=row_count;

  -- Preserve the frozen rule that rejected companies cannot retain unclaimed
  -- Buyer Intelligence work. Running work is left to the lease/recovery path.
  update public.contact_discovery_sessions cs
  set status='CANCELLED',
      job_state='CANCELLED',
      stage='PREPARING',
      progress=0,
      result_status='CANCELLED',
      next_attempt_at=null,
      next_retry_at=null,
      lease_expires_at=null,
      last_error='COMPANY_NO_LONGER_APPROVED',
      last_error_code='COMPANY_NO_LONGER_APPROVED',
      last_error_message='The company is no longer approved for buyer research.',
      scheduler_run_id=p_scheduler_run_id,
      updated_at=now()
  where coalesce(cs.job_state,cs.status) in ('QUEUED','FAILED_RETRYABLE')
    and not exists(
      select 1
      from public.companies co
      join public.campaigns ca
        on ca.id=co.campaign_id
       and ca.organisation_id=co.organisation_id
      where co.id=cs.company_id
        and co.organisation_id=cs.organisation_id
        and co.campaign_id=cs.campaign_id
        and co.review_status='APPROVED'
        and ca.status not in ('PAUSED','FAILED','ARCHIVED')
    );
  get diagnostics v_sessions_cancelled=row_count;

  return query select
    v_companies_inspected,
    v_sessions_created,
    v_sessions_requeued,
    v_sessions_cancelled;
end;
$$;

revoke all on function public.sync_contact_discovery_foundations(uuid)
  from public,anon,authenticated;
grant execute on function public.sync_contact_discovery_foundations(uuid)
  to service_role;
