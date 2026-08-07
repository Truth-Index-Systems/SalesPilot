-- SalesPilot Genesis G5 — Release 8: Assisted Approval Workspace
-- Human approval consumes the frozen R2-R7 strategy. It never modifies G4 truth.
-- Queueing/sending remain deliberately disabled until Release 9.

alter table public.engagement_strategies
  add column if not exists human_reviewed_at timestamptz,
  add column if not exists human_reviewed_by uuid,
  add column if not exists human_review_note text,
  add column if not exists human_review_action text,
  add column if not exists human_edit_count integer not null default 0 check (human_edit_count >= 0),
  add column if not exists human_route_override_json jsonb;

alter table public.engagement_strategy_events drop constraint if exists engagement_strategy_events_event_type_check;
alter table public.engagement_strategy_events add constraint engagement_strategy_events_event_type_check check (event_type in (
  'CREATED','CLAIMED','TRANSITIONED','RETRY_SCHEDULED','FAILED_TERMINAL','LEASE_RELEASED',
  'CHANNEL_STRATEGY_READY','PERSONALISATION_SAFETY_READY','SELF_REVIEW_PASS','SELF_REVIEW_REWRITE','SELF_REVIEW_BLOCK',
  'ENGAGEMENT_QUALITY_SCORED','HUMAN_APPROVED','HUMAN_EDITED','HUMAN_REJECTED','HUMAN_ROUTE_CHANGED'
));

create or replace function public.review_g5_engagement_strategy(
  p_organisation_id uuid,
  p_user_id uuid,
  p_strategy_id uuid,
  p_action text,
  p_note text default null,
  p_edit_json jsonb default null
)
returns public.engagement_strategies
language plpgsql security definer set search_path=public as $$
declare
  v public.engagement_strategies%rowtype;
  v_channel text;
  v_content jsonb;
  v_body text;
  v_subject text;
  v_cta text;
  v_old_primary jsonb;
  v_new_primary jsonb;
  v_old_secondary jsonb;
  v_old_fallback jsonb;
