-- MarketRoute Genesis G5 — Release 4: Channel-Specific Outreach Generation
-- G4 remains immutable. R4 consumes persisted R2 commercial reasoning and the
-- persisted R3 primary route/channel decision. It generates first-touch content,
-- persists it under fenced ownership, and stops at SELF_REVIEW.

alter table public.engagement_strategies
  add column if not exists outreach_generation_json jsonb,
  add column if not exists outreach_generation_schema_version text,
  add column if not exists outreach_generation_prompt_version text,
  add column if not exists outreach_generation_model text,
  add column if not exists outreach_generation_confidence integer
    check (outreach_generation_confidence between 0 and 100),
  add column if not exists outreach_generation_source_fingerprint text,
  add column if not exists outreach_generated_at timestamptz;

-- Compatibility repair for the R3 event emitted by complete_g5_channel_strategy_owned.
-- R1's initial check predated CHANNEL_STRATEGY_READY, so a live R3 completion could
-- otherwise fail even though the migration and TypeScript compile successfully.
alter table public.engagement_strategy_events
  drop constraint if exists engagement_strategy_events_event_type_check;
alter table public.engagement_strategy_events
  add constraint engagement_strategy_events_event_type_check check (
    event_type in (
      'CREATED','CLAIMED','TRANSITIONED','RETRY_SCHEDULED','FAILED_TERMINAL','LEASE_RELEASED',
      'CHANNEL_STRATEGY_READY'
    )
  );

create or replace function public.claim_g5_outreach_generation(
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
      (s.state='STRATEGY_READY' and s.outreach_generation_json is null)
      or
      (s.state='FAILED_RETRYABLE' and s.failure_stage='OUTREACH_GENERATION'
        and coalesce(s.next_retry_at,now())<=now())
    )
    and s.commercial_reasoning_json is not null
    and s.commercial_reasoning_source_snapshot_json is not null
    and s.channel_strategy_json is not null
    and s.channel_strategy_schema_version='g5-channel-strategy/v1'
    and (s.lease_expires_at is null or s.lease_expires_at<now())
  order by s.created_at
  for update of s skip locked
  limit 1;

  if v_id is null then return; end if;

  update public.engagement_strategies s set
    previous_state=v_previous,
    state='GENERATING',
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
         v_previous,'GENERATING',v_token,
         jsonb_build_object('attempt',s.attempt_count,'release','G5_R4','worker','OUTREACH_GENERATION','immutableG4',true)
  from public.engagement_strategies s where s.id=v_id;

  return query select s.id,s.lease_token,s.opportunity_id
  from public.engagement_strategies s where s.id=v_id;
end $$;

create or replace function public.get_g5_outreach_generation_context_owned(
  p_strategy_id uuid,
  p_scheduler_run_id uuid,
  p_lease_token uuid
)
returns table(
  organisation_id uuid,
  campaign_id uuid,
  commercial_reasoning_json jsonb,
  channel_strategy_json jsonb,
  source_snapshot_json jsonb
)
language plpgsql security definer set search_path=public as $$
declare v public.engagement_strategies%rowtype;
begin
  perform public.assert_active_pipeline_scheduler_run(p_scheduler_run_id);
  select * into v from public.engagement_strategies where id=p_strategy_id;
  if v.id is null then raise exception 'G5_ENGAGEMENT_MISSING'; end if;
  if v.state<>'GENERATING' then raise exception 'G5_ENGAGEMENT_STATE_CHANGED'; end if;
  if v.scheduler_run_id is distinct from p_scheduler_run_id
     or v.lease_token is distinct from p_lease_token
     or v.lease_expires_at is null or v.lease_expires_at<now() then
    raise exception 'G5_ENGAGEMENT_OWNERSHIP_LOST';
  end if;
  if v.commercial_reasoning_json is null or v.commercial_reasoning_source_snapshot_json is null then
    raise exception 'G5_OUTREACH_REASONING_MISSING';
  end if;
  if v.channel_strategy_json is null or v.channel_strategy_schema_version<>'g5-channel-strategy/v1' then
    raise exception 'G5_OUTREACH_CHANNEL_STRATEGY_MISSING';
  end if;
  if v.outreach_generation_json is not null then raise exception 'G5_OUTREACH_ALREADY_GENERATED'; end if;

  return query select
    v.organisation_id,
    v.campaign_id,
    v.commercial_reasoning_json,
    v.channel_strategy_json,
    v.commercial_reasoning_source_snapshot_json;
end $$;

