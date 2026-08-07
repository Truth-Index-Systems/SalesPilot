-- SalesPilot Genesis G5 — Release 5: Personalisation Safety Layer
-- G4 remains immutable. R5 derives a deterministic personalisation manifest from
-- persisted R2 commercial reasoning + its immutable G4 source snapshot.
-- It does not add a lifecycle state. Outreach generation is now impossible until
-- the manifest exists, and R4 must declare only allowed manifest item IDs.

alter table public.engagement_strategies
  add column if not exists personalisation_safety_json jsonb,
  add column if not exists personalisation_safety_schema_version text,
  add column if not exists personalisation_safety_policy_version text,
  add column if not exists personalisation_safety_source_fingerprint text,
  add column if not exists personalisation_safety_enforced_before_generation boolean,
  add column if not exists personalisation_safety_ready_at timestamptz;

-- R5 emits its own state-preserving readiness event.
alter table public.engagement_strategy_events
  drop constraint if exists engagement_strategy_events_event_type_check;
alter table public.engagement_strategy_events
  add constraint engagement_strategy_events_event_type_check check (
    event_type in (
      'CREATED','CLAIMED','TRANSITIONED','RETRY_SCHEDULED','FAILED_TERMINAL','LEASE_RELEASED',
      'CHANNEL_STRATEGY_READY','PERSONALISATION_SAFETY_READY'
    )
  );

create or replace function public.claim_g5_personalisation_safety(
  p_scheduler_run_id uuid,
  p_lease_seconds integer default 180
)
returns table(strategy_id uuid, lease_token uuid, opportunity_id uuid)
language plpgsql security definer set search_path=public as $$
declare
  v_id uuid;
  v_token uuid:=gen_random_uuid();
  v_previous text;
  v_target text;
begin
  perform public.assert_active_pipeline_scheduler_run(p_scheduler_run_id);

  select s.id,s.state,
    case
      when s.state='SELF_REVIEW' then 'SELF_REVIEW'
      when s.state='FAILED_RETRYABLE' and s.previous_state='SELF_REVIEW' then 'SELF_REVIEW'
      else 'STRATEGY_READY'
    end
  into v_id,v_previous,v_target
  from public.engagement_strategies s
  join public.opportunities o on o.id=s.opportunity_id and o.status='APPROVED'
  join public.campaigns c on c.id=s.campaign_id and c.status not in ('PAUSED','ARCHIVED')
  where (
      (s.state='STRATEGY_READY' and s.personalisation_safety_json is null and s.outreach_generation_json is null)
      or
      (s.state='SELF_REVIEW' and s.personalisation_safety_json is null and s.outreach_generation_json is not null)
      or
      (s.state='FAILED_RETRYABLE' and s.failure_stage='PERSONALISATION_SAFETY'
        and coalesce(s.next_retry_at,now())<=now())
      or
      (s.state='FAILED_RETRYABLE' and s.failure_stage='OUTREACH_GENERATION'
        and s.personalisation_safety_json is null and s.outreach_generation_json is null
        and coalesce(s.next_retry_at,now())<=now())
    )
    and s.commercial_reasoning_json is not null
    and s.commercial_reasoning_schema_version='g5-commercial-reasoning/v1'
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
    state=v_target,
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
         v_previous,v_target,v_token,
         jsonb_build_object('attempt',s.attempt_count,'release','G5_R5','worker','PERSONALISATION_SAFETY','statePreserved',v_previous=v_target,'aiRequired',false)
  from public.engagement_strategies s where s.id=v_id;

  return query select s.id,s.lease_token,s.opportunity_id
  from public.engagement_strategies s where s.id=v_id;
end $$;

