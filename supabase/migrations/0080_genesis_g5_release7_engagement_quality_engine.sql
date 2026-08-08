-- MarketRoute Genesis G5 — Release 7: Engagement Quality Engine
-- Deterministic, explainable and separate from Opportunity Score.
-- G4 truth and the R6 PASS decision remain immutable.

alter table public.engagement_strategies
  add column if not exists engagement_quality_json jsonb,
  add column if not exists engagement_quality_schema_version text,
  add column if not exists engagement_quality_policy_version text,
  add column if not exists engagement_confidence integer check (engagement_confidence between 0 and 100),
  add column if not exists engagement_quality_source_fingerprint text,
  add column if not exists engagement_quality_scored_at timestamptz;

create table if not exists public.engagement_quality_assessments (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  strategy_id uuid not null references public.engagement_strategies(id) on delete cascade,
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  scheduler_run_id uuid references public.pipeline_scheduler_runs(id) on delete set null,
  engagement_confidence integer not null check (engagement_confidence between 0 and 100),
  quality_json jsonb not null,
  schema_version text not null,
  policy_version text not null,
  source_fingerprint text not null,
  created_at timestamptz not null default now()
);
create index if not exists engagement_quality_assessments_strategy_idx on public.engagement_quality_assessments(strategy_id,created_at desc);
alter table public.engagement_quality_assessments enable row level security;
drop policy if exists engagement_quality_assessments_member_read on public.engagement_quality_assessments;
create policy engagement_quality_assessments_member_read on public.engagement_quality_assessments for select to authenticated using (public.is_active_org_member(organisation_id));
revoke all on table public.engagement_quality_assessments from public,anon,authenticated;
grant select on table public.engagement_quality_assessments to authenticated;
grant select,insert on table public.engagement_quality_assessments to service_role;

alter table public.engagement_strategy_events drop constraint if exists engagement_strategy_events_event_type_check;
alter table public.engagement_strategy_events add constraint engagement_strategy_events_event_type_check check (event_type in (
  'CREATED','CLAIMED','TRANSITIONED','RETRY_SCHEDULED','FAILED_TERMINAL','LEASE_RELEASED',
  'CHANNEL_STRATEGY_READY','PERSONALISATION_SAFETY_READY','SELF_REVIEW_PASS','SELF_REVIEW_REWRITE','SELF_REVIEW_BLOCK',
  'ENGAGEMENT_QUALITY_SCORED'
));

create or replace function public.claim_g5_engagement_quality(p_scheduler_run_id uuid,p_lease_seconds integer default 120)
returns table(strategy_id uuid,lease_token uuid,opportunity_id uuid)
language plpgsql security definer set search_path=public as $$
declare v_id uuid; v_token uuid:=gen_random_uuid();
begin
  perform public.assert_active_pipeline_scheduler_run(p_scheduler_run_id);
  select s.id into v_id
  from public.engagement_strategies s
  join public.opportunities o on o.id=s.opportunity_id and o.status='APPROVED'
  join public.campaigns c on c.id=s.campaign_id and c.status not in ('PAUSED','ARCHIVED')
  where (
    (s.state='READY_FOR_APPROVAL' and s.engagement_quality_json is null)
    or (s.state='FAILED_RETRYABLE' and s.failure_stage='ENGAGEMENT_QUALITY' and coalesce(s.next_retry_at,now())<=now())
  )
    and s.self_review_outcome='PASS'
    and s.self_review_json is not null
    and s.channel_strategy_json is not null
    and s.personalisation_safety_json is not null
    and s.outreach_generation_json is not null
    and (s.lease_expires_at is null or s.lease_expires_at<now())
  order by s.created_at
  for update of s skip locked limit 1;
  if v_id is null then return; end if;

  update public.engagement_strategies set
    previous_state=case when state='FAILED_RETRYABLE' then state else previous_state end,
    state='READY_FOR_APPROVAL',
    scheduler_run_id=p_scheduler_run_id,
    lease_token=v_token,
    claimed_at=now(),
    lease_expires_at=now()+make_interval(secs=>greatest(30,p_lease_seconds)),
    failure_stage=null,failure_reason=null,next_retry_at=null,
    updated_at=now()
  where id=v_id;

  return query select s.id,s.lease_token,s.opportunity_id from public.engagement_strategies s where s.id=v_id;
end $$;