create or replace function public.complete_g5_outreach_generation_owned(
  p_strategy_id uuid,
  p_scheduler_run_id uuid,
  p_lease_token uuid,
  p_outreach_json jsonb,
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
  if v.state<>'GENERATING' then raise exception 'G5_ENGAGEMENT_STATE_CHANGED'; end if;
  if v.scheduler_run_id is distinct from p_scheduler_run_id
     or v.lease_token is distinct from p_lease_token
     or v.lease_expires_at is null or v.lease_expires_at<now() then
    raise exception 'G5_ENGAGEMENT_OWNERSHIP_LOST';
  end if;
  if p_outreach_json is null or jsonb_typeof(p_outreach_json)<>'object' then
    raise exception 'G5_OUTREACH_INVALID';
  end if;
  if coalesce(p_schema_version,'')<>'g5-outreach-generation/v1'
     or coalesce(p_prompt_version,'')<>'g5-outreach-generation/v1' then
    raise exception 'G5_OUTREACH_VERSION_INVALID';
  end if;
  if p_confidence is null or p_confidence<0 or p_confidence>100 then
    raise exception 'G5_OUTREACH_CONFIDENCE_INVALID';
  end if;
  if nullif(trim(coalesce(p_source_fingerprint,'')),'') is null then
    raise exception 'G5_OUTREACH_SOURCE_FINGERPRINT_REQUIRED';
  end if;
  if v.channel_strategy_json is null or v.channel_strategy_schema_version<>'g5-channel-strategy/v1' then
    raise exception 'G5_OUTREACH_CHANNEL_STRATEGY_MISSING';
  end if;

  update public.engagement_strategies set
    previous_state='GENERATING',
    state='SELF_REVIEW',
    outreach_generation_json=p_outreach_json,
    outreach_generation_schema_version=p_schema_version,
    outreach_generation_prompt_version=p_prompt_version,
    outreach_generation_model=nullif(trim(coalesce(p_model,'')),''),
    outreach_generation_confidence=p_confidence,
    outreach_generation_source_fingerprint=p_source_fingerprint,
    outreach_generated_at=now(),
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
    v.organisation_id,v.campaign_id,v.id,v.opportunity_id,p_scheduler_run_id,'TRANSITIONED',
    'GENERATING','SELF_REVIEW',p_lease_token,
    jsonb_build_object(
      'release','G5_R4','worker','OUTREACH_GENERATION','schemaVersion',p_schema_version,
      'promptVersion',p_prompt_version,'model',p_model,'confidence',p_confidence,
      'sourceFingerprint',p_source_fingerprint,'immutableG4',true
    )
  );

  insert into public.campaign_timeline(
    organisation_id,campaign_id,event_type,title,description,visibility,metadata_json
  ) values(
    v.organisation_id,v.campaign_id,'G5_OUTREACH_GENERATED',
    'First-touch outreach prepared',
    'MarketRoute has prepared channel-native outreach from the approved commercial argument and selected route. Independent AI self-review is next.',
    'CUSTOMER',
    jsonb_build_object('strategyId',v.id,'opportunityId',v.opportunity_id,'confidence',p_confidence,'nextState','SELF_REVIEW')
  );

  return v;
end $$;

create or replace function public.fail_g5_outreach_generation_owned(
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
  if v.state<>'GENERATING' then raise exception 'G5_ENGAGEMENT_STATE_CHANGED'; end if;
  if v.scheduler_run_id is distinct from p_scheduler_run_id
     or v.lease_token is distinct from p_lease_token
     or v.lease_expires_at is null or v.lease_expires_at<now() then
    raise exception 'G5_ENGAGEMENT_OWNERSHIP_LOST';
  end if;

  update public.engagement_strategies set
    previous_state='GENERATING',
    state='FAILED_RETRYABLE',
    failure_stage='OUTREACH_GENERATION',
    failure_reason=left(coalesce(p_reason,'G5 outreach generation failed'),1000),
    next_retry_at=now()+make_interval(secs=>greatest(30,p_retry_after_seconds)),
    lease_token=null,lease_expires_at=null,claimed_at=null,scheduler_run_id=null,updated_at=now()
  where id=p_strategy_id returning * into v;

  insert into public.engagement_strategy_events(
    organisation_id,campaign_id,strategy_id,opportunity_id,scheduler_run_id,event_type,
    previous_state,next_state,lease_token,metadata_json
  ) values(
    v.organisation_id,v.campaign_id,v.id,v.opportunity_id,p_scheduler_run_id,'RETRY_SCHEDULED',
    'GENERATING','FAILED_RETRYABLE',p_lease_token,
    jsonb_build_object('release','G5_R4','worker','OUTREACH_GENERATION','failureStage','OUTREACH_GENERATION','reason',left(coalesce(p_reason,''),500),'retryable',true)
  );

  return v;
end $$;

revoke all on function public.claim_g5_outreach_generation(uuid,integer) from public,anon,authenticated;
revoke all on function public.get_g5_outreach_generation_context_owned(uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function public.complete_g5_outreach_generation_owned(uuid,uuid,uuid,jsonb,text,text,text,integer,text) from public,anon,authenticated;
revoke all on function public.fail_g5_outreach_generation_owned(uuid,uuid,uuid,text,integer) from public,anon,authenticated;
grant execute on function public.claim_g5_outreach_generation(uuid,integer) to service_role;
grant execute on function public.get_g5_outreach_generation_context_owned(uuid,uuid,uuid) to service_role;
grant execute on function public.complete_g5_outreach_generation_owned(uuid,uuid,uuid,jsonb,text,text,text,integer,text) to service_role;
grant execute on function public.fail_g5_outreach_generation_owned(uuid,uuid,uuid,text,integer) to service_role;

comment on column public.engagement_strategies.outreach_generation_json is
'G5 R4 channel-native first-touch content generated only from persisted G5 reasoning, persisted G5 channel strategy, and immutable G4 truth. Awaiting independent self-review.';
