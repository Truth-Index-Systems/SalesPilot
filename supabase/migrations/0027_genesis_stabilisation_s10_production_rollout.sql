-- Genesis Stabilisation S10: production repair, controlled observation and G3 freeze gate.
-- Preserves customer data and does not create a second orchestration path.

create table if not exists public.pipeline_repair_runs (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  requested_by uuid,
  dry_run boolean not null default true,
  status text not null default 'RUNNING' check (status in ('RUNNING','COMPLETED','FAILED')),
  summary_json jsonb not null default '{}'::jsonb,
  error_message text,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.pipeline_release_observations (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  status text not null default 'DRAFT' check (status in ('DRAFT','OBSERVING','PASSED','FAILED','FROZEN')),
  observation_hours integer not null default 24 check (observation_hours between 1 and 168),
  started_at timestamptz,
  observation_ends_at timestamptz,
  completed_at timestamptz,
  frozen_at timestamptz,
  started_by uuid,
  completed_by uuid,
  checklist_json jsonb not null default '{}'::jsonb,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id)
);

alter table public.pipeline_repair_runs enable row level security;
alter table public.pipeline_release_observations enable row level security;

drop policy if exists pipeline_repair_runs_member_read on public.pipeline_repair_runs;
create policy pipeline_repair_runs_member_read on public.pipeline_repair_runs
for select to authenticated using (public.is_active_org_member(organisation_id));

drop policy if exists pipeline_release_observations_member_read on public.pipeline_release_observations;
create policy pipeline_release_observations_member_read on public.pipeline_release_observations
for select to authenticated using (public.is_active_org_member(organisation_id));

create or replace function public.repair_pipeline_state(
  p_organisation_id uuid,
  p_requested_by uuid,
  p_dry_run boolean default true
) returns jsonb
language plpgsql security definer set search_path=public as $$
declare
  v_run_id uuid:=gen_random_uuid();
  v_expired_company integer:=0;
  v_expired_contact integer:=0;
  v_false_company_progress integer:=0;
  v_false_contact_progress integer:=0;
  v_invalid_contact_jobs integer:=0;
  v_duplicate_timeline integer:=0;
  v_summary jsonb;
