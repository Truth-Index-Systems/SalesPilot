-- MarketRoute Genesis G5 — Release 3: Engagement Channel Strategy
-- G4 remains immutable. R3 enriches the canonical G5 strategy while it remains
-- STRATEGY_READY. It does not add a lifecycle state and does not generate outreach.

alter table public.engagement_strategies
  add column if not exists channel_strategy_json jsonb,
  add column if not exists channel_strategy_schema_version text,
  add column if not exists channel_strategy_prompt_version text,
  add column if not exists channel_strategy_model text,
  add column if not exists channel_strategy_confidence integer
    check (channel_strategy_confidence between 0 and 100),
  add column if not exists channel_strategy_source_fingerprint text,
  add column if not exists channel_strategy_decided_at timestamptz;

create or replace function public.claim_g5_channel_strategy(
  p_scheduler_run_id uuid,
  p_lease_seconds integer default 300
)
returns table(strategy_id uuid, lease_token uuid, opportunity_id uuid)
language plpgsql security definer set search_path=public as $$
declare
  v_id uuid;
  v_token uuid:=gen_random_uuid();
  v_previous text;
begin
  perform public.assert_active_pipeline_scheduler_run(p_scheduler_run_id);

  select s.id,s.state into v_id,v_previous
  from public.engagement_strategies s
  join public.opportunities o on o.id=s.opportunity_id and o.status='APPROVED'
  join public.campaigns c on c.id=s.campaign_id and c.status not in ('PAUSED','ARCHIVED')
  where (
      (s.state='STRATEGY_READY' and s.channel_strategy_json is null)
      or
      (s.state='FAILED_RETRYABLE' and s.failure_stage='CHANNEL_STRATEGY'
        and coalesce(s.next_retry_at,now())<=now())
    )
    and s.commercial_reasoning_json is not null
    and s.commercial_reasoning_source_snapshot_json is not null
    and (s.lease_expires_at is null or s.lease_expires_at<now())
  order by s.created_at
  for update of s skip locked
  limit 1;

  if v_id is null then return; end if;

  update public.engagement_strategies s set
    previous_state=v_previous,
    state='STRATEGY_READY',
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
         v_previous,'STRATEGY_READY',v_token,
         jsonb_build_object('attempt',s.attempt_count,'release','G5_R3','worker','CHANNEL_STRATEGY','statePreserved',true)
  from public.engagement_strategies s where s.id=v_id;

  return query select s.id,s.lease_token,s.opportunity_id
  from public.engagement_strategies s where s.id=v_id;
end $$;

create or replace function public.get_g5_channel_strategy_context_owned(
  p_strategy_id uuid,
  p_scheduler_run_id uuid,
  p_lease_token uuid
)
returns table(
  organisation_id uuid,
  campaign_id uuid,
  commercial_reasoning_json jsonb,
  source_snapshot_json jsonb
)
language plpgsql security definer set search_path=public as $$
declare v public.engagement_strategies%rowtype;
begin
  perform public.assert_active_pipeline_scheduler_run(p_scheduler_run_id);
  select * into v from public.engagement_strategies where id=p_strategy_id;
  if v.id is null then raise exception 'G5_ENGAGEMENT_MISSING'; end if;
  if v.state<>'STRATEGY_READY' then raise exception 'G5_ENGAGEMENT_STATE_CHANGED'; end if;
  if v.scheduler_run_id is distinct from p_scheduler_run_id
     or v.lease_token is distinct from p_lease_token
     or v.lease_expires_at is null or v.lease_expires_at<now() then
    raise exception 'G5_ENGAGEMENT_OWNERSHIP_LOST';
  end if;
  if v.commercial_reasoning_json is null or v.commercial_reasoning_source_snapshot_json is null then
    raise exception 'G5_CHANNEL_STRATEGY_REASONING_MISSING';
  end if;
  if v.channel_strategy_json is not null then raise exception 'G5_CHANNEL_STRATEGY_ALREADY_READY'; end if;

  return query select
    v.organisation_id,
    v.campaign_id,
    v.commercial_reasoning_json,
    v.commercial_reasoning_source_snapshot_json;