create or replace function public.get_g5_engagement_quality_context_owned(p_strategy_id uuid,p_scheduler_run_id uuid,p_lease_token uuid)
returns table(self_review_json jsonb,self_review_outcome text,self_review_confidence integer,channel_strategy_json jsonb,personalisation_safety_json jsonb,rewrite_count integer)
language plpgsql security definer set search_path=public as $$
declare v public.engagement_strategies%rowtype;
begin
  perform public.assert_active_pipeline_scheduler_run(p_scheduler_run_id);
  select * into v from public.engagement_strategies where id=p_strategy_id;
  if v.id is null then raise exception 'G5_ENGAGEMENT_MISSING'; end if;
  if v.state<>'READY_FOR_APPROVAL' then raise exception 'G5_ENGAGEMENT_STATE_CHANGED'; end if;
  if v.scheduler_run_id is distinct from p_scheduler_run_id or v.lease_token is distinct from p_lease_token or v.lease_expires_at is null or v.lease_expires_at<now() then raise exception 'G5_ENGAGEMENT_OWNERSHIP_LOST'; end if;
  if v.self_review_outcome<>'PASS' or v.self_review_json is null or v.channel_strategy_json is null or v.personalisation_safety_json is null or v.outreach_generation_json is null then raise exception 'G5_ENGAGEMENT_QUALITY_CONTEXT_INVALID'; end if;
  return query select v.self_review_json,v.self_review_outcome,v.self_review_confidence,v.channel_strategy_json,v.personalisation_safety_json,v.rewrite_count;
end $$;

create or replace function public.complete_g5_engagement_quality_owned(
  p_strategy_id uuid,p_scheduler_run_id uuid,p_lease_token uuid,p_quality_json jsonb,p_schema_version text,p_policy_version text,p_engagement_confidence integer,p_source_fingerprint text)
returns public.engagement_strategies
language plpgsql security definer set search_path=public as $$
declare v public.engagement_strategies%rowtype;
begin
  perform public.assert_active_pipeline_scheduler_run(p_scheduler_run_id);
  if p_engagement_confidence<0 or p_engagement_confidence>100 then raise exception 'G5_ENGAGEMENT_QUALITY_INVALID_SCORE'; end if;
  select * into v from public.engagement_strategies where id=p_strategy_id for update;
  if v.id is null then raise exception 'G5_ENGAGEMENT_MISSING'; end if;
  if v.state<>'READY_FOR_APPROVAL' then raise exception 'G5_ENGAGEMENT_STATE_CHANGED'; end if;
  if v.scheduler_run_id is distinct from p_scheduler_run_id or v.lease_token is distinct from p_lease_token or v.lease_expires_at is null or v.lease_expires_at<now() then raise exception 'G5_ENGAGEMENT_OWNERSHIP_LOST'; end if;
  if v.self_review_outcome<>'PASS' then raise exception 'G5_ENGAGEMENT_QUALITY_REQUIRES_PASS'; end if;

  insert into public.engagement_quality_assessments(organisation_id,campaign_id,strategy_id,opportunity_id,scheduler_run_id,engagement_confidence,quality_json,schema_version,policy_version,source_fingerprint)
  values(v.organisation_id,v.campaign_id,v.id,v.opportunity_id,p_scheduler_run_id,p_engagement_confidence,p_quality_json,p_schema_version,p_policy_version,p_source_fingerprint);

  update public.engagement_strategies set
    engagement_quality_json=p_quality_json,
    engagement_quality_schema_version=p_schema_version,
    engagement_quality_policy_version=p_policy_version,
    engagement_confidence=p_engagement_confidence,
    engagement_quality_source_fingerprint=p_source_fingerprint,
    engagement_quality_scored_at=now(),
    lease_token=null,lease_expires_at=null,claimed_at=null,scheduler_run_id=null,updated_at=now()
  where id=v.id returning * into v;

  insert into public.engagement_strategy_events(organisation_id,campaign_id,strategy_id,opportunity_id,scheduler_run_id,event_type,previous_state,next_state,lease_token,metadata_json)
  values(v.organisation_id,v.campaign_id,v.id,v.opportunity_id,p_scheduler_run_id,'ENGAGEMENT_QUALITY_SCORED','READY_FOR_APPROVAL','READY_FOR_APPROVAL',p_lease_token,jsonb_build_object('release','G5_R7','engagementConfidence',p_engagement_confidence,'policyVersion',p_policy_version,'immutableG4',true));
  return v;
end $$;