create or replace function public.get_g5_personalisation_safety_context_owned(
  p_strategy_id uuid,
  p_scheduler_run_id uuid,
  p_lease_token uuid
)
returns table(
  commercial_reasoning_json jsonb,
  source_snapshot_json jsonb
)
language plpgsql security definer set search_path=public as $$
declare v public.engagement_strategies%rowtype;
begin
  perform public.assert_active_pipeline_scheduler_run(p_scheduler_run_id);
  select * into v from public.engagement_strategies where id=p_strategy_id;
  if v.id is null then raise exception 'G5_ENGAGEMENT_MISSING'; end if;
  if v.state not in ('STRATEGY_READY','SELF_REVIEW') then raise exception 'G5_ENGAGEMENT_STATE_CHANGED'; end if;
  if v.scheduler_run_id is distinct from p_scheduler_run_id
     or v.lease_token is distinct from p_lease_token
     or v.lease_expires_at is null or v.lease_expires_at<now() then
    raise exception 'G5_ENGAGEMENT_OWNERSHIP_LOST';
  end if;
  if v.commercial_reasoning_json is null
     or v.commercial_reasoning_schema_version<>'g5-commercial-reasoning/v1'
     or v.commercial_reasoning_source_snapshot_json is null then
    raise exception 'G5_PERSONALISATION_SAFETY_REASONING_MISSING';
  end if;
  if v.channel_strategy_json is null or v.channel_strategy_schema_version<>'g5-channel-strategy/v1' then
    raise exception 'G5_PERSONALISATION_SAFETY_CHANNEL_STRATEGY_MISSING';
  end if;
  if v.personalisation_safety_json is not null then raise exception 'G5_PERSONALISATION_SAFETY_ALREADY_READY'; end if;
  if v.state='STRATEGY_READY' and v.outreach_generation_json is not null then raise exception 'G5_PERSONALISATION_SAFETY_STATE_INCONSISTENT'; end if;
  if v.state='SELF_REVIEW' and v.outreach_generation_json is null then raise exception 'G5_PERSONALISATION_SAFETY_LEGACY_OUTREACH_MISSING'; end if;

  return query select v.commercial_reasoning_json,v.commercial_reasoning_source_snapshot_json;
end $$;

create or replace function public.complete_g5_personalisation_safety_owned(
  p_strategy_id uuid,
  p_scheduler_run_id uuid,
  p_lease_token uuid,
  p_safety_json jsonb,
  p_schema_version text,
  p_policy_version text,
  p_source_fingerprint text
)
returns public.engagement_strategies
language plpgsql security definer set search_path=public as $$
declare
  v public.engagement_strategies%rowtype;
  v_state text;
  v_enforced_before_generation boolean;
begin
  perform public.assert_active_pipeline_scheduler_run(p_scheduler_run_id);
  select * into v from public.engagement_strategies where id=p_strategy_id for update;
  if v.id is null then raise exception 'G5_ENGAGEMENT_MISSING'; end if;
  if v.state not in ('STRATEGY_READY','SELF_REVIEW') then raise exception 'G5_ENGAGEMENT_STATE_CHANGED'; end if;
  if v.scheduler_run_id is distinct from p_scheduler_run_id
     or v.lease_token is distinct from p_lease_token
     or v.lease_expires_at is null or v.lease_expires_at<now() then
    raise exception 'G5_ENGAGEMENT_OWNERSHIP_LOST';
  end if;
  if p_safety_json is null or jsonb_typeof(p_safety_json)<>'object' then
    raise exception 'G5_PERSONALISATION_SAFETY_INVALID';
  end if;
  if coalesce(p_schema_version,'')<>'g5-personalisation-safety/v1'
     or coalesce(p_policy_version,'')<>'g5-personalisation-safety/v1' then
    raise exception 'G5_PERSONALISATION_SAFETY_VERSION_INVALID';
  end if;
  if nullif(trim(coalesce(p_source_fingerprint,'')),'') is null then
    raise exception 'G5_PERSONALISATION_SAFETY_FINGERPRINT_REQUIRED';
  end if;
  if coalesce((p_safety_json->>'immutableG4')::boolean,false) is not true then
    raise exception 'G5_PERSONALISATION_SAFETY_G4_CONTRACT_REQUIRED';
  end if;

  v_state:=v.state;
  v_enforced_before_generation:=v.outreach_generation_json is null;

  update public.engagement_strategies set
    personalisation_safety_json=p_safety_json,
    personalisation_safety_schema_version=p_schema_version,
    personalisation_safety_policy_version=p_policy_version,
    personalisation_safety_source_fingerprint=p_source_fingerprint,
    personalisation_safety_enforced_before_generation=v_enforced_before_generation,
    personalisation_safety_ready_at=now(),
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
    v.organisation_id,v.campaign_id,v.id,v.opportunity_id,p_scheduler_run_id,'PERSONALISATION_SAFETY_READY',
    v_state,v_state,p_lease_token,
    jsonb_build_object(
      'release','G5_R5','worker','PERSONALISATION_SAFETY','schemaVersion',p_schema_version,
      'policyVersion',p_policy_version,'sourceFingerprint',p_source_fingerprint,
      'verifiedFacts',jsonb_array_length(coalesce(p_safety_json->'verifiedFactIds','[]'::jsonb)),
      'commercialInferences',jsonb_array_length(coalesce(p_safety_json->'commercialInferenceIds','[]'::jsonb)),
      'doNotUse',jsonb_array_length(coalesce(p_safety_json->'doNotUseIds','[]'::jsonb)),
      'immutableG4',true,'statePreserved',true,'aiRequired',false,
      'enforcedBeforeGeneration',v_enforced_before_generation
    )
  );

  insert into public.campaign_timeline(
    organisation_id,campaign_id,event_type,title,description,visibility,metadata_json
  ) values(
    v.organisation_id,v.campaign_id,'G5_PERSONALISATION_SAFETY_READY',
    'Personalisation evidence checked',
    case when v_enforced_before_generation
      then 'SalesPilot has separated verified facts, safe commercial inference and claims that must not be used before writing outreach.'
      else 'SalesPilot has backfilled the personalisation safety manifest for outreach generated before the Release 5 gate; independent self-review remains mandatory.'
    end,
    'CUSTOMER',
    jsonb_build_object('strategyId',v.id,'opportunityId',v.opportunity_id,'state',v_state,'enforcedBeforeGeneration',v_enforced_before_generation)
  );

  return v;
