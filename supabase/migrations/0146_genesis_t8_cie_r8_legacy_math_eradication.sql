-- CIE-R8 Legacy Mathematical Eradication + Freeze Candidate.
-- Numeric engagement confidence remains telemetry only and may not gate execution.
drop function if exists public.run_g5_autopilot_approval_owned(uuid,integer);
create function public.run_g5_autopilot_approval_owned(p_scheduler_run_id uuid)
returns table(inspected integer,approved integer,held integer,reason text,strategy_id uuid,engagement_confidence integer)
language plpgsql security definer set search_path=public as $$
declare
  s public.engagement_strategies%rowtype; o public.opportunities%rowtype; c public.campaigns%rowtype;
  r public.commercial_routes%rowtype; r4 public.cie_r4_commercial_decisions%rowtype; r6 public.cie_r6_contact_decisions%rowtype;
  v_route_id uuid; v_channel text; v_expected_channel text;
begin
  perform public.assert_active_pipeline_scheduler_run(p_scheduler_run_id);
  select x.* into s from public.engagement_strategies x
  join public.campaigns ca on ca.id=x.campaign_id and ca.organisation_id=x.organisation_id
  where x.state='READY_FOR_APPROVAL' and lower(coalesce(ca.automation_mode,''))='autopilot'
    and ca.status not in ('PAUSED','ARCHIVED') and x.self_review_outcome='PASS'
    and x.self_review_json is not null and x.personalisation_safety_json is not null
    and x.engagement_quality_json is not null and x.outreach_generation_json is not null
    and x.channel_strategy_json is not null and x.autopilot_approved_at is null
    and (x.lease_expires_at is null or x.lease_expires_at<now())
  order by x.updated_at,x.created_at for update of x skip locked limit 1;
  if s.id is null then return query select 0,0,0,null::text,null::uuid,null::integer; return; end if;

  select * into o from public.opportunities where id=s.opportunity_id and organisation_id=s.organisation_id and campaign_id=s.campaign_id;
  select * into c from public.campaigns where id=s.campaign_id and organisation_id=s.organisation_id;
  select * into r4 from public.cie_r4_commercial_decisions where opportunity_id=s.opportunity_id and disposition='COMMERCIAL_CANDIDATE' and authority_mode='AUTHORITATIVE';
  select * into r6 from public.cie_r6_contact_decisions where opportunity_id=s.opportunity_id and applied_at is not null and authority_mode='AUTHORITATIVE';
  if o.id is null or o.status<>'APPROVED' or c.id is null or r4.opportunity_id is null or r6.opportunity_id is null then
    return query select 1,0,1,'CIE_AUTHORITY_NOT_EXECUTABLE',s.id,s.engagement_confidence; return;
  end if;
  if coalesce(s.channel_strategy_json->>'promptVersion','') <> 'cie-r5-route-authority/v1' then
    return query select 1,0,1,'ROUTE_NOT_CIE_AUTHORISED',s.id,s.engagement_confidence; return;
  end if;
  begin v_route_id:=nullif(coalesce(s.human_route_override_json,s.channel_strategy_json)#>>'{primary,routeId}','')::uuid;
  exception when invalid_text_representation then return query select 1,0,1,'ROUTE_ID_INVALID',s.id,s.engagement_confidence; return; end;
  v_channel:=upper(coalesce(coalesce(s.human_route_override_json,s.channel_strategy_json)#>>'{primary,executionChannel}',''));
  select * into r from public.commercial_routes where id=v_route_id and organisation_id=s.organisation_id and campaign_id=s.campaign_id and company_id=o.company_id;
  v_expected_channel:=public.g5_execution_channel_for_route_type(r.channel_type);
  if r.id is null or not r.is_viable or v_expected_channel is null or v_expected_channel<>v_channel or nullif(trim(coalesce(r.channel_value,'')),'') is null then
    return query select 1,0,1,'ROUTE_NOT_REACHABLE',s.id,s.engagement_confidence; return;
  end if;

  update public.engagement_strategies set previous_state='READY_FOR_APPROVAL',state='APPROVED',autopilot_approved_at=now(),
    autopilot_policy_version='cie-r8-categorical/v1',autopilot_confidence_threshold=null,
    lease_token=null,lease_expires_at=null,claimed_at=null,scheduler_run_id=null,updated_at=now()
  where id=s.id and state='READY_FOR_APPROVAL' returning * into s;
  if s.id is null then return query select 1,0,1,'STATE_CHANGED',null::uuid,null::integer; return; end if;
  insert into public.engagement_strategy_events(organisation_id,campaign_id,strategy_id,opportunity_id,scheduler_run_id,event_type,previous_state,next_state,metadata_json)
  values(s.organisation_id,s.campaign_id,s.id,s.opportunity_id,p_scheduler_run_id,'AUTO_APPROVED','READY_FOR_APPROVAL','APPROVED',
    jsonb_build_object('release','CIE-R8','policyVersion','cie-r8-categorical/v1','engagementConfidenceTelemetry',s.engagement_confidence,'routeId',r.id,'channel',v_channel,'cieR4',true,'cieR6',true,'selfReviewOutcome','PASS'));
  return query select 1,1,0,'APPROVED',s.id,s.engagement_confidence;
end $$;
revoke all on function public.run_g5_autopilot_approval_owned(uuid) from public,anon,authenticated;
grant execute on function public.run_g5_autopilot_approval_owned(uuid) to service_role;

-- Queue eligibility depends on completed categorical quality, not a numeric score.
create or replace function public.cie_r8_assert_no_legacy_math_authority()
returns void language plpgsql security definer set search_path=public as $$
begin
  if exists(select 1 from public.opportunities where status='READY' and opportunity_score is not null) then
    raise exception 'CIE_R8_LEGACY_OPPORTUNITY_SCORE_ON_READY';
  end if;
end $$;
revoke all on function public.cie_r8_assert_no_legacy_math_authority() from public,anon,authenticated;
grant execute on function public.cie_r8_assert_no_legacy_math_authority() to service_role;