begin
  insert into public.pipeline_repair_runs(id,organisation_id,requested_by,dry_run)
  values(v_run_id,p_organisation_id,p_requested_by,p_dry_run);

  select count(*) into v_expired_company from public.discovery_sessions
  where organisation_id=p_organisation_id and job_state='RUNNING'
    and (lease_expires_at is null or lease_expires_at<=now());
  select count(*) into v_expired_contact from public.contact_discovery_sessions
  where organisation_id=p_organisation_id and job_state='RUNNING'
    and (lease_expires_at is null or lease_expires_at<=now());
  select count(*) into v_false_company_progress from public.discovery_sessions
  where organisation_id=p_organisation_id and job_state<>'RUNNING' and progress<>0 and job_state not in ('COMPLETED','NO_RESULTS');
  select count(*) into v_false_contact_progress from public.contact_discovery_sessions
  where organisation_id=p_organisation_id and job_state<>'RUNNING' and progress<>0 and job_state not in ('COMPLETED','NO_RESULTS');
  select count(*) into v_invalid_contact_jobs
  from public.contact_discovery_sessions s join public.companies c on c.id=s.company_id
  where s.organisation_id=p_organisation_id and c.review_status<>'APPROVED'
    and s.job_state in ('QUEUED','FAILED_RETRYABLE');

  with ranked as (
    select id,row_number() over(
      partition by organisation_id,campaign_id,event_type,coalesce(metadata_json->>'cycleNumber','')
      order by occurred_at nulls last,created_at nulls last,id
    ) rn
    from public.campaign_timeline
    where organisation_id=p_organisation_id
      and event_type in ('COMPANY_DISCOVERY_TOP_UP_QUEUED','CONTACT_DISCOVERY_QUEUED','CAMPAIGN_CONTACTS_READY')
  ) select count(*) into v_duplicate_timeline from ranked where rn>1;

  if not p_dry_run then
    update public.discovery_sessions set status='FAILED',job_state='FAILED_RETRYABLE',stage='PREPARING',progress=0,
      last_error='WORKER_LEASE_EXPIRED',last_error_code='WORKER_LEASE_EXPIRED',
      last_error_message='Recovered by the S10 production repair.',next_retry_at=now(),next_attempt_at=now(),
      lease_expires_at=null,updated_at=now()
    where organisation_id=p_organisation_id and job_state='RUNNING'
      and (lease_expires_at is null or lease_expires_at<=now());

    update public.contact_discovery_sessions set status='FAILED',job_state='FAILED_RETRYABLE',stage='PREPARING',progress=0,
      result_status='FAILED',last_error='WORKER_LEASE_EXPIRED',last_error_code='WORKER_LEASE_EXPIRED',
      last_error_message='Recovered by the S10 production repair.',next_retry_at=now(),next_attempt_at=now(),
      lease_expires_at=null,updated_at=now()
    where organisation_id=p_organisation_id and job_state='RUNNING'
      and (lease_expires_at is null or lease_expires_at<=now());

    update public.discovery_sessions set progress=0,updated_at=now()
    where organisation_id=p_organisation_id and job_state<>'RUNNING' and progress<>0 and job_state not in ('COMPLETED','NO_RESULTS');
    update public.contact_discovery_sessions set progress=0,updated_at=now()
    where organisation_id=p_organisation_id and job_state<>'RUNNING' and progress<>0 and job_state not in ('COMPLETED','NO_RESULTS');

    update public.contact_discovery_sessions s set status='CANCELLED',job_state='CANCELLED',stage='COMPLETE',progress=0,
      last_error='COMPANY_NOT_APPROVED',last_error_code='COMPANY_NOT_APPROVED',
      last_error_message='Cancelled because the company is no longer approved.',next_retry_at=null,next_attempt_at=null,
      lease_expires_at=null,completed_at=now(),updated_at=now()
    from public.companies c where c.id=s.company_id and s.organisation_id=p_organisation_id
      and c.review_status<>'APPROVED' and s.job_state in ('QUEUED','FAILED_RETRYABLE');

    with ranked as (
      select id,row_number() over(
        partition by organisation_id,campaign_id,event_type,coalesce(metadata_json->>'cycleNumber','')
        order by occurred_at nulls last,created_at nulls last,id
      ) rn
      from public.campaign_timeline
      where organisation_id=p_organisation_id
        and event_type in ('COMPANY_DISCOVERY_TOP_UP_QUEUED','CONTACT_DISCOVERY_QUEUED','CAMPAIGN_CONTACTS_READY')
    ) delete from public.campaign_timeline t using ranked r where t.id=r.id and r.rn>1;

    update public.pipeline_scheduler_lease set run_id=null,owner=null,acquired_at=null,lease_expires_at=null,updated_at=now()
    where singleton=true and lease_expires_at is not null and lease_expires_at<=now();
  end if;

  v_summary:=jsonb_build_object(
    'repairRunId',v_run_id,'dryRun',p_dry_run,
    'expiredCompanyLeases',v_expired_company,'expiredContactLeases',v_expired_contact,
    'falseCompanyProgress',v_false_company_progress,'falseContactProgress',v_false_contact_progress,
    'invalidContactJobs',v_invalid_contact_jobs,'duplicateTimelineEvents',v_duplicate_timeline
  );
  update public.pipeline_repair_runs set status='COMPLETED',summary_json=v_summary,completed_at=now() where id=v_run_id;
  return v_summary;
exception when others then
  update public.pipeline_repair_runs set status='FAILED',error_message=sqlerrm,completed_at=now() where id=v_run_id;
  raise;
end $$;

