-- MarketRoute Genesis G5 — Release 2: Commercial Reasoning Engine
-- G4 remains immutable. This migration only extends the canonical G5 engagement
-- strategy authority and reads approved G4 opportunity truth through the frozen
-- opportunity_detail / campaign / business profile contracts.

alter table public.engagement_strategies
  add column if not exists commercial_reasoning_json jsonb,
  add column if not exists commercial_reasoning_schema_version text,
  add column if not exists commercial_reasoning_prompt_version text,
  add column if not exists commercial_reasoning_model text,
  add column if not exists commercial_reasoning_confidence integer
    check (commercial_reasoning_confidence between 0 and 100),
  add column if not exists commercial_reasoning_source_fingerprint text,
  add column if not exists commercial_reasoning_source_snapshot_json jsonb,
  add column if not exists reasoned_at timestamptz;

create or replace function public.get_g5_commercial_reasoning_context_owned(
  p_strategy_id uuid,
  p_scheduler_run_id uuid,
  p_lease_token uuid
)
returns table(organisation_id uuid,campaign_id uuid,context_json jsonb)
language plpgsql security definer set search_path=public as $$
declare v public.engagement_strategies%rowtype;
begin
  perform public.assert_active_pipeline_scheduler_run(p_scheduler_run_id);
  select * into v from public.engagement_strategies where id=p_strategy_id;
  if v.id is null then raise exception 'G5_ENGAGEMENT_MISSING'; end if;
  if v.state<>'REASONING' then raise exception 'G5_ENGAGEMENT_STATE_CHANGED'; end if;
  if v.scheduler_run_id is distinct from p_scheduler_run_id
     or v.lease_token is distinct from p_lease_token
     or v.lease_expires_at is null or v.lease_expires_at<now() then
    raise exception 'G5_ENGAGEMENT_OWNERSHIP_LOST';
  end if;

  return query
  select v.organisation_id,v.campaign_id,
    jsonb_build_object(
      'contract',jsonb_build_object(
        'version','g4-to-g5-opportunity/v1',
        'g4Immutable',true,
        'instruction','Consume only. Never rediscover or mutate G4 truth.'
      ),
      'businessDna',jsonb_build_object(
        'profileId',bp.id,
        'companyName',bp.company_name,
        'summary',bp.summary,
        'industry',bp.industry,
        'confidence',bp.confidence,
        'payload',bpv.payload_json
      ),
      'campaign',jsonb_build_object(
        'id',ca.id,
        'name',ca.name,
        'objective',ca.objective,
        'automationMode',ca.automation_mode,
        'fitScore',ca.fit_score,
        'audience',cfg.audience,
        'buyerRoles',cfg.buyer_roles_json,
        'messageAngle',cfg.message_angle,
        'why',cfg.why_json
      ),
      'opportunity',to_jsonb(od)
    )
  from public.opportunity_detail od
  join public.campaigns ca on ca.id=od.campaign_id and ca.organisation_id=od.organisation_id
  join public.campaign_config_versions cfg on cfg.campaign_id=ca.id and cfg.version_number=ca.current_config_version
  join public.business_profiles bp on bp.id=ca.business_profile_id and bp.organisation_id=ca.organisation_id
  left join lateral (
    select bver.payload_json
    from public.business_profile_versions bver
    where bver.business_profile_id=bp.id
    order by bver.version_number desc
    limit 1
  ) bpv on true
  where od.id=v.opportunity_id
    and od.organisation_id=v.organisation_id
    and od.campaign_id=v.campaign_id
    and od.status='APPROVED';
end $$;

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
     or coalesce(p_prompt_version,'')<>'g5-commercial-reasoning/v1' then
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
    'MarketRoute has converted the approved opportunity intelligence into an evidence-backed commercial argument.',
    'CUSTOMER',
    jsonb_build_object('strategyId',v.id,'opportunityId',v.opportunity_id,'confidence',p_confidence)
  );

  return v;
end $$;

revoke all on function public.get_g5_commercial_reasoning_context_owned(uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function public.complete_g5_commercial_reasoning_owned(uuid,uuid,uuid,jsonb,text,text,text,integer,text,jsonb) from public,anon,authenticated;
grant execute on function public.get_g5_commercial_reasoning_context_owned(uuid,uuid,uuid) to service_role;
grant execute on function public.complete_g5_commercial_reasoning_owned(uuid,uuid,uuid,jsonb,text,text,text,integer,text,jsonb) to service_role;

comment on column public.engagement_strategies.commercial_reasoning_json is
'G5 R2 canonical commercial argument derived from immutable G4 opportunity truth. It does not own or mutate G4 facts.';
comment on column public.engagement_strategies.commercial_reasoning_source_snapshot_json is
'Exact immutable G4 input snapshot consumed by G5 commercial reasoning for auditability and later reproducibility.';
