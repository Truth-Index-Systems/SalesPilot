-- SalesPilot Genesis G5 — Release 1: Canonical Engagement State Machine
-- G4 is immutable. This migration introduces the G5 execution authority without
-- modifying opportunities, route intelligence, scoring, discovery, or the frozen
-- opportunity_engagements bridge.

create table if not exists public.engagement_strategies (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  source_engagement_id uuid references public.opportunity_engagements(id) on delete set null,
  state text not null default 'WAITING'
    check (state in (
      'WAITING','REASONING','STRATEGY_READY','GENERATING','SELF_REVIEW',
      'READY_FOR_APPROVAL','APPROVED','QUEUED','SENT',
      'FAILED_RETRYABLE','FAILED_TERMINAL'
    )),
  previous_state text,
  failure_stage text,
  failure_reason text,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  generation integer not null default 1 check (generation > 0),
  scheduler_run_id uuid references public.pipeline_scheduler_runs(id) on delete set null,
  lease_token uuid,
  claimed_at timestamptz,
  lease_expires_at timestamptz,
  next_retry_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (organisation_id, campaign_id, opportunity_id)
);

create table if not exists public.engagement_strategy_events (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  strategy_id uuid not null references public.engagement_strategies(id) on delete cascade,
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  scheduler_run_id uuid references public.pipeline_scheduler_runs(id) on delete set null,
  event_type text not null check (event_type in ('CREATED','CLAIMED','TRANSITIONED','RETRY_SCHEDULED','FAILED_TERMINAL','LEASE_RELEASED')),
  previous_state text,
  next_state text,
  lease_token uuid,
  metadata_json jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create index if not exists engagement_strategies_claim_idx
  on public.engagement_strategies(state,next_retry_at,lease_expires_at,created_at);
create index if not exists engagement_strategies_campaign_idx
  on public.engagement_strategies(organisation_id,campaign_id,state,updated_at desc);
create index if not exists engagement_strategy_events_strategy_idx
  on public.engagement_strategy_events(organisation_id,strategy_id,occurred_at desc);

alter table public.engagement_strategies enable row level security;
alter table public.engagement_strategy_events enable row level security;

drop policy if exists engagement_strategies_member_read on public.engagement_strategies;
create policy engagement_strategies_member_read on public.engagement_strategies
for select to authenticated using (public.is_active_org_member(organisation_id));

drop policy if exists engagement_strategy_events_member_read on public.engagement_strategy_events;
create policy engagement_strategy_events_member_read on public.engagement_strategy_events
for select to authenticated using (public.is_active_org_member(organisation_id));

revoke all on table public.engagement_strategies, public.engagement_strategy_events from public,anon,authenticated;
grant select on table public.engagement_strategies, public.engagement_strategy_events to authenticated;
grant select,insert,update on table public.engagement_strategies, public.engagement_strategy_events to service_role;

create or replace function public.seed_g5_engagement_strategies(p_scheduler_run_id uuid)
returns integer
language plpgsql security definer set search_path=public as $$
declare v_count integer:=0;
begin
  perform public.assert_active_pipeline_scheduler_run(p_scheduler_run_id);

  insert into public.engagement_strategies(
    organisation_id,campaign_id,opportunity_id,source_engagement_id,state,scheduler_run_id
  )
  select o.organisation_id,o.campaign_id,o.id,e.id,'WAITING',null
  from public.opportunities o
  join public.campaigns c on c.id=o.campaign_id and c.organisation_id=o.organisation_id
  left join public.opportunity_engagements e
    on e.organisation_id=o.organisation_id and e.campaign_id=o.campaign_id and e.opportunity_id=o.id
  where o.status='APPROVED'
    and c.status not in ('PAUSED','ARCHIVED')
  on conflict (organisation_id,campaign_id,opportunity_id) do nothing;
  get diagnostics v_count=row_count;

  insert into public.engagement_strategy_events(
    organisation_id,campaign_id,strategy_id,opportunity_id,event_type,next_state,metadata_json
  )
  select s.organisation_id,s.campaign_id,s.id,s.opportunity_id,'CREATED','WAITING',
         jsonb_build_object('source','G4_APPROVED_OPPORTUNITY','immutableG4',true)
  from public.engagement_strategies s
  where not exists(select 1 from public.engagement_strategy_events x where x.strategy_id=s.id);

  return v_count;
end $$;

create or replace function public.claim_g5_engagement_strategy(
  p_scheduler_run_id uuid,
  p_expected_state text,
  p_next_state text,
  p_lease_seconds integer default 300
)
returns table(strategy_id uuid, lease_token uuid, opportunity_id uuid, source_engagement_id uuid)
language plpgsql security definer set search_path=public as $$
declare v_id uuid; v_token uuid:=gen_random_uuid();
begin
  perform public.assert_active_pipeline_scheduler_run(p_scheduler_run_id);
  if p_expected_state not in ('WAITING','STRATEGY_READY','READY_FOR_APPROVAL','APPROVED','FAILED_RETRYABLE') then
    raise exception 'G5_INVALID_CLAIM_SOURCE_STATE';
  end if;
  if p_next_state not in ('REASONING','GENERATING','SELF_REVIEW','QUEUED') then
    raise exception 'G5_INVALID_CLAIM_TARGET_STATE';
  end if;

  select s.id into v_id
  from public.engagement_strategies s
  join public.opportunities o on o.id=s.opportunity_id and o.status='APPROVED'
  join public.campaigns c on c.id=s.campaign_id and c.status not in ('PAUSED','ARCHIVED')
  where (
      s.state=p_expected_state
      or (s.state='FAILED_RETRYABLE' and p_expected_state='FAILED_RETRYABLE' and coalesce(s.next_retry_at,now())<=now())
    )
    and (s.lease_expires_at is null or s.lease_expires_at<now())
  order by s.created_at
  for update of s skip locked
  limit 1;

  if v_id is null then return; end if;

  update public.engagement_strategies s set
    previous_state=s.state,
    state=p_next_state,
    scheduler_run_id=p_scheduler_run_id,
    lease_token=v_token,
    claimed_at=now(),
    lease_expires_at=now()+make_interval(secs=>greatest(30,p_lease_seconds)),
    attempt_count=s.attempt_count+1,
    failure_stage=null,
    failure_reason=null,
    next_retry_at=null,
    updated_at=now()
  where s.id=v_id;

  insert into public.engagement_strategy_events(
    organisation_id,campaign_id,strategy_id,opportunity_id,scheduler_run_id,event_type,
    previous_state,next_state,lease_token,metadata_json
  )
  select s.organisation_id,s.campaign_id,s.id,s.opportunity_id,p_scheduler_run_id,'CLAIMED',
         s.previous_state,s.state,v_token,jsonb_build_object('attempt',s.attempt_count)
  from public.engagement_strategies s where s.id=v_id;

  return query select s.id,s.lease_token,s.opportunity_id,s.source_engagement_id
  from public.engagement_strategies s where s.id=v_id;
end $$;

create or replace function public.transition_g5_engagement_strategy(
  p_strategy_id uuid,
  p_scheduler_run_id uuid,
  p_lease_token uuid,
  p_expected_state text,
  p_next_state text,
  p_metadata jsonb default '{}'::jsonb
)
returns public.engagement_strategies
language plpgsql security definer set search_path=public as $$
declare v public.engagement_strategies%rowtype; v_prev text;
begin
  perform public.assert_active_pipeline_scheduler_run(p_scheduler_run_id);
  select * into v from public.engagement_strategies where id=p_strategy_id for update;
  if v.id is null then raise exception 'G5_ENGAGEMENT_MISSING'; end if;
  if v.scheduler_run_id is distinct from p_scheduler_run_id or v.lease_token is distinct from p_lease_token
     or v.lease_expires_at is null or v.lease_expires_at<now() then
    raise exception 'G5_ENGAGEMENT_OWNERSHIP_LOST';
  end if;
  if v.state<>p_expected_state then raise exception 'G5_ENGAGEMENT_STATE_CHANGED'; end if;

  if not (
    (p_expected_state='REASONING' and p_next_state='STRATEGY_READY') or
    (p_expected_state='GENERATING' and p_next_state='SELF_REVIEW') or
    (p_expected_state='SELF_REVIEW' and p_next_state='READY_FOR_APPROVAL') or
    (p_expected_state='READY_FOR_APPROVAL' and p_next_state='APPROVED') or
    (p_expected_state='APPROVED' and p_next_state='QUEUED') or
    (p_expected_state='QUEUED' and p_next_state='SENT')
  ) then raise exception 'G5_INVALID_STATE_TRANSITION'; end if;

  v_prev:=v.state;
  update public.engagement_strategies set
    previous_state=v_prev,state=p_next_state,
    lease_token=null,lease_expires_at=null,claimed_at=null,
    scheduler_run_id=null,updated_at=now(),
    completed_at=case when p_next_state='SENT' then now() else completed_at end
  where id=p_strategy_id returning * into v;

  insert into public.engagement_strategy_events(
    organisation_id,campaign_id,strategy_id,opportunity_id,scheduler_run_id,event_type,
    previous_state,next_state,lease_token,metadata_json
  ) values(v.organisation_id,v.campaign_id,v.id,v.opportunity_id,p_scheduler_run_id,'TRANSITIONED',v_prev,p_next_state,p_lease_token,coalesce(p_metadata,'{}'::jsonb));
  return v;
end $$;

create or replace function public.fail_g5_engagement_strategy(
  p_strategy_id uuid,
  p_scheduler_run_id uuid,
  p_lease_token uuid,
  p_failure_stage text,
  p_reason text,
  p_retryable boolean,
  p_retry_after_seconds integer default 60
)
returns public.engagement_strategies
language plpgsql security definer set search_path=public as $$
declare v public.engagement_strategies%rowtype; v_prev text; v_next text;
begin
  perform public.assert_active_pipeline_scheduler_run(p_scheduler_run_id);
  select * into v from public.engagement_strategies where id=p_strategy_id for update;
  if v.id is null then raise exception 'G5_ENGAGEMENT_MISSING'; end if;
  if v.scheduler_run_id is distinct from p_scheduler_run_id or v.lease_token is distinct from p_lease_token
     or v.lease_expires_at is null or v.lease_expires_at<now() then
    raise exception 'G5_ENGAGEMENT_OWNERSHIP_LOST';
  end if;
  v_prev:=v.state;
  v_next:=case when p_retryable then 'FAILED_RETRYABLE' else 'FAILED_TERMINAL' end;

  update public.engagement_strategies set
    previous_state=v_prev,state=v_next,failure_stage=nullif(trim(coalesce(p_failure_stage,'')),''),
    failure_reason=left(coalesce(p_reason,'Unknown engagement failure'),1000),
    next_retry_at=case when p_retryable then now()+make_interval(secs=>greatest(30,p_retry_after_seconds)) else null end,
    lease_token=null,lease_expires_at=null,claimed_at=null,scheduler_run_id=null,updated_at=now()
  where id=p_strategy_id returning * into v;

  insert into public.engagement_strategy_events(
    organisation_id,campaign_id,strategy_id,opportunity_id,scheduler_run_id,event_type,
    previous_state,next_state,lease_token,metadata_json
  ) values(v.organisation_id,v.campaign_id,v.id,v.opportunity_id,p_scheduler_run_id,
    case when p_retryable then 'RETRY_SCHEDULED' else 'FAILED_TERMINAL' end,
    v_prev,v_next,p_lease_token,jsonb_build_object('failureStage',p_failure_stage,'reason',left(coalesce(p_reason,''),500),'retryable',p_retryable));
  return v;
end $$;

revoke all on function public.seed_g5_engagement_strategies(uuid) from public,anon,authenticated;
revoke all on function public.claim_g5_engagement_strategy(uuid,text,text,integer) from public,anon,authenticated;
revoke all on function public.transition_g5_engagement_strategy(uuid,uuid,uuid,text,text,jsonb) from public,anon,authenticated;
revoke all on function public.fail_g5_engagement_strategy(uuid,uuid,uuid,text,text,boolean,integer) from public,anon,authenticated;
grant execute on function public.seed_g5_engagement_strategies(uuid) to service_role;
grant execute on function public.claim_g5_engagement_strategy(uuid,text,text,integer) to service_role;
grant execute on function public.transition_g5_engagement_strategy(uuid,uuid,uuid,text,text,jsonb) to service_role;
grant execute on function public.fail_g5_engagement_strategy(uuid,uuid,uuid,text,text,boolean,integer) to service_role;

comment on table public.engagement_strategies is 'G5 canonical engagement execution authority. References immutable G4 opportunity truth and never owns or mutates it.';
