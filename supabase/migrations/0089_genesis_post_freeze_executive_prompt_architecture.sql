-- Genesis post-freeze Executive Prompt Architecture
-- Prompt-contract only. Schemas and G4/G5 state-machine semantics remain unchanged.
-- Allows the new executive prompt versions to persist through the existing fenced completion RPCs.

create or replace function public.complete_g5_commercial_reasoning_owned(
  p_strategy_id uuid,
  p_scheduler_run_id uuid,
  p_lease_token uuid,
  p_reasoning_json jsonb,
  p_schema_version text,
  p_prompt_version text,
  p_model text,
  p_confidence integer,
  p_source_fingerprint text,
  p_source_snapshot_json jsonb
)
returns public.engagement_strategies
language plpgsql security definer set search_path=public as $$
declare v public.engagement_strategies%rowtype;
begin
  perform public.assert_active_pipeline_scheduler_run(p_scheduler_run_id);
  select * into v from public.engagement_strategies where id=p_strategy_id for update;
  if v.id is null then raise exception 'G5_ENGAGEMENT_MISSING'; end if;
  if v.state<>'REASONING' then raise exception 'G5_ENGAGEMENT_STATE_CHANGED'; end if;
  if v.scheduler_run_id is distinct from p_scheduler_run_id
     or v.lease_token is distinct from p_lease_token
     or v.lease_expires_at is null or v.lease_expires_at<now() then
    raise exception 'G5_ENGAGEMENT_OWNERSHIP_LOST';
  end if;
  if p_reasoning_json is null or jsonb_typeof(p_reasoning_json)<>'object' then
    raise exception 'G5_COMMERCIAL_REASONING_INVALID';
  end if;
  if coalesce(p_schema_version,'')<>'g5-commercial-reasoning/v1'
     or coalesce(p_prompt_version,'')<>'g5-commercial-reasoning/v2-executive-deal-strategy' then
    raise exception 'G5_COMMERCIAL_REASONING_VERSION_INVALID';
  end if;
  if p_confidence is null or p_confidence<0 or p_confidence>100 then
    raise exception 'G5_COMMERCIAL_REASONING_CONFIDENCE_INVALID';
  end if;
  if nullif(trim(coalesce(p_source_fingerprint,'')),'') is null then
    raise exception 'G5_COMMERCIAL_REASONING_SOURCE_FINGERPRINT_REQUIRED';
  end if;

  update public.engagement_strategies set
    previous_state='REASONING',
    state='STRATEGY_READY',
    commercial_reasoning_json=p_reasoning_json,
    commercial_reasoning_schema_version=p_schema_version,
    commercial_reasoning_prompt_version=p_prompt_version,
    commercial_reasoning_model=nullif(trim(coalesce(p_model,'')),''),
    commercial_reasoning_confidence=p_confidence,
    commercial_reasoning_source_fingerprint=p_source_fingerprint,
    commercial_reasoning_source_snapshot_json=p_source_snapshot_json,
    reasoned_at=now(),
    lease_token=null,
    lease_expires_at=null,
    claimed_at=null,
    scheduler_run_id=null,
    failure_stage=null,
    failure_reason=null,
    next_retry_at=null,
    updated_at=now()
  where id=p_strategy_id
  returning * into v;

  insert into public.engagement_strategy_events(
    organisation_id,campaign_id,strategy_id,opportunity_id,scheduler_run_id,event_type,
    previous_state,next_state,lease_token,metadata_json
  ) values(
    v.organisation_id,v.campaign_id,v.id,v.opportunity_id,p_scheduler_run_id,'TRANSITIONED',
    'REASONING','STRATEGY_READY',p_lease_token,
    jsonb_build_object(
      'release','G5_R2',
      'worker','COMMERCIAL_REASONING',
      'schemaVersion',p_schema_version,
      'promptVersion',p_prompt_version,
      'model',p_model,
      'confidence',p_confidence,
      'sourceFingerprint',p_source_fingerprint,
      'immutableG4',true
    )
  );

  insert into public.campaign_timeline(
    organisation_id,campaign_id,event_type,title,description,visibility,metadata_json
  ) values(
    v.organisation_id,v.campaign_id,'G5_COMMERCIAL_REASONING_READY',
    'Commercial argument ready',
    'SalesPilot has converted the approved opportunity intelligence into an evidence-backed commercial argument.',
    'CUSTOMER',
    jsonb_build_object('strategyId',v.id,'opportunityId',v.opportunity_id,'confidence',p_confidence)
  );

  return v;
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
     or coalesce(p_prompt_version,'')<>'g5-channel-strategy/v2-vp-sales-development' then
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
    'SalesPilot has selected the strongest evidence-backed first engagement route and safe alternatives.',
    'CUSTOMER',
    jsonb_build_object('strategyId',v.id,'opportunityId',v.opportunity_id,'confidence',p_confidence)
  );

  return v;
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
     or coalesce(p_prompt_version,'')<>'g5-outreach-generation/v4-executive-communications' then
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

revoke all on function public.complete_g5_commercial_reasoning_owned(uuid,uuid,uuid,jsonb,text,text,text,integer,text,jsonb) from public,anon,authenticated;
grant execute on function public.complete_g5_commercial_reasoning_owned(uuid,uuid,uuid,jsonb,text,text,text,integer,text,jsonb) to service_role;

revoke all on function public.complete_g5_channel_strategy_owned(uuid,uuid,uuid,jsonb,text,text,text,integer,text) from public,anon,authenticated;
grant execute on function public.complete_g5_channel_strategy_owned(uuid,uuid,uuid,jsonb,text,text,text,integer,text) to service_role;

revoke all on function public.complete_g5_outreach_generation_owned(uuid,uuid,uuid,jsonb,text,text,text,integer,text) from public,anon,authenticated;
grant execute on function public.complete_g5_outreach_generation_owned(uuid,uuid,uuid,jsonb,text,text,text,integer,text) to service_role;