create or replace function public.start_pipeline_observation(
  p_organisation_id uuid,p_started_by uuid,p_hours integer default 24
) returns public.pipeline_release_observations
language plpgsql security definer set search_path=public as $$
declare v_row public.pipeline_release_observations%rowtype;
begin
  insert into public.pipeline_release_observations(
    organisation_id,status,observation_hours,started_at,observation_ends_at,started_by,completed_at,frozen_at,notes,updated_at
  ) values(p_organisation_id,'OBSERVING',greatest(1,least(p_hours,168)),now(),now()+make_interval(hours=>greatest(1,least(p_hours,168))),p_started_by,null,null,null,now())
  on conflict(organisation_id) do update set status='OBSERVING',observation_hours=excluded.observation_hours,
    started_at=excluded.started_at,observation_ends_at=excluded.observation_ends_at,started_by=excluded.started_by,
    completed_at=null,frozen_at=null,notes=null,updated_at=now()
  returning * into v_row;
  return v_row;
end $$;

create or replace function public.complete_pipeline_observation(
  p_organisation_id uuid,p_completed_by uuid,p_passed boolean,p_freeze boolean default false,p_notes text default null
) returns public.pipeline_release_observations
language plpgsql security definer set search_path=public as $$
declare v_row public.pipeline_release_observations%rowtype; v_failures integer; v_expired integer;
begin
  select * into v_row from public.pipeline_release_observations where organisation_id=p_organisation_id for update;
  if v_row.id is null then raise exception 'OBSERVATION_NOT_STARTED'; end if;
  if p_passed and v_row.observation_ends_at is not null and now()<v_row.observation_ends_at then
    raise exception 'OBSERVATION_WINDOW_NOT_COMPLETE';
  end if;

  select count(*) into v_failures from public.pipeline_job_diagnostics
    where organisation_id=p_organisation_id and job_state='FAILED_TERMINAL';
  select count(*) into v_expired from public.pipeline_job_diagnostics
    where organisation_id=p_organisation_id and job_state='RUNNING' and (lease_expires_at is null or lease_expires_at<=now());
  if p_passed and (v_failures>0 or v_expired>0) then raise exception 'PIPELINE_NOT_READY_TO_PASS'; end if;
  update public.pipeline_release_observations set
    status=case when p_passed and p_freeze then 'FROZEN' when p_passed then 'PASSED' else 'FAILED' end,
    completed_at=now(),frozen_at=case when p_passed and p_freeze then now() else null end,
    completed_by=p_completed_by,notes=left(p_notes,2000),
    checklist_json=jsonb_build_object('terminalFailures',v_failures,'expiredLeases',v_expired,'completedAt',now()),updated_at=now()
  where organisation_id=p_organisation_id returning * into v_row;
  return v_row;
end $$;

create or replace view public.pipeline_release_readiness with (security_invoker=true) as
select o.id organisation_id,
  coalesce(obs.status,'DRAFT') release_status,obs.started_at,obs.observation_ends_at,obs.completed_at,obs.frozen_at,obs.notes,
  count(j.job_id) filter(where j.job_state='RUNNING' and (j.lease_expires_at is null or j.lease_expires_at<=now())) expired_leases,
  count(j.job_id) filter(where j.job_state='FAILED_TERMINAL') terminal_failures,
  count(j.job_id) filter(where j.job_state='FAILED_RETRYABLE' and j.next_retry_at<=now()) overdue_retries,
  count(j.job_id) filter(where j.job_state in('QUEUED','RUNNING','FAILED_RETRYABLE')) active_jobs,
  max(j.updated_at) last_job_activity
from public.organisations o
left join public.pipeline_release_observations obs on obs.organisation_id=o.id
left join public.pipeline_job_diagnostics j on j.organisation_id=o.id
group by o.id,obs.status,obs.started_at,obs.observation_ends_at,obs.completed_at,obs.frozen_at,obs.notes;

revoke all on function public.repair_pipeline_state(uuid,uuid,boolean),public.start_pipeline_observation(uuid,uuid,integer),public.complete_pipeline_observation(uuid,uuid,boolean,boolean,text) from public,anon,authenticated;
grant execute on function public.repair_pipeline_state(uuid,uuid,boolean),public.start_pipeline_observation(uuid,uuid,integer),public.complete_pipeline_observation(uuid,uuid,boolean,boolean,text) to service_role;