end $$;

create or replace function public.fail_g5_personalisation_safety_owned(
  p_strategy_id uuid,
  p_scheduler_run_id uuid,
  p_lease_token uuid,
  p_reason text,
  p_retry_after_seconds integer default 60
)
returns public.engagement_strategies
language plpgsql security definer set search_path=public as $$
declare
  v public.engagement_strategies%rowtype;
  v_state text;
begin
  perform public.assert_active_pipeline_scheduler_run(p_scheduler_run_id);
  select * into v from public.engagement_strategies where id=p_strategy_id for update;
  if v.id is null then raise exception 'G5_ENGAGEMENT_MISSING'; end if;
  if v.state not in ('STRATEGY_READY','SELF_REVIEW') then raise exception 'G5_ENGAGEMENT_STATE_CHANGED'; end if;
  if v.scheduler_run_id is distinct from p_scheduler_run_id
     or v.lease_token is distinct from p_lease_token
     or v.lease_expires_at is null or v.lease_expires_at<now() then
    raise exception 'G5_ENGAGEMENT_OWNERSHIP_LOST';
  end if;

  v_state:=v.state;
  update public.engagement_strategies set
    previous_state=v_state,
    state='FAILED_RETRYABLE',
    failure_stage='PERSONALISATION_SAFETY',
    failure_reason=left(coalesce(p_reason,'G5 personalisation safety failed'),1000),
    next_retry_at=now()+make_interval(secs=>greatest(30,p_retry_after_seconds)),
    lease_token=null,lease_expires_at=null,claimed_at=null,scheduler_run_id=null,updated_at=now()
  where id=p_strategy_id returning * into v;

  insert into public.engagement_strategy_events(
    organisation_id,campaign_id,strategy_id,opportunity_id,scheduler_run_id,event_type,
    previous_state,next_state,lease_token,metadata_json
  ) values(
    v.organisation_id,v.campaign_id,v.id,v.opportunity_id,p_scheduler_run_id,'RETRY_SCHEDULED',
    v_state,'FAILED_RETRYABLE',p_lease_token,
    jsonb_build_object('release','G5_R5','worker','PERSONALISATION_SAFETY','failureStage','PERSONALISATION_SAFETY','reason',left(coalesce(p_reason,''),500),'retryable',true,'resumeState',v_state)
  );

  return v;
end $$;

-- Harden the dedicated R4 claim: outreach cannot begin without the deterministic
-- R5 safety manifest. The R1 lifecycle remains STRATEGY_READY -> GENERATING.
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
    and s.personalisation_safety_json is not null
    and s.personalisation_safety_schema_version='g5-personalisation-safety/v1'
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
         jsonb_build_object('attempt',s.attempt_count,'release','G5_R5','worker','OUTREACH_GENERATION','personalisationSafetyRequired',true,'immutableG4',true)
  from public.engagement_strategies s where s.id=v_id;

  return query select s.id,s.lease_token,s.opportunity_id
  from public.engagement_strategies s where s.id=v_id;