begin
  if p_action not in ('APPROVE','EDIT','REJECT','TRY_SECONDARY_ROUTE') then
    raise exception 'G5_INVALID_HUMAN_REVIEW_ACTION';
  end if;
  if not exists (
    select 1 from public.organisation_memberships m
    where m.organisation_id=p_organisation_id and m.user_id=p_user_id and m.status='ACTIVE' and m.role<>'VIEWER'
  ) then raise exception 'G5_HUMAN_REVIEW_FORBIDDEN'; end if;

  select * into v from public.engagement_strategies
  where id=p_strategy_id and organisation_id=p_organisation_id for update;
  if v.id is null then raise exception 'G5_ENGAGEMENT_MISSING'; end if;
  if v.state not in ('READY_FOR_APPROVAL','APPROVED') then raise exception 'G5_ENGAGEMENT_NOT_APPROVABLE'; end if;
  if v.state='APPROVED' and p_action<>'APPROVE' then raise exception 'G5_ENGAGEMENT_ALREADY_APPROVED'; end if;
  if v.engagement_quality_json is null or v.engagement_confidence is null or v.self_review_outcome<>'PASS' then
    raise exception 'G5_ENGAGEMENT_QUALITY_REQUIRED';
  end if;

  if p_action='APPROVE' then
    if v.state='APPROVED' then return v; end if;
    update public.engagement_strategies set
      previous_state='READY_FOR_APPROVAL', state='APPROVED',
      human_reviewed_at=now(), human_reviewed_by=p_user_id,
      human_review_note=nullif(trim(coalesce(p_note,'')),''), human_review_action='APPROVE',
      lease_token=null,lease_expires_at=null,claimed_at=null,scheduler_run_id=null,updated_at=now()
    where id=v.id returning * into v;

    insert into public.engagement_strategy_events(organisation_id,campaign_id,strategy_id,opportunity_id,event_type,previous_state,next_state,metadata_json)
    values(v.organisation_id,v.campaign_id,v.id,v.opportunity_id,'HUMAN_APPROVED','READY_FOR_APPROVAL','APPROVED',jsonb_build_object('release','G5_R8','userId',p_user_id,'note',nullif(trim(coalesce(p_note,'')),''),'engagementConfidence',v.engagement_confidence,'queueActivated',false,'immutableG4',true));
    insert into public.campaign_timeline(organisation_id,campaign_id,event_type,title,description,visibility,metadata_json)
    values(v.organisation_id,v.campaign_id,'G5_ENGAGEMENT_APPROVED','Engagement approved','The first-touch strategy has been approved. Execution remains locked until the queue release is active.','CUSTOMER',jsonb_build_object('strategyId',v.id,'opportunityId',v.opportunity_id,'engagementConfidence',v.engagement_confidence,'queueActivated',false));
    return v;
  end if;

  if p_action='EDIT' then
    if p_edit_json is null or jsonb_typeof(p_edit_json)<>'object' then raise exception 'G5_EDIT_REQUIRED'; end if;
    v_channel:=v.outreach_generation_json->>'channel';
    v_body:=nullif(trim(coalesce(p_edit_json->>'body','')),'');
    v_subject:=nullif(trim(coalesce(p_edit_json->>'subject','')),'');
    v_cta:=nullif(trim(coalesce(p_edit_json->>'callToAction','')),'');
    if v_body is null or v_cta is null then raise exception 'G5_EDIT_INVALID'; end if;
    v_content:=coalesce(v.outreach_generation_json->'content','{}'::jsonb);
    if v_channel='EMAIL' then
      v_content:=jsonb_set(v_content,'{emailBody}',to_jsonb(v_body),true);
      v_content:=jsonb_set(v_content,'{subject}',case when v_subject is null then 'null'::jsonb else to_jsonb(v_subject) end,true);
    elsif v_channel='LINKEDIN' then
      v_content:=jsonb_set(v_content,'{linkedinMessage}',to_jsonb(v_body),true);
    elsif v_channel='SWITCHBOARD' then
      v_content:=jsonb_set(v_content,'{switchboardOpening}',to_jsonb(v_body),true);
    elsif v_channel='REFERRAL' then
      v_content:=jsonb_set(v_content,'{referralRequest}',to_jsonb(v_body),true);
    else raise exception 'G5_EDIT_CHANNEL_UNSUPPORTED'; end if;

    update public.engagement_strategies set
      previous_state='READY_FOR_APPROVAL', state='FAILED_RETRYABLE', failure_stage='SELF_REVIEW',
      failure_reason='Human edited outreach requires mandatory self review', next_retry_at=now(),
      outreach_generation_json=jsonb_set(jsonb_set(outreach_generation_json,'{content}',v_content,true),'{callToAction}',to_jsonb(v_cta),true),
      self_review_json=null,self_review_schema_version=null,self_review_prompt_version=null,self_review_model=null,self_review_outcome=null,self_review_confidence=null,self_review_source_fingerprint=null,self_reviewed_at=null,
      engagement_quality_json=null,engagement_quality_schema_version=null,engagement_quality_policy_version=null,engagement_confidence=null,engagement_quality_source_fingerprint=null,engagement_quality_scored_at=null,
      human_reviewed_at=now(),human_reviewed_by=p_user_id,human_review_note=nullif(trim(coalesce(p_note,'')),''),human_review_action='EDIT',human_edit_count=human_edit_count+1,
      lease_token=null,lease_expires_at=null,claimed_at=null,scheduler_run_id=null,updated_at=now()
    where id=v.id returning * into v;
    insert into public.engagement_strategy_events(organisation_id,campaign_id,strategy_id,opportunity_id,event_type,previous_state,next_state,metadata_json)
    values(v.organisation_id,v.campaign_id,v.id,v.opportunity_id,'HUMAN_EDITED','READY_FOR_APPROVAL','FAILED_RETRYABLE',jsonb_build_object('release','G5_R8','userId',p_user_id,'nextWorker','SELF_REVIEW','mandatoryRecheck',true,'immutableG4',true));
    return v;
  end if;

  if p_action='TRY_SECONDARY_ROUTE' then
    v_old_primary:=v.channel_strategy_json->'primary';
    v_old_secondary:=v.channel_strategy_json->'secondary';
    v_old_fallback:=v.channel_strategy_json->'fallback';
    if v_old_secondary is null or v_old_secondary='null'::jsonb then raise exception 'G5_SECONDARY_ROUTE_UNAVAILABLE'; end if;
    v_new_primary:=v_old_secondary;
    update public.engagement_strategies set
      previous_state='READY_FOR_APPROVAL',state='FAILED_RETRYABLE',failure_stage='OUTREACH_GENERATION',failure_reason='Human requested secondary commercial route',next_retry_at=now(),
      human_route_override_json=jsonb_set(jsonb_set(channel_strategy_json,'{primary}',v_new_primary,true),'{secondary}',v_old_primary,true),
      outreach_generation_json=null,outreach_generation_schema_version=null,outreach_generation_prompt_version=null,outreach_generation_model=null,outreach_generation_confidence=null,outreach_generation_source_fingerprint=null,outreach_generated_at=null,outreach_rewrite_instruction_json=null,
      self_review_json=null,self_review_schema_version=null,self_review_prompt_version=null,self_review_model=null,self_review_outcome=null,self_review_confidence=null,self_review_source_fingerprint=null,self_reviewed_at=null,rewrite_count=0,
      engagement_quality_json=null,engagement_quality_schema_version=null,engagement_quality_policy_version=null,engagement_confidence=null,engagement_quality_source_fingerprint=null,engagement_quality_scored_at=null,
      human_reviewed_at=now(),human_reviewed_by=p_user_id,human_review_note=nullif(trim(coalesce(p_note,'')),''),human_review_action='TRY_SECONDARY_ROUTE',
      lease_token=null,lease_expires_at=null,claimed_at=null,scheduler_run_id=null,updated_at=now()
    where id=v.id returning * into v;
    insert into public.engagement_strategy_events(organisation_id,campaign_id,strategy_id,opportunity_id,event_type,previous_state,next_state,metadata_json)
    values(v.organisation_id,v.campaign_id,v.id,v.opportunity_id,'HUMAN_ROUTE_CHANGED','READY_FOR_APPROVAL','FAILED_RETRYABLE',jsonb_build_object('release','G5_R8','userId',p_user_id,'previousPrimaryRouteId',v_old_primary->>'routeId','newPrimaryRouteId',v_new_primary->>'routeId','g4Rediscovery',false,'nextWorker','OUTREACH_GENERATION','immutableG4',true));
    return v;
  end if;

  update public.engagement_strategies set
    previous_state='READY_FOR_APPROVAL',state='FAILED_TERMINAL',failure_stage='HUMAN_REJECTED',failure_reason=coalesce(nullif(trim(coalesce(p_note,'')),''),'Human rejected engagement'),next_retry_at=null,
    human_reviewed_at=now(),human_reviewed_by=p_user_id,human_review_note=nullif(trim(coalesce(p_note,'')),''),human_review_action='REJECT',
    lease_token=null,lease_expires_at=null,claimed_at=null,scheduler_run_id=null,updated_at=now()
  where id=v.id returning * into v;
  insert into public.engagement_strategy_events(organisation_id,campaign_id,strategy_id,opportunity_id,event_type,previous_state,next_state,metadata_json)
  values(v.organisation_id,v.campaign_id,v.id,v.opportunity_id,'HUMAN_REJECTED','READY_FOR_APPROVAL','FAILED_TERMINAL',jsonb_build_object('release','G5_R8','userId',p_user_id,'note',nullif(trim(coalesce(p_note,'')),''),'immutableG4',true));
  return v;