end $$;

create or replace function public.complete_g5_channel_strategy_owned(
  p_strategy_id uuid,
  p_scheduler_run_id uuid,
  p_lease_token uuid,
  p_channel_strategy_json jsonb,
  p_schema_version text,
  p_prompt_version text,
  p_model text,
  p_confidence integer,
  p_source_fingerprint text
)
returns public.engagement_strategies
language plpgsql security definer set search_path=public as $$
declare v public.engagement_strategies%rowtype;
begin
  perform public.assert_active_pipeline_scheduler_run(p_scheduler_run_id);
  select * into v from public.engagement_strategies where id=p_strategy_id for update;
  if v.id is null then raise exception 'G5_ENGAGEMENT_MISSING'; end if;
  if v.state<>'STRATEGY_READY' then raise exception 'G5_ENGAGEMENT_STATE_CHANGED'; end if;
  if v.scheduler_run_id is distinct from p_scheduler_run_id
     or v.lease_token is distinct from p_lease_token
     or v.lease_expires_at is null or v.lease_expires_at<now() then
    raise exception 'G5_ENGAGEMENT_OWNERSHIP_LOST';
  end if;
  if p_channel_strategy_json is null or jsonb_typeof(p_channel_strategy_json)<>'object' then
    raise exception 'G5_CHANNEL_STRATEGY_INVALID';
  end if;
  if coalesce(p_schema_version,'')<>'g5-channel-strategy/v1'
     or coalesce(p_prompt_version,'')<>'g5-channel-strategy/v1' then
    raise exception 'G5_CHANNEL_STRATEGY_VERSION_INVALID';
  end if;
  if p_confidence is null or p_confidence<0 or p_confidence>100 then
    raise exception 'G5_CHANNEL_STRATEGY_CONFIDENCE_INVALID';
  end if;
  if nullif(trim(coalesce(p_source_fingerprint,'')),'') is null then
    raise exception 'G5_CHANNEL_STRATEGY_SOURCE_FINGERPRINT_REQUIRED';
  end if;
  if v.commercial_reasoning_json is null or v.commercial_reasoning_source_snapshot_json is null then
    raise exception 'G5_CHANNEL_STRATEGY_REASONING_MISSING';
  end if;

  update public.engagement_strategies set
    channel_strategy_json=p_channel_strategy_json,
    channel_strategy_schema_version=p_schema_version,
    channel_strategy_prompt_version=p_prompt_version,
    channel_strategy_model=nullif(trim(coalesce(p_model,'')),''),
    channel_strategy_confidence=p_confidence,
    channel_strategy_source_fingerprint=p_source_fingerprint,
    channel_strategy_decided_at=now(),
    lease_token=null,
    lease_expires_at=null,
    claimed_at=null,
    scheduler_run_id=null,
    failure_stage=null,
    failure_reason=null,
    next_retry_at=null,
    updated_at=now()
  where id=p_strategy_id returning * into v;

  insert into public.engagement_strategy_events(
    organisation_id,campaign_id,strategy_id,opportunity_id,scheduler_run_id,event_type,
    previous_state,next_state,lease_token,metadata_json
  ) values(
    v.organisation_id,v.campaign_id,v.id,v.opportunity_id,p_scheduler_run_id,'CHANNEL_STRATEGY_READY',
    'STRATEGY_READY','STRATEGY_READY',p_lease_token,
    jsonb_build_object(
      'release','G5_R3','worker','CHANNEL_STRATEGY','schemaVersion',p_schema_version,
      'promptVersion',p_prompt_version,'model',p_model,'confidence',p_confidence,
      'sourceFingerprint',p_source_fingerprint,'immutableG4',true,'statePreserved',true
    )
  );

  insert into public.campaign_timeline(
    organisation_id,campaign_id,event_type,title,description,visibility,metadata_json
  ) values(
    v.organisation_id,v.campaign_id,'G5_CHANNEL_STRATEGY_READY',
    'Strongest engagement route selected',
    'MarketRoute has selected the strongest evidence-backed first engagement route and safe alternatives.',
    'CUSTOMER',
    jsonb_build_object('strategyId',v.id,'opportunityId',v.opportunity_id,'confidence',p_confidence)
  );

  return v;
