-- MarketRoute Genesis G5 — Release 12: Autopilot Mode
-- Autopilot removes only the human approval click. It does not bypass any R2-R9 gate.
-- G4 remains immutable. R6 PASS, R7 quality, live route/reachability and R9 execution policy remain mandatory.

alter table public.engagement_strategies
  add column if not exists autopilot_approved_at timestamptz,
  add column if not exists autopilot_policy_version text,
  add column if not exists autopilot_confidence_threshold integer check (autopilot_confidence_threshold between 0 and 100);

alter table public.engagement_strategy_events drop constraint if exists engagement_strategy_events_event_type_check;
alter table public.engagement_strategy_events add constraint engagement_strategy_events_event_type_check check (event_type in (
  'CREATED','CLAIMED','TRANSITIONED','RETRY_SCHEDULED','FAILED_TERMINAL','LEASE_RELEASED',
  'CHANNEL_STRATEGY_READY','PERSONALISATION_SAFETY_READY','SELF_REVIEW_PASS','SELF_REVIEW_REWRITE','SELF_REVIEW_BLOCK',
  'ENGAGEMENT_QUALITY_SCORED','HUMAN_APPROVED','HUMAN_EDITED','HUMAN_REJECTED','HUMAN_ROUTE_CHANGED','AUTO_APPROVED'
));

-- Convert the canonical G4 route type to the executable G5 channel vocabulary.
create or replace function public.g5_execution_channel_for_route_type(p_route_type text)
returns text language sql immutable as $$
  select case upper(coalesce(p_route_type,''))
    when 'DIRECT_EMAIL' then 'EMAIL'
    when 'DEPARTMENT_EMAIL' then 'EMAIL'
    when 'GENERAL_EMAIL' then 'EMAIL'
    when 'LINKEDIN' then 'LINKEDIN'
    when 'SWITCHBOARD' then 'SWITCHBOARD'
    when 'INTRODUCTION' then 'REFERRAL'
    else null
  end
$$;

-- Atomic scheduler-owned Autopilot approval. No AI call and no second pipeline.
create or replace function public.run_g5_autopilot_approval_owned(
  p_scheduler_run_id uuid,
  p_min_engagement_confidence integer default 85
)
returns table(inspected integer,approved integer,held integer,reason text,strategy_id uuid,engagement_confidence integer)
language plpgsql security definer set search_path=public as $$
declare
  s public.engagement_strategies%rowtype;
  o public.opportunities%rowtype;
  c public.campaigns%rowtype;
  r public.commercial_routes%rowtype;
  v_route_id uuid;
  v_channel text;
  v_expected_channel text;
  v_threshold integer:=greatest(0,least(100,coalesce(p_min_engagement_confidence,85)));
