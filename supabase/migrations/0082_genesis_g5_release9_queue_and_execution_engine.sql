-- MarketRoute Genesis G5 — Release 9: Queue & Execution Engine
-- Deterministic execution only. G4 truth, G5 reasoning, route strategy and content are immutable here.

create table if not exists public.g5_engagement_execution_queue (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  strategy_id uuid not null references public.engagement_strategies(id) on delete cascade,
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  route_id uuid not null references public.commercial_routes(id) on delete restrict,
  channel_type text not null check (channel_type in ('EMAIL','LINKEDIN','SWITCHBOARD','REFERRAL')),
  recipient_address text not null,
  recipient_timezone text,
  timezone_source text,
  timezone_confidence text,
  scheduled_for timestamptz,
  status text not null check (status in ('QUEUED','SENDING','MANUAL_ACTION_REQUIRED','SENT','FAILED_RETRYABLE','FAILED_TERMINAL')),
  attempt_count integer not null default 0 check (attempt_count>=0),
  scheduler_run_id uuid references public.pipeline_scheduler_runs(id) on delete set null,
  lease_token uuid,
  claimed_at timestamptz,
  lease_expires_at timestamptz,
  next_retry_at timestamptz,
  transport_message_id text,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(strategy_id)
);

create table if not exists public.g5_engagement_execution_holds (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  strategy_id uuid not null references public.engagement_strategies(id) on delete cascade,
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  reason_code text not null,
  reason_message text not null,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  last_checked_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique(strategy_id,reason_code)
);

create index if not exists g5_execution_queue_due_idx on public.g5_engagement_execution_queue(status,scheduled_for,next_retry_at,lease_expires_at);
create index if not exists g5_execution_queue_campaign_idx on public.g5_engagement_execution_queue(organisation_id,campaign_id,status,scheduled_for);

alter table public.g5_engagement_execution_queue enable row level security;
alter table public.g5_engagement_execution_holds enable row level security;
drop policy if exists g5_execution_queue_member_read on public.g5_engagement_execution_queue;
create policy g5_execution_queue_member_read on public.g5_engagement_execution_queue for select to authenticated using(public.is_active_org_member(organisation_id));
drop policy if exists g5_execution_holds_member_read on public.g5_engagement_execution_holds;
create policy g5_execution_holds_member_read on public.g5_engagement_execution_holds for select to authenticated using(public.is_active_org_member(organisation_id));
revoke all on table public.g5_engagement_execution_queue,public.g5_engagement_execution_holds from public,anon,authenticated;
grant select on table public.g5_engagement_execution_queue,public.g5_engagement_execution_holds to authenticated;
grant select,insert,update on table public.g5_engagement_execution_queue,public.g5_engagement_execution_holds to service_role;

-- Queue exactly one approved G5 strategy. Route/channel/content are revalidated against
-- persisted G4/G5 truth before APPROVED -> QUEUED is committed.
create or replace function public.run_g5_engagement_queue_builder_owned(p_scheduler_run_id uuid)
returns table(inspected integer,queued integer,held integer,already_queued integer)
language plpgsql security definer set search_path=public as $$
declare
  v public.engagement_strategies%rowtype; o public.opportunities%rowtype; ca public.campaigns%rowtype;
  r public.commercial_routes%rowtype; ct public.contacts%rowtype; co public.companies%rowtype;
  v_channel text; v_route_id uuid; v_address text; v_location text; v_tz record; v_scheduled timestamptz;
  v_inspected integer:=0; v_queued integer:=0; v_held integer:=0; v_existing integer:=0;