end $$;

create or replace function public.fail_g5_channel_strategy_owned(
  p_strategy_id uuid,
  p_scheduler_run_id uuid,
  p_lease_token uuid,
  p_reason text,
  p_retry_after_seconds integer default 60
)
returns public.engagement_strategies
language plpgsql security definer set search_path=public as $$
declare v public.engagement_strategies%rowtype;
begin
  perform public.assert_active_pipeline_scheduler_run(p_scheduler_run_id);
  select * into v from public.engagement_strategies where id=p_strategy_id for update;
  if v.id is null then raise exception 'G5_ENGAGEMENT_MISSING'; end if;
  if v.state<>'STRATEGY_READY' then raise exception 'G5_ENGAGEMENT_STATE_CHANGED'; end if;
  if v.scheduler_run_id is distinct from p_scheduler_run_id
     or v.lease_token is distinct from p_lease_token
     or v.lease_expires_at is null or v.lease_expires_at<now() then
    raise exception 'G5_ENGAGEMENT_OWNERSHIP_LOST';
  end if;

  update public.engagement_strategies set
    previous_state='STRATEGY_READY',
    state='FAILED_RETRYABLE',
    failure_stage='CHANNEL_STRATEGY',
    failure_reason=left(coalesce(p_reason,'G5 channel strategy failed'),1000),
    next_retry_at=now()+make_interval(secs=>greatest(30,p_retry_after_seconds)),
    lease_token=null,lease_expires_at=null,claimed_at=null,scheduler_run_id=null,updated_at=now()
  where id=p_strategy_id returning * into v;

  insert into public.engagement_strategy_events(
    organisation_id,campaign_id,strategy_id,opportunity_id,scheduler_run_id,event_type,
    previous_state,next_state,lease_token,metadata_json
  ) values(
    v.organisation_id,v.campaign_id,v.id,v.opportunity_id,p_scheduler_run_id,'RETRY_SCHEDULED',
    'STRATEGY_READY','FAILED_RETRYABLE',p_lease_token,
    jsonb_build_object('release','G5_R3','worker','CHANNEL_STRATEGY','failureStage','CHANNEL_STRATEGY','reason',left(coalesce(p_reason,''),500),'retryable',true)
  );

  return v;
end $$;

-- Future-generation gate. R3 still does not run GENERATING; this ensures R4
-- cannot accidentally claim a reasoning-only strategy without a channel decision.
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
    and (
      not (p_expected_state='STRATEGY_READY' and p_next_state='GENERATING')
      or (s.channel_strategy_json is not null and s.channel_strategy_schema_version='g5-channel-strategy/v1')
    )
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

revoke all on function public.claim_g5_channel_strategy(uuid,integer) from public,anon,authenticated;
revoke all on function public.get_g5_channel_strategy_context_owned(uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function public.complete_g5_channel_strategy_owned(uuid,uuid,uuid,jsonb,text,text,text,integer,text) from public,anon,authenticated;
revoke all on function public.fail_g5_channel_strategy_owned(uuid,uuid,uuid,text,integer) from public,anon,authenticated;
grant execute on function public.claim_g5_channel_strategy(uuid,integer) to service_role;
grant execute on function public.get_g5_channel_strategy_context_owned(uuid,uuid,uuid) to service_role;
grant execute on function public.complete_g5_channel_strategy_owned(uuid,uuid,uuid,jsonb,text,text,text,integer,text) to service_role;
grant execute on function public.fail_g5_channel_strategy_owned(uuid,uuid,uuid,text,integer) to service_role;

comment on column public.engagement_strategies.channel_strategy_json is
'G5 R3 evidence-backed engagement channel decision. Selects only already-discovered viable G4 commercial routes and never mutates G4 truth.';