end $$;

revoke all on function public.review_g5_engagement_strategy(uuid,uuid,uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.review_g5_engagement_strategy(uuid,uuid,uuid,text,text,jsonb) to service_role;

-- R8 deliberately removes scheduler-owned generic approval as a bypass. Approval is human-scoped here.
-- APPROVED -> QUEUED remains present in the canonical state model but no R8 code claims or executes it.


-- Preserve the original R3 recommendation. R4/R6/R7 consume a human route override
-- only when one exists; the canonical channel_strategy_json remains untouched.
drop function if exists public.get_g5_outreach_generation_context_owned(uuid,uuid,uuid);
create or replace function public.get_g5_outreach_generation_context_owned(p_strategy_id uuid,p_scheduler_run_id uuid,p_lease_token uuid)
returns table(organisation_id uuid,campaign_id uuid,commercial_reasoning_json jsonb,channel_strategy_json jsonb,source_snapshot_json jsonb,personalisation_safety_json jsonb,rewrite_instruction_json jsonb)
language plpgsql security definer set search_path=public as $$
declare v public.engagement_strategies%rowtype;
begin
 perform public.assert_active_pipeline_scheduler_run(p_scheduler_run_id); select * into v from public.engagement_strategies where id=p_strategy_id;
 if v.id is null then raise exception 'G5_ENGAGEMENT_MISSING'; end if; if v.state<>'GENERATING' then raise exception 'G5_ENGAGEMENT_STATE_CHANGED'; end if;
 if v.scheduler_run_id is distinct from p_scheduler_run_id or v.lease_token is distinct from p_lease_token or v.lease_expires_at is null or v.lease_expires_at<now() then raise exception 'G5_ENGAGEMENT_OWNERSHIP_LOST'; end if;
 if v.commercial_reasoning_json is null or v.channel_strategy_json is null or v.personalisation_safety_json is null then raise exception 'G5_OUTREACH_CONTEXT_MISSING'; end if;
 if v.outreach_generation_json is not null then raise exception 'G5_OUTREACH_ALREADY_GENERATED'; end if;
 return query select v.organisation_id,v.campaign_id,v.commercial_reasoning_json,coalesce(v.human_route_override_json,v.channel_strategy_json),v.commercial_reasoning_source_snapshot_json,v.personalisation_safety_json,v.outreach_rewrite_instruction_json;
end $$;

create or replace function public.get_g5_self_review_context_owned(p_strategy_id uuid,p_scheduler_run_id uuid,p_lease_token uuid)
returns table(organisation_id uuid,campaign_id uuid,commercial_reasoning_json jsonb,channel_strategy_json jsonb,source_snapshot_json jsonb,personalisation_safety_json jsonb,outreach_generation_json jsonb,rewrite_count integer)
language plpgsql security definer set search_path=public as $$
declare v public.engagement_strategies%rowtype;
begin
  perform public.assert_active_pipeline_scheduler_run(p_scheduler_run_id); select * into v from public.engagement_strategies where id=p_strategy_id;
  if v.id is null then raise exception 'G5_ENGAGEMENT_MISSING'; end if; if v.state<>'SELF_REVIEW' then raise exception 'G5_ENGAGEMENT_STATE_CHANGED'; end if;
  if v.scheduler_run_id is distinct from p_scheduler_run_id or v.lease_token is distinct from p_lease_token or v.lease_expires_at is null or v.lease_expires_at<now() then raise exception 'G5_ENGAGEMENT_OWNERSHIP_LOST'; end if;
  if v.outreach_generation_json is null then raise exception 'G5_SELF_REVIEW_OUTREACH_MISSING'; end if; if v.personalisation_safety_json is null then raise exception 'G5_SELF_REVIEW_SAFETY_MISSING'; end if;
  return query select v.organisation_id,v.campaign_id,v.commercial_reasoning_json,coalesce(v.human_route_override_json,v.channel_strategy_json),v.commercial_reasoning_source_snapshot_json,v.personalisation_safety_json,v.outreach_generation_json,v.rewrite_count;
end $$;

create or replace function public.get_g5_engagement_quality_context_owned(p_strategy_id uuid,p_scheduler_run_id uuid,p_lease_token uuid)
returns table(self_review_json jsonb,self_review_outcome text,self_review_confidence integer,channel_strategy_json jsonb,personalisation_safety_json jsonb,rewrite_count integer)
language plpgsql security definer set search_path=public as $$
declare v public.engagement_strategies%rowtype;
begin
  perform public.assert_active_pipeline_scheduler_run(p_scheduler_run_id); select * into v from public.engagement_strategies where id=p_strategy_id;
  if v.id is null then raise exception 'G5_ENGAGEMENT_MISSING'; end if; if v.state<>'READY_FOR_APPROVAL' then raise exception 'G5_ENGAGEMENT_STATE_CHANGED'; end if;
  if v.scheduler_run_id is distinct from p_scheduler_run_id or v.lease_token is distinct from p_lease_token or v.lease_expires_at is null or v.lease_expires_at<now() then raise exception 'G5_ENGAGEMENT_OWNERSHIP_LOST'; end if;
  if v.self_review_outcome<>'PASS' or v.self_review_json is null or v.channel_strategy_json is null or v.personalisation_safety_json is null or v.outreach_generation_json is null then raise exception 'G5_ENGAGEMENT_QUALITY_CONTEXT_INVALID'; end if;
  return query select v.self_review_json,v.self_review_outcome,v.self_review_confidence,coalesce(v.human_route_override_json,v.channel_strategy_json),v.personalisation_safety_json,v.rewrite_count;
end $$;

revoke all on function public.get_g5_outreach_generation_context_owned(uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function public.get_g5_self_review_context_owned(uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function public.get_g5_engagement_quality_context_owned(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.get_g5_outreach_generation_context_owned(uuid,uuid,uuid) to service_role;
grant execute on function public.get_g5_self_review_context_owned(uuid,uuid,uuid) to service_role;
grant execute on function public.get_g5_engagement_quality_context_owned(uuid,uuid,uuid) to service_role;

-- Remove the scheduler-generic READY_FOR_APPROVAL -> APPROVED path. R8 approval
-- must carry an authenticated workspace user through review_g5_engagement_strategy.
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
  if p_expected_state='READY_FOR_APPROVAL' and p_next_state='APPROVED' then raise exception 'G5_HUMAN_APPROVAL_REQUIRED'; end if;
  if not ((p_expected_state='REASONING' and p_next_state='STRATEGY_READY') or (p_expected_state='GENERATING' and p_next_state='SELF_REVIEW') or (p_expected_state='SELF_REVIEW' and p_next_state='READY_FOR_APPROVAL') or (p_expected_state='APPROVED' and p_next_state='QUEUED') or (p_expected_state='QUEUED' and p_next_state='SENT')) then raise exception 'G5_INVALID_STATE_TRANSITION'; end if;
  v_prev:=v.state;
  update public.engagement_strategies set previous_state=v_prev,state=p_next_state,lease_token=null,lease_expires_at=null,claimed_at=null,scheduler_run_id=null,updated_at=now(),completed_at=case when p_next_state='SENT' then now() else completed_at end where id=p_strategy_id returning * into v;
  insert into public.engagement_strategy_events(organisation_id,campaign_id,strategy_id,opportunity_id,scheduler_run_id,event_type,previous_state,next_state,lease_token,metadata_json) values(v.organisation_id,v.campaign_id,v.id,v.opportunity_id,p_scheduler_run_id,'TRANSITIONED',v_prev,p_next_state,p_lease_token,coalesce(p_metadata,'{}'::jsonb));
  return v;
end $$;