begin
  perform public.assert_active_pipeline_scheduler_run(p_scheduler_run_id);
  select * into v from public.engagement_strategies s
   where s.state='APPROVED' and s.engagement_quality_json is not null and s.engagement_confidence is not null
     and s.human_review_action='APPROVE'
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

  v_route_id:=nullif(coalesce(v.human_route_override_json,v.channel_strategy_json)#>>'{primary,routeId}','')::uuid;
  v_channel:=upper(coalesce(coalesce(v.human_route_override_json,v.channel_strategy_json)#>>'{primary,executionChannel}',''));
  select * into r from public.commercial_routes where id=v_route_id and organisation_id=v.organisation_id and campaign_id=v.campaign_id and company_id=o.company_id;
  if r.id is null or not r.is_viable or upper(coalesce(r.channel_type,''))<>v_channel or nullif(trim(coalesce(r.channel_value,'')),'') is null then
    insert into public.g5_engagement_execution_holds(organisation_id,campaign_id,strategy_id,opportunity_id,reason_code,reason_message,metadata_json,last_checked_at)
    values(v.organisation_id,v.campaign_id,v.id,v.opportunity_id,'ROUTE_NOT_EXECUTABLE','The approved route no longer satisfies the immutable G4 execution contract.',jsonb_build_object('routeId',v_route_id,'channel',v_channel),now())
    on conflict(strategy_id,reason_code) do update set metadata_json=excluded.metadata_json,last_checked_at=now(),resolved_at=null;
    return query select 1,0,1,0; return;
  end if;

  v_address:=trim(r.channel_value);
  select * into ct from public.contacts where id=o.primary_contact_id;
  select * into co from public.companies where id=o.company_id;
  v_location:=ct.location;

  -- EMAIL is the only automatic transport in R9. Other approved channels are queued
  -- as explicit manual actions and must never be falsely reported as sent.
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
  values(v.organisation_id,v.campaign_id,v.id,v.opportunity_id,p_scheduler_run_id,'TRANSITIONED','APPROVED','QUEUED',jsonb_build_object('release','G5_R9','routeId',r.id,'channel',v_channel,'recipientTimezone',v_tz.timezone_name,'scheduledFor',v_scheduled,'transportRequired',v_channel='EMAIL','immutableG4',true));
  insert into public.campaign_timeline(organisation_id,campaign_id,event_type,title,description,visibility,metadata_json)
  values(v.organisation_id,v.campaign_id,'G5_ENGAGEMENT_QUEUED','Engagement queued',case when v_channel='EMAIL' then 'Approved outreach is queued for the recipient’s local working day.' else 'Approved engagement is ready for the selected manual channel.' end,'CUSTOMER',jsonb_build_object('strategyId',v.id,'opportunityId',v.opportunity_id,'channel',v_channel,'scheduledFor',v_scheduled,'recipientTimezone',v_tz.timezone_name));
  v_queued:=1;
  return query select v_inspected,v_queued,v_held,v_existing;
end $$;

create or replace function public.claim_next_g5_email_execution_owned(p_scheduler_run_id uuid,p_lease_seconds integer default 120)
returns table(queue_id uuid,strategy_id uuid,lease_token uuid,organisation_id uuid,campaign_id uuid,recipient_address text,recipient_timezone text,subject text,body text)
language plpgsql security definer set search_path=public as $$
declare q public.g5_engagement_execution_queue%rowtype; s public.engagement_strategies%rowtype; tok uuid:=gen_random_uuid(); local_now timestamp;
begin
  perform public.assert_active_pipeline_scheduler_run(p_scheduler_run_id);
  select x.* into q from public.g5_engagement_execution_queue x
   join public.campaigns c on c.id=x.campaign_id and c.status not in ('PAUSED','ARCHIVED')
   where x.channel_type='EMAIL' and x.status in ('QUEUED','FAILED_RETRYABLE')
     and coalesce(x.next_retry_at,x.scheduled_for,now())<=now()
     and (x.lease_expires_at is null or x.lease_expires_at<now())
   order by coalesce(x.next_retry_at,x.scheduled_for,x.created_at),x.created_at for update of x skip locked limit 1;
  if q.id is null then return; end if;
  local_now:=timezone(q.recipient_timezone,now());
  if local_now::time < time '08:00' or local_now::time >= time '18:00' then
    update public.g5_engagement_execution_queue set scheduled_for=public.next_recipient_send_time(q.recipient_timezone,now()),updated_at=now() where id=q.id;
    return;
  end if;
  select * into s from public.engagement_strategies where id=q.strategy_id and state='QUEUED';
  if s.id is null or s.outreach_generation_json is null then return; end if;
  update public.g5_engagement_execution_queue set status='SENDING',scheduler_run_id=p_scheduler_run_id,lease_token=tok,claimed_at=now(),lease_expires_at=now()+make_interval(secs=>greatest(30,p_lease_seconds)),attempt_count=attempt_count+1,updated_at=now() where id=q.id;
  return query select q.id,q.strategy_id,tok,q.organisation_id,q.campaign_id,q.recipient_address,q.recipient_timezone,
    nullif(s.outreach_generation_json#>>'{content,subject}',''),nullif(s.outreach_generation_json#>>'{content,emailBody}','');
end $$;

create or replace function public.complete_g5_email_execution_owned(p_queue_id uuid,p_scheduler_run_id uuid,p_lease_token uuid,p_transport_message_id text)
returns void language plpgsql security definer set search_path=public as $$
declare q public.g5_engagement_execution_queue%rowtype;
begin
 perform public.assert_active_pipeline_scheduler_run(p_scheduler_run_id);
 select * into q from public.g5_engagement_execution_queue where id=p_queue_id for update;
 if q.id is null then raise exception 'G5_EXECUTION_MISSING'; end if;
 if q.status<>'SENDING' or q.scheduler_run_id is distinct from p_scheduler_run_id or q.lease_token is distinct from p_lease_token or q.lease_expires_at<now() then raise exception 'G5_EXECUTION_OWNERSHIP_LOST'; end if;
 update public.g5_engagement_execution_queue set status='SENT',transport_message_id=nullif(trim(coalesce(p_transport_message_id,'')),''),sent_at=now(),lease_token=null,lease_expires_at=null,claimed_at=null,scheduler_run_id=null,next_retry_at=null,last_error=null,updated_at=now() where id=q.id;
 update public.engagement_strategies set previous_state='QUEUED',state='SENT',completed_at=now(),updated_at=now() where id=q.strategy_id and state='QUEUED';
 insert into public.engagement_strategy_events(organisation_id,campaign_id,strategy_id,opportunity_id,scheduler_run_id,event_type,previous_state,next_state,metadata_json)
 values(q.organisation_id,q.campaign_id,q.strategy_id,q.opportunity_id,p_scheduler_run_id,'TRANSITIONED','QUEUED','SENT',jsonb_build_object('release','G5_R9','queueId',q.id,'transportMessageId',p_transport_message_id,'transportFailureRegeneratesContent',false));
 insert into public.campaign_timeline(organisation_id,campaign_id,event_type,title,description,visibility,metadata_json)
 values(q.organisation_id,q.campaign_id,'G5_ENGAGEMENT_SENT','Outreach sent','The approved first-touch outreach has been sent in the recipient’s permitted local-time window.','CUSTOMER',jsonb_build_object('strategyId',q.strategy_id,'opportunityId',q.opportunity_id,'channel','EMAIL','recipientTimezone',q.recipient_timezone));
end $$;

create or replace function public.fail_g5_email_execution_owned(p_queue_id uuid,p_scheduler_run_id uuid,p_lease_token uuid,p_reason text,p_retryable boolean,p_retry_after_seconds integer default 300)
returns void language plpgsql security definer set search_path=public as $$
declare q public.g5_engagement_execution_queue%rowtype;
begin
 perform public.assert_active_pipeline_scheduler_run(p_scheduler_run_id); select * into q from public.g5_engagement_execution_queue where id=p_queue_id for update;
 if q.id is null then raise exception 'G5_EXECUTION_MISSING'; end if;
 if q.status<>'SENDING' or q.scheduler_run_id is distinct from p_scheduler_run_id or q.lease_token is distinct from p_lease_token then raise exception 'G5_EXECUTION_OWNERSHIP_LOST'; end if;
 update public.g5_engagement_execution_queue set status=case when p_retryable then 'FAILED_RETRYABLE' else 'FAILED_TERMINAL' end,last_error=left(coalesce(p_reason,'Transport failure'),1000),next_retry_at=case when p_retryable then now()+make_interval(secs=>greatest(60,p_retry_after_seconds)) else null end,lease_token=null,lease_expires_at=null,claimed_at=null,scheduler_run_id=null,updated_at=now() where id=q.id;
 -- Strategy remains QUEUED. Transport failure must never invalidate/regenerate reviewed content.
end $$;

revoke all on function public.run_g5_engagement_queue_builder_owned(uuid) from public,anon,authenticated;
revoke all on function public.claim_next_g5_email_execution_owned(uuid,integer) from public,anon,authenticated;
revoke all on function public.complete_g5_email_execution_owned(uuid,uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.fail_g5_email_execution_owned(uuid,uuid,uuid,text,boolean,integer) from public,anon,authenticated;
grant execute on function public.run_g5_engagement_queue_builder_owned(uuid) to service_role;
grant execute on function public.claim_next_g5_email_execution_owned(uuid,integer) to service_role;
grant execute on function public.complete_g5_email_execution_owned(uuid,uuid,uuid,text) to service_role;
grant execute on function public.fail_g5_email_execution_owned(uuid,uuid,uuid,text,boolean,integer) to service_role;
