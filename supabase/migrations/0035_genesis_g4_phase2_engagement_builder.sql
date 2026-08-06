-- Genesis G4 Phase 2: scheduler-owned Engagement Builder.
-- Formalises autonomous approved-opportunity discovery as one auditable builder
-- execution per scheduler run. No AI generation, drafting, sending or scheduling
-- windows are introduced in this phase.

create table if not exists public.engagement_builder_runs (
  id uuid primary key default gen_random_uuid(),
  scheduler_run_id uuid not null references public.pipeline_scheduler_runs(id) on delete cascade,
  status text not null default 'RUNNING'
    check (status in ('RUNNING','COMPLETED','FAILED')),
  created_count integer not null default 0 check (created_count >= 0),
  updated_count integer not null default 0 check (updated_count >= 0),
  cancelled_count integer not null default 0 check (cancelled_count >= 0),
  ready_for_draft_count integer not null default 0 check (ready_for_draft_count >= 0),
  needs_route_count integer not null default 0 check (needs_route_count >= 0),
  error_code text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (scheduler_run_id)
);

create index if not exists engagement_builder_runs_started_idx
  on public.engagement_builder_runs(started_at desc);

alter table public.engagement_builder_runs enable row level security;

-- Builder execution details are internal diagnostics. Customer-facing state is
-- exposed through opportunity_engagements, history and campaign timeline only.
revoke all on table public.engagement_builder_runs from public,anon,authenticated;
grant select,insert,update on table public.engagement_builder_runs to service_role;

create or replace function public.run_engagement_builder(p_scheduler_run_id uuid)
returns table(
  "builderRunId" uuid,
  "schedulerRunId" uuid,
  status text,
  created integer,
  updated integer,
  cancelled integer,
  "readyForDraft" integer,
  "needsRoute" integer,
  "startedAt" timestamptz,
  "completedAt" timestamptz
)
language plpgsql
security definer
set search_path=public
as $$
declare
  v_run public.engagement_builder_runs%rowtype;
  v_summary record;
begin
  if not exists (
    select 1 from public.pipeline_scheduler_runs where id=p_scheduler_run_id
  ) then
    raise exception 'scheduler run required';
  end if;

  -- Transaction-scoped lock prevents duplicate builder ownership even if the
  -- scheduler endpoint is invoked concurrently for the same run.
  perform pg_advisory_xact_lock(hashtextextended('engagement-builder:' || p_scheduler_run_id::text, 0));

  select * into v_run
  from public.engagement_builder_runs
  where scheduler_run_id=p_scheduler_run_id
  for update;

  if v_run.id is not null and v_run.status='COMPLETED' then
    return query select
      v_run.id,v_run.scheduler_run_id,v_run.status,
      v_run.created_count,v_run.updated_count,v_run.cancelled_count,
      v_run.ready_for_draft_count,v_run.needs_route_count,
      v_run.started_at,v_run.completed_at;
    return;
  end if;

  if v_run.id is null then
    insert into public.engagement_builder_runs(scheduler_run_id,status)
    values(p_scheduler_run_id,'RUNNING')
    returning * into v_run;
  else
    update public.engagement_builder_runs
    set status='RUNNING',error_code=null,completed_at=null
    where id=v_run.id
    returning * into v_run;
  end if;

  begin
    select * into v_summary
    from public.sync_opportunity_engagement_bridge(p_scheduler_run_id);

    update public.engagement_builder_runs set
      status='COMPLETED',
      created_count=coalesce(v_summary.created,0),
      updated_count=coalesce(v_summary.updated,0),
      cancelled_count=coalesce(v_summary.cancelled,0),
      ready_for_draft_count=coalesce(v_summary."readyForDraft",0),
      needs_route_count=coalesce(v_summary."needsRoute",0),
      completed_at=now()
    where id=v_run.id
    returning * into v_run;
  exception when others then
    update public.engagement_builder_runs set
      status='FAILED',
      error_code=left(sqlstate || ':' || sqlerrm,500),
      completed_at=now()
    where id=v_run.id
    returning * into v_run;

    return query select
      v_run.id,v_run.scheduler_run_id,v_run.status,
      v_run.created_count,v_run.updated_count,v_run.cancelled_count,
      v_run.ready_for_draft_count,v_run.needs_route_count,
      v_run.started_at,v_run.completed_at;
    return;
  end;

  return query select
    v_run.id,v_run.scheduler_run_id,v_run.status,
    v_run.created_count,v_run.updated_count,v_run.cancelled_count,
    v_run.ready_for_draft_count,v_run.needs_route_count,
    v_run.started_at,v_run.completed_at;
end $$;

revoke all on function public.run_engagement_builder(uuid) from public,anon,authenticated;
grant execute on function public.run_engagement_builder(uuid) to service_role;

comment on function public.run_engagement_builder(uuid) is
  'Scheduler-owned, retry-safe G4 Engagement Builder. Uses the frozen Opportunity-to-Engagement bridge and performs no AI generation or sending.';
