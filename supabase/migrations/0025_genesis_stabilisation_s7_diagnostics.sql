-- Genesis Stabilisation S7: internal scheduler and worker diagnostics.
-- Adds read-oriented operational telemetry without changing orchestration behaviour.

create table if not exists public.pipeline_diagnostic_events (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid references public.organisations(id) on delete cascade,
  campaign_id uuid references public.campaigns(id) on delete cascade,
  scheduler_run_id uuid references public.pipeline_scheduler_runs(id) on delete set null,
  job_type text not null check (job_type in ('SCHEDULER','COMPANY_DISCOVERY','CONTACT_DISCOVERY','BUSINESS_ANALYSIS')),
  job_id uuid,
  event_type text not null,
  previous_state text,
  next_state text,
  reason_code text,
  message text,
  metadata_json jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create index if not exists pipeline_diagnostic_events_org_idx
  on public.pipeline_diagnostic_events(organisation_id,occurred_at desc);
create index if not exists pipeline_diagnostic_events_run_idx
  on public.pipeline_diagnostic_events(scheduler_run_id,occurred_at desc);
create index if not exists pipeline_diagnostic_events_job_idx
  on public.pipeline_diagnostic_events(job_type,job_id,occurred_at desc);

alter table public.pipeline_diagnostic_events enable row level security;
drop policy if exists pipeline_diagnostic_events_member_read on public.pipeline_diagnostic_events;
create policy pipeline_diagnostic_events_member_read on public.pipeline_diagnostic_events
for select to authenticated using (
  organisation_id is not null and public.is_active_org_member(organisation_id)
);

create or replace view public.pipeline_job_diagnostics with (security_invoker=true) as
select
  'COMPANY_DISCOVERY'::text as job_type,
  s.id as job_id,
  s.organisation_id,
  s.campaign_id,
  null::uuid as company_id,
  c.name as campaign_name,
  null::text as company_name,
  s.job_state,
  s.status as legacy_status,
  s.stage,
  s.progress,
  s.attempt_count,
  s.claimed_at,
  s.last_heartbeat_at,
  s.lease_expires_at,
  s.next_retry_at,
  s.last_error_code,
  s.last_error_message,
  s.scheduler_run_id,
  s.result_summary_json,
  s.created_at,
  s.updated_at
from public.discovery_sessions s
join public.campaigns c on c.id=s.campaign_id
union all
select
  'CONTACT_DISCOVERY'::text,
  s.id,
  s.organisation_id,
  s.campaign_id,
  s.company_id,
  c.name,
  co.company_name,
  s.job_state,
  s.status,
  s.stage,
  s.progress,
  s.attempt_count,
  s.claimed_at,
  s.last_heartbeat_at,
  s.lease_expires_at,
  s.next_retry_at,
  s.last_error_code,
  s.last_error_message,
  s.scheduler_run_id,
  s.result_summary_json,
  s.created_at,
  s.updated_at
from public.contact_discovery_sessions s
join public.campaigns c on c.id=s.campaign_id
join public.companies co on co.id=s.company_id;

create or replace view public.pipeline_scheduler_health with (security_invoker=true) as
select
  l.run_id,
  l.owner,
  l.acquired_at,
  l.lease_expires_at,
  l.updated_at,
  case
    when l.run_id is null then 'IDLE'
    when l.lease_expires_at is not null and l.lease_expires_at <= now() then 'LEASE_EXPIRED'
    else 'RUNNING'
  end as engine_state,
  r.status as latest_run_status,
  r.started_at as latest_run_started_at,
  r.completed_at as latest_run_completed_at,
  r.recovered_jobs,
  r.preparation_json,
  r.outcome_json,
  r.last_error
from public.pipeline_scheduler_lease l
left join public.pipeline_scheduler_runs r on r.id=l.run_id
where l.singleton=true;

create or replace function public.record_pipeline_diagnostic_event(
  p_job_type text,
  p_event_type text,
  p_organisation_id uuid default null,
  p_campaign_id uuid default null,
  p_scheduler_run_id uuid default null,
  p_job_id uuid default null,
  p_previous_state text default null,
  p_next_state text default null,
  p_reason_code text default null,
  p_message text default null,
  p_metadata jsonb default '{}'::jsonb
) returns uuid
language plpgsql security definer set search_path=public as $$
declare v_id uuid:=gen_random_uuid();
begin
  insert into public.pipeline_diagnostic_events(
    id,organisation_id,campaign_id,scheduler_run_id,job_type,job_id,event_type,
    previous_state,next_state,reason_code,message,metadata_json
  ) values(
    v_id,p_organisation_id,p_campaign_id,p_scheduler_run_id,p_job_type,p_job_id,p_event_type,
    p_previous_state,p_next_state,p_reason_code,left(p_message,1000),coalesce(p_metadata,'{}'::jsonb)
  );
  return v_id;
end $$;

revoke all on function public.record_pipeline_diagnostic_event(text,text,uuid,uuid,uuid,uuid,text,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.record_pipeline_diagnostic_event(text,text,uuid,uuid,uuid,uuid,text,text,text,text,jsonb) to service_role;