begin
  perform public.assert_active_pipeline_scheduler_run(p_scheduler_run_id);

  select x.* into s
  from public.engagement_strategies x
  join public.campaigns ca on ca.id=x.campaign_id and ca.organisation_id=x.organisation_id
  where x.state='READY_FOR_APPROVAL'
    and lower(coalesce(ca.automation_mode,''))='autopilot'
    and ca.status not in ('PAUSED','ARCHIVED')
    and x.self_review_outcome='PASS'
    and x.self_review_json is not null
    and x.personalisation_safety_json is not null
    and x.engagement_quality_json is not null
    and x.engagement_confidence is not null
    and x.outreach_generation_json is not null
    and x.channel_strategy_json is not null
    and x.engagement_confidence>=v_threshold
    and x.autopilot_approved_at is null
    and (x.lease_expires_at is null or x.lease_expires_at<now())
  order by x.updated_at,x.created_at
  for update of x skip locked
  limit 1;

  if s.id is null then
    return query select 0,0,0,null::text,null::uuid,null::integer;
    return;
  end if;

  select * into o from public.opportunities
   where id=s.opportunity_id and organisation_id=s.organisation_id and campaign_id=s.campaign_id;
  select * into c from public.campaigns
   where id=s.campaign_id and organisation_id=s.organisation_id;

  if o.id is null or o.status<>'APPROVED' or c.id is null or lower(coalesce(c.automation_mode,''))<>'autopilot' or c.status in ('PAUSED','ARCHIVED') then
    return query select 1,0,1,'SOURCE_NOT_AUTOPILOT_READY',s.id,s.engagement_confidence;
    return;
  end if;

  begin
    v_route_id:=nullif(coalesce(s.human_route_override_json,s.channel_strategy_json)#>>'{primary,routeId}','')::uuid;
  exception when invalid_text_representation then
    return query select 1,0,1,'ROUTE_ID_INVALID',s.id,s.engagement_confidence;
    return;
  end;
  v_channel:=upper(coalesce(coalesce(s.human_route_override_json,s.channel_strategy_json)#>>'{primary,executionChannel}',''));

  select * into r from public.commercial_routes
   where id=v_route_id and organisation_id=s.organisation_id and campaign_id=s.campaign_id and company_id=o.company_id;
  v_expected_channel:=public.g5_execution_channel_for_route_type(r.channel_type);

  if r.id is null or not r.is_viable or v_expected_channel is null or v_expected_channel<>v_channel
     or nullif(trim(coalesce(r.channel_value,'')),'') is null then
    return query select 1,0,1,'ROUTE_NOT_REACHABLE',s.id,s.engagement_confidence;
    return;
  end if;

  -- Email transport remains subject to R9 timezone/recipient checks after approval.
  -- Autopilot only confirms that a verified reachable route exists; it never guesses execution policy.
  update public.engagement_strategies set
    previous_state='READY_FOR_APPROVAL',
    state='APPROVED',
    autopilot_approved_at=now(),
    autopilot_policy_version='g5-autopilot/v1',
    autopilot_confidence_threshold=v_threshold,
    lease_token=null,lease_expires_at=null,claimed_at=null,scheduler_run_id=null,
    updated_at=now()
  where id=s.id and state='READY_FOR_APPROVAL'
  returning * into s;

  if s.id is null then
    return query select 1,0,1,'STATE_CHANGED',null::uuid,null::integer;
    return;
  end if;

  insert into public.engagement_strategy_events(
    organisation_id,campaign_id,strategy_id,opportunity_id,scheduler_run_id,event_type,previous_state,next_state,metadata_json
  ) values(
    s.organisation_id,s.campaign_id,s.id,s.opportunity_id,p_scheduler_run_id,'AUTO_APPROVED','READY_FOR_APPROVAL','APPROVED',
    jsonb_build_object(
      'release','G5_R12','policyVersion','g5-autopilot/v1','engagementConfidence',s.engagement_confidence,
      'minimumConfidence',v_threshold,'routeId',r.id,'channel',v_channel,'routeReachable',true,
      'selfReviewOutcome','PASS','immutableG4',true
    )
  );
  insert into public.campaign_timeline(organisation_id,campaign_id,event_type,title,description,visibility,metadata_json)
  values(
    s.organisation_id,s.campaign_id,'G5_ENGAGEMENT_AUTO_APPROVED','Outreach approved automatically',
    'Autopilot approved the independently reviewed engagement after every configured safety and confidence gate passed.',
    'CUSTOMER',jsonb_build_object('strategyId',s.id,'opportunityId',s.opportunity_id,'engagementConfidence',s.engagement_confidence,'minimumConfidence',v_threshold,'routeId',r.id,'channel',v_channel)
  );

  return query select 1,1,0,'APPROVED',s.id,s.engagement_confidence;
end $$;

revoke all on function public.run_g5_autopilot_approval_owned(uuid,integer) from public,anon,authenticated;
grant execute on function public.run_g5_autopilot_approval_owned(uuid,integer) to service_role;

-- R9 compatibility hardening: queue both human-approved and R12 auto-approved strategies,
-- and compare G5 execution channels against the canonical G4->G5 channel mapping.
create or replace function public.run_g5_engagement_queue_builder_owned(p_scheduler_run_id uuid)
returns table(inspected integer,queued integer,held integer,already_queued integer)
language plpgsql security definer set search_path=public as $$
declare
  v public.engagement_strategies%rowtype; o public.opportunities%rowtype; ca public.campaigns%rowtype;
  r public.commercial_routes%rowtype; ct public.contacts%rowtype; co public.companies%rowtype;
  v_channel text; v_expected_channel text; v_route_id uuid; v_address text; v_location text; v_tz record; v_scheduled timestamptz;
  v_inspected integer:=0; v_queued integer:=0; v_held integer:=0; v_existing integer:=0;
begin
  perform public.assert_active_pipeline_scheduler_run(p_scheduler_run_id);
  select * into v from public.engagement_strategies s
   where s.state='APPROVED' and s.engagement_quality_json is not null and s.engagement_confidence is not null
     and (s.human_review_action='APPROVE' or s.autopilot_approved_at is not null)
     and not exists(select 1 from public.g5_engagement_execution_queue q where q.strategy_id=s.id)
   order by s.updated_at for update skip locked limit 1;
  if v.id is null then return query select 0,0,0,0; return; end if;
  v_inspected:=1;
  select null::text as timezone_name,null::text as source_name,null::text as confidence_name into v_tz;
  if exists(select 1 from public.g5_engagement_execution_queue q where q.strategy_id=v.id) then return query select 1,0,0,1; return; end if;

  select * into o from public.opportunities where id=v.opportunity_id and organisation_id=v.organisation_id and campaign_id=v.campaign_id;
  select * into ca from public.campaigns where id=v.campaign_id and organisation_id=v.organisation_id;
  if o.id is null or o.status<>'APPROVED' or ca.id is null or ca.status in ('PAUSED','ARCHIVED') then
    insert into public.g5_engagement_execution_holds(organisation_id,campaign_id,strategy_id,opportunity_id,reason_code,reason_message,last_checked_at)
    values(v.organisation_id,v.campaign_id,v.id,v.opportunity_id,'SOURCE_NOT_EXECUTABLE','Approved G5 engagement no longer has an executable approved opportunity/campaign.',now())
    on conflict(strategy_id,reason_code) do update set last_checked_at=now(),resolved_at=null;
    return query select 1,0,1,0; return;
  end if;

  begin
    v_route_id:=nullif(coalesce(v.human_route_override_json,v.channel_strategy_json)#>>'{primary,routeId}','')::uuid;
  exception when invalid_text_representation then
    v_route_id:=null;
  end;
  v_channel:=upper(coalesce(coalesce(v.human_route_override_json,v.channel_strategy_json)#>>'{primary,executionChannel}',''));
  select * into r from public.commercial_routes where id=v_route_id and organisation_id=v.organisation_id and campaign_id=v.campaign_id and company_id=o.company_id;
  v_expected_channel:=public.g5_execution_channel_for_route_type(r.channel_type);
  if r.id is null or not r.is_viable or v_expected_channel is null or v_expected_channel<>v_channel or nullif(trim(coalesce(r.channel_value,'')),'') is null then
    insert into public.g5_engagement_execution_holds(organisation_id,campaign_id,strategy_id,opportunity_id,reason_code,reason_message,metadata_json,last_checked_at)
    values(v.organisation_id,v.campaign_id,v.id,v.opportunity_id,'ROUTE_NOT_EXECUTABLE','The approved route no longer satisfies the immutable G4 execution contract.',jsonb_build_object('routeId',v_route_id,'channel',v_channel,'g4RouteType',r.channel_type),now())
    on conflict(strategy_id,reason_code) do update set metadata_json=excluded.metadata_json,last_checked_at=now(),resolved_at=null;
    return query select 1,0,1,0; return;
  end if;

  v_address:=trim(r.channel_value);
  select * into ct from public.contacts where id=o.primary_contact_id;
  select * into co from public.companies where id=o.company_id;
  v_location:=ct.location;

  if v_channel='EMAIL' then
    if v_address !~* '^[A-Z0-9._%+''-]+@[A-Z0-9.-]+\.[A-Z]{2,}$' then
      insert into public.g5_engagement_execution_holds(organisation_id,campaign_id,strategy_id,opportunity_id,reason_code,reason_message,metadata_json,last_checked_at)
      values(v.organisation_id,v.campaign_id,v.id,v.opportunity_id,'RECIPIENT_INVALID','Approved email route does not contain a valid recipient address.',jsonb_build_object('routeId',r.id),now())
      on conflict(strategy_id,reason_code) do update set metadata_json=excluded.metadata_json,last_checked_at=now(),resolved_at=null;
      return query select 1,0,1,0; return;
    end if;
    select * into v_tz from public.resolve_engagement_timezone(v_location,co.country) limit 1;
    if v_tz.timezone_name is null then
      insert into public.g5_engagement_execution_holds(organisation_id,campaign_id,strategy_id,opportunity_id,reason_code,reason_message,metadata_json,last_checked_at)
      values(v.organisation_id,v.campaign_id,v.id,v.opportunity_id,'TIMEZONE_UNCERTAIN','Recipient timezone cannot be established with sufficient confidence; MarketRoute will not guess.',jsonb_build_object('contactLocation',v_location,'companyCountry',co.country),now())
      on conflict(strategy_id,reason_code) do update set metadata_json=excluded.metadata_json,last_checked_at=now(),resolved_at=null;
      return query select 1,0,1,0; return;
    end if;
    v_scheduled:=public.next_recipient_send_time(v_tz.timezone_name,now());
    insert into public.g5_engagement_execution_queue(organisation_id,campaign_id,strategy_id,opportunity_id,route_id,channel_type,recipient_address,recipient_timezone,timezone_source,timezone_confidence,scheduled_for,status)
    values(v.organisation_id,v.campaign_id,v.id,v.opportunity_id,r.id,v_channel,v_address,v_tz.timezone_name,v_tz.source_name,v_tz.confidence_name,v_scheduled,'QUEUED');
  else
    insert into public.g5_engagement_execution_queue(organisation_id,campaign_id,strategy_id,opportunity_id,route_id,channel_type,recipient_address,status)
    values(v.organisation_id,v.campaign_id,v.id,v.opportunity_id,r.id,v_channel,v_address,'MANUAL_ACTION_REQUIRED');
  end if;

  update public.engagement_strategies set previous_state='APPROVED',state='QUEUED',updated_at=now() where id=v.id and state='APPROVED';
  update public.g5_engagement_execution_holds set resolved_at=now(),last_checked_at=now() where strategy_id=v.id and resolved_at is null;
  insert into public.engagement_strategy_events(organisation_id,campaign_id,strategy_id,opportunity_id,scheduler_run_id,event_type,previous_state,next_state,metadata_json)
  values(v.organisation_id,v.campaign_id,v.id,v.opportunity_id,p_scheduler_run_id,'TRANSITIONED','APPROVED','QUEUED',jsonb_build_object('release','G5_R12','routeId',r.id,'channel',v_channel,'g4RouteType',r.channel_type,'recipientTimezone',v_tz.timezone_name,'scheduledFor',v_scheduled,'transportRequired',v_channel='EMAIL','autopilotApproved',v.autopilot_approved_at is not null,'immutableG4',true));
  insert into public.campaign_timeline(organisation_id,campaign_id,event_type,title,description,visibility,metadata_json)
  values(v.organisation_id,v.campaign_id,'G5_ENGAGEMENT_QUEUED','Engagement queued',case when v_channel='EMAIL' then 'Approved outreach is queued for the recipient’s local working day.' else 'Approved engagement is ready for the selected manual channel.' end,'CUSTOMER',jsonb_build_object('strategyId',v.id,'opportunityId',v.opportunity_id,'channel',v_channel,'scheduledFor',v_scheduled,'recipientTimezone',v_tz.timezone_name,'autopilotApproved',v.autopilot_approved_at is not null));
  v_queued:=1;
  return query select v_inspected,v_queued,v_held,v_existing;
end $$;

revoke all on function public.run_g5_engagement_queue_builder_owned(uuid) from public,anon,authenticated;
grant execute on function public.run_g5_engagement_queue_builder_owned(uuid) to service_role;

-- Extend R11 projection so auto-approval is a first-class APPROVED business fact.
create or replace function public.project_g5_strategy_event_to_engagement_event()
returns trigger
language plpgsql security definer set search_path=public as $$
declare
  s public.engagement_strategies%rowtype;
  v_name text; v_actor text; v_actor_user uuid; v_channel text; v_route_text text; v_route_id uuid;
  v_message jsonb; v_route jsonb; v_quality jsonb;
begin
  select * into s from public.engagement_strategies where id=new.strategy_id;
  if s.id is null then return new; end if;

  if new.event_type='CHANNEL_STRATEGY_READY' then v_name:='ROUTE_SELECTED'; v_actor:='AI';
  elsif new.event_type='HUMAN_ROUTE_CHANGED' then v_name:='ROUTE_CHANGED'; v_actor:='HUMAN';
  elsif new.event_type='HUMAN_EDITED' then v_name:='MESSAGE_EDITED'; v_actor:='HUMAN';
  elsif new.event_type='HUMAN_APPROVED' then v_name:='APPROVED'; v_actor:='HUMAN';
  elsif new.event_type='AUTO_APPROVED' then v_name:='APPROVED'; v_actor:='SYSTEM';
  elsif new.event_type='HUMAN_REJECTED' then v_name:='REJECTED'; v_actor:='HUMAN';
  elsif new.event_type='TRANSITIONED' and new.previous_state='GENERATING' and new.next_state='SELF_REVIEW' then
    if exists (select 1 from public.engagement_events e where e.strategy_id=new.strategy_id and e.event_name in ('MESSAGE_GENERATED','MESSAGE_REWRITTEN')) then v_name:='MESSAGE_REWRITTEN'; else v_name:='MESSAGE_GENERATED'; end if;
    v_actor:='AI';
  elsif new.event_type='TRANSITIONED' and new.previous_state='APPROVED' and new.next_state='QUEUED' then v_name:='QUEUED'; v_actor:='SYSTEM';
  elsif new.event_type='TRANSITIONED' and new.previous_state='QUEUED' and new.next_state='SENT' then v_name:='SENT'; v_actor:='TRANSPORT';
  else return new; end if;

  begin v_actor_user:=nullif(new.metadata_json->>'userId','')::uuid; exception when invalid_text_representation then v_actor_user:=null; end;
  v_channel:=coalesce(s.human_route_override_json#>>'{primary,executionChannel}',s.channel_strategy_json#>>'{primary,executionChannel}',s.outreach_generation_json->>'channel',new.metadata_json->>'channel');
  v_route_text:=coalesce(s.human_route_override_json#>>'{primary,routeId}',s.channel_strategy_json#>>'{primary,routeId}',new.metadata_json->>'newPrimaryRouteId',new.metadata_json->>'routeId');
  begin v_route_id:=nullif(v_route_text,'')::uuid; exception when invalid_text_representation then v_route_id:=null; end;
  if v_name in ('MESSAGE_GENERATED','MESSAGE_REWRITTEN','MESSAGE_EDITED','APPROVED','QUEUED','SENT') then v_message:=s.outreach_generation_json; end if;
  if v_name in ('ROUTE_SELECTED','ROUTE_CHANGED','MESSAGE_GENERATED','MESSAGE_REWRITTEN','APPROVED','QUEUED','SENT') then v_route:=coalesce(s.human_route_override_json,s.channel_strategy_json); end if;
  if v_name in ('APPROVED','QUEUED','SENT') then v_quality:=s.engagement_quality_json; end if;

  insert into public.engagement_events(organisation_id,campaign_id,strategy_id,opportunity_id,event_name,event_key,source_kind,source_strategy_event_id,channel_type,route_id,actor_type,actor_user_id,message_snapshot_json,route_snapshot_json,quality_snapshot_json,metadata_json,occurred_at)
  values(new.organisation_id,new.campaign_id,new.strategy_id,new.opportunity_id,v_name,'strategy-event:'||new.id::text,'STRATEGY_EVENT',new.id,v_channel,v_route_id,v_actor,v_actor_user,v_message,v_route,v_quality,coalesce(new.metadata_json,'{}'::jsonb)||jsonb_build_object('release','G5_R12','strategyEventType',new.event_type,'projected',true),new.occurred_at)
  on conflict (organisation_id,event_key) do nothing;
  return new;
end $$;