end $$;

drop function if exists public.get_g5_outreach_generation_context_owned(uuid,uuid,uuid);

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
  source_snapshot_json jsonb,
  personalisation_safety_json jsonb
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
  if v.personalisation_safety_json is null or v.personalisation_safety_schema_version<>'g5-personalisation-safety/v1' then
    raise exception 'G5_OUTREACH_PERSONALISATION_SAFETY_MISSING';
  end if;
  if v.outreach_generation_json is not null then raise exception 'G5_OUTREACH_ALREADY_GENERATED'; end if;

  return query select
    v.organisation_id,
    v.campaign_id,
    v.commercial_reasoning_json,
    v.channel_strategy_json,
    v.commercial_reasoning_source_snapshot_json,
    v.personalisation_safety_json;
end $$;

-- Keep the generic R1 claim contract hardened too, even though R4 uses its
-- dedicated claim function. STRATEGY_READY -> GENERATING requires both R3 + R5.
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
      or (
        s.channel_strategy_json is not null
        and s.channel_strategy_schema_version='g5-channel-strategy/v1'
        and s.personalisation_safety_json is not null
        and s.personalisation_safety_schema_version='g5-personalisation-safety/v1'
      )
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



-- R5 changes the generation prompt contract without changing the output shape:
-- schema remains v1, prompt becomes v2 because personalisationBasis now contains
-- auditable R5 manifest item IDs rather than free-text descriptions.
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
     or coalesce(p_prompt_version,'')<>'g5-outreach-generation/v2' then
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
  if v.personalisation_safety_json is null
     or v.personalisation_safety_schema_version<>'g5-personalisation-safety/v1'
     or v.personalisation_safety_enforced_before_generation is distinct from true then
    raise exception 'G5_OUTREACH_PERSONALISATION_SAFETY_NOT_ENFORCED';
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
      'release','G5_R5','worker','OUTREACH_GENERATION','schemaVersion',p_schema_version,
      'promptVersion',p_prompt_version,'model',p_model,'confidence',p_confidence,
      'sourceFingerprint',p_source_fingerprint,
      'personalisationSafetyFingerprint',v.personalisation_safety_source_fingerprint,
      'personalisationSafetyEnforced',true,'immutableG4',true
    )
  );

  insert into public.campaign_timeline(
    organisation_id,campaign_id,event_type,title,description,visibility,metadata_json
  ) values(
    v.organisation_id,v.campaign_id,'G5_OUTREACH_GENERATED',
    'First-touch outreach prepared',
    'SalesPilot has prepared channel-native outreach using only the verified facts and safely framed commercial inferences allowed by the personalisation safety policy. Independent AI self-review is next.',
    'CUSTOMER',
    jsonb_build_object('strategyId',v.id,'opportunityId',v.opportunity_id,'confidence',p_confidence,'nextState','SELF_REVIEW','personalisationSafetyEnforced',true)
  );

  return v;
end $$;

revoke all on function public.claim_g5_personalisation_safety(uuid,integer) from public,anon,authenticated;
revoke all on function public.get_g5_personalisation_safety_context_owned(uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function public.complete_g5_personalisation_safety_owned(uuid,uuid,uuid,jsonb,text,text,text) from public,anon,authenticated;
revoke all on function public.fail_g5_personalisation_safety_owned(uuid,uuid,uuid,text,integer) from public,anon,authenticated;
grant execute on function public.claim_g5_personalisation_safety(uuid,integer) to service_role;
grant execute on function public.get_g5_personalisation_safety_context_owned(uuid,uuid,uuid) to service_role;
grant execute on function public.complete_g5_personalisation_safety_owned(uuid,uuid,uuid,jsonb,text,text,text) to service_role;
grant execute on function public.fail_g5_personalisation_safety_owned(uuid,uuid,uuid,text,integer) to service_role;
grant execute on function public.get_g5_outreach_generation_context_owned(uuid,uuid,uuid) to service_role;

comment on column public.engagement_strategies.personalisation_safety_json is
'G5 R5 deterministic personalisation manifest: VERIFIED_FACT, COMMERCIAL_INFERENCE, DO_NOT_USE. Derived from R2 reasoning and verified against the immutable G4 source snapshot before R4 outreach generation.';