create or replace function public.fail_g5_engagement_quality_owned(p_strategy_id uuid,p_scheduler_run_id uuid,p_lease_token uuid,p_reason text,p_retry_after_seconds integer default 60)
returns public.engagement_strategies language plpgsql security definer set search_path=public as $$
declare v public.engagement_strategies%rowtype;
begin
  perform public.assert_active_pipeline_scheduler_run(p_scheduler_run_id);
  select * into v from public.engagement_strategies where id=p_strategy_id for update;
  if v.id is null then raise exception 'G5_ENGAGEMENT_MISSING'; end if;
  if v.state<>'READY_FOR_APPROVAL' then raise exception 'G5_ENGAGEMENT_STATE_CHANGED'; end if;
  if v.scheduler_run_id is distinct from p_scheduler_run_id or v.lease_token is distinct from p_lease_token or v.lease_expires_at is null or v.lease_expires_at<now() then raise exception 'G5_ENGAGEMENT_OWNERSHIP_LOST'; end if;
  update public.engagement_strategies set previous_state='READY_FOR_APPROVAL',state='FAILED_RETRYABLE',failure_stage='ENGAGEMENT_QUALITY',failure_reason=left(coalesce(p_reason,'G5 engagement quality failed'),1000),next_retry_at=now()+make_interval(secs=>greatest(30,p_retry_after_seconds)),lease_token=null,lease_expires_at=null,claimed_at=null,scheduler_run_id=null,updated_at=now() where id=p_strategy_id returning * into v;
  insert into public.engagement_strategy_events(organisation_id,campaign_id,strategy_id,opportunity_id,scheduler_run_id,event_type,previous_state,next_state,lease_token,metadata_json)
  values(v.organisation_id,v.campaign_id,v.id,v.opportunity_id,p_scheduler_run_id,'RETRY_SCHEDULED','READY_FOR_APPROVAL','FAILED_RETRYABLE',p_lease_token,jsonb_build_object('release','G5_R7','worker','ENGAGEMENT_QUALITY','reason',left(coalesce(p_reason,''),500),'retryable',true));
  return v;
end $$;

-- From R7 onward an engagement may not be approved until its separate quality score exists.
create or replace function public.transition_g5_engagement_strategy(
  p_strategy_id uuid,p_scheduler_run_id uuid,p_lease_token uuid,p_expected_state text,p_next_state text,p_metadata jsonb default '{}'::jsonb)
returns public.engagement_strategies
language plpgsql security definer set search_path=public as $$
declare v public.engagement_strategies%rowtype; v_prev text;
begin
  perform public.assert_active_pipeline_scheduler_run(p_scheduler_run_id);
  select * into v from public.engagement_strategies where id=p_strategy_id for update;
  if v.id is null then raise exception 'G5_ENGAGEMENT_MISSING'; end if;
  if v.scheduler_run_id is distinct from p_scheduler_run_id or v.lease_token is distinct from p_lease_token or v.lease_expires_at is null or v.lease_expires_at<now() then raise exception 'G5_ENGAGEMENT_OWNERSHIP_LOST'; end if;
  if v.state<>p_expected_state then raise exception 'G5_ENGAGEMENT_STATE_CHANGED'; end if;
  if not ((p_expected_state='REASONING' and p_next_state='STRATEGY_READY') or (p_expected_state='GENERATING' and p_next_state='SELF_REVIEW') or (p_expected_state='SELF_REVIEW' and p_next_state='READY_FOR_APPROVAL') or (p_expected_state='READY_FOR_APPROVAL' and p_next_state='APPROVED') or (p_expected_state='APPROVED' and p_next_state='QUEUED') or (p_expected_state='QUEUED' and p_next_state='SENT')) then raise exception 'G5_INVALID_STATE_TRANSITION'; end if;
  if p_expected_state='READY_FOR_APPROVAL' and p_next_state='APPROVED' and (v.engagement_quality_json is null or v.engagement_confidence is null) then raise exception 'G5_ENGAGEMENT_QUALITY_REQUIRED'; end if;
  v_prev:=v.state;
  update public.engagement_strategies set previous_state=v_prev,state=p_next_state,lease_token=null,lease_expires_at=null,claimed_at=null,scheduler_run_id=null,updated_at=now(),completed_at=case when p_next_state='SENT' then now() else completed_at end where id=p_strategy_id returning * into v;
  insert into public.engagement_strategy_events(organisation_id,campaign_id,strategy_id,opportunity_id,scheduler_run_id,event_type,previous_state,next_state,lease_token,metadata_json) values(v.organisation_id,v.campaign_id,v.id,v.opportunity_id,p_scheduler_run_id,'TRANSITIONED',v_prev,p_next_state,p_lease_token,coalesce(p_metadata,'{}'::jsonb));
  return v;
end $$;

revoke all on function public.claim_g5_engagement_quality(uuid,integer) from public,anon,authenticated;
revoke all on function public.get_g5_engagement_quality_context_owned(uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function public.complete_g5_engagement_quality_owned(uuid,uuid,uuid,jsonb,text,text,integer,text) from public,anon,authenticated;
revoke all on function public.fail_g5_engagement_quality_owned(uuid,uuid,uuid,text,integer) from public,anon,authenticated;
grant execute on function public.claim_g5_engagement_quality(uuid,integer) to service_role;
grant execute on function public.get_g5_engagement_quality_context_owned(uuid,uuid,uuid) to service_role;
grant execute on function public.complete_g5_engagement_quality_owned(uuid,uuid,uuid,jsonb,text,text,integer,text) to service_role;
grant execute on function public.fail_g5_engagement_quality_owned(uuid,uuid,uuid,text,integer) to service_role;
