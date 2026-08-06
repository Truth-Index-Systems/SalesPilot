-- Genesis G4 Phase 7: approved outreach -> policy-safe send queue.
-- This migration prepares durable send instructions only. It does not send messages.

create table if not exists public.engagement_send_queue (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  engagement_id uuid not null references public.opportunity_engagements(id) on delete cascade,
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  draft_id uuid not null references public.engagement_drafts(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  channel_type text not null check (channel_type in ('EMAIL','LINKEDIN')),
  recipient_address text not null,
  recipient_timezone text not null,
  timezone_source text not null check (timezone_source in ('CONTACT_LOCATION','COMPANY_COUNTRY')),
  timezone_confidence text not null check (timezone_confidence in ('HIGH','MEDIUM')),
  send_window_start time not null default time '08:00',
  send_window_end time not null default time '18:00',
  scheduled_for timestamptz not null,
  status text not null default 'READY' check (status in ('READY','PAUSED','CANCELLED','SENT','FAILED')),
  scheduler_run_id uuid references public.pipeline_scheduler_runs(id) on delete set null,
  queued_at timestamptz not null default now(),
  sent_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (engagement_id),
  unique (draft_id)
);

create table if not exists public.engagement_queue_holds (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  engagement_id uuid not null references public.opportunity_engagements(id) on delete cascade,
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  reason_code text not null check (reason_code in ('MISSING_ROUTE','UNSUPPORTED_CHANNEL','TIMEZONE_UNCERTAIN','DRAFT_MISSING')),
  reason_message text not null,
  metadata_json jsonb not null default '{}'::jsonb,
  first_held_at timestamptz not null default now(),
  last_checked_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique (engagement_id,reason_code)
);

create index if not exists engagement_send_queue_due_idx
  on public.engagement_send_queue(status,scheduled_for)
  where status='READY';
create index if not exists engagement_send_queue_org_idx
  on public.engagement_send_queue(organisation_id,campaign_id,status,scheduled_for);
create index if not exists engagement_queue_holds_org_idx
  on public.engagement_queue_holds(organisation_id,campaign_id,last_checked_at desc)
  where resolved_at is null;

alter table public.engagement_send_queue enable row level security;
alter table public.engagement_queue_holds enable row level security;

drop policy if exists engagement_send_queue_member_read on public.engagement_send_queue;
create policy engagement_send_queue_member_read on public.engagement_send_queue
for select to authenticated using (public.is_active_org_member(organisation_id));

drop policy if exists engagement_queue_holds_member_read on public.engagement_queue_holds;
create policy engagement_queue_holds_member_read on public.engagement_queue_holds
for select to authenticated using (public.is_active_org_member(organisation_id));

-- Deterministic timezone resolver. Contact work location is authoritative when
-- recognised; company country is a fallback only where one national business
-- timezone is sufficiently reliable. Ambiguous countries are deliberately held.
create or replace function public.resolve_engagement_timezone(p_location text,p_country text)
returns table(timezone_name text,source_name text,confidence_name text)
language plpgsql immutable as $$
declare v_location text:=lower(trim(coalesce(p_location,''))); v_country text:=lower(trim(coalesce(p_country,'')));
begin
  timezone_name:=case
    when v_location ~ '(london|england|scotland|wales|northern ireland|united kingdom|\buk\b)' then 'Europe/London'
    when v_location ~ '(dublin|ireland)' then 'Europe/Dublin'
    when v_location ~ '(dubai|abu dhabi|united arab emirates|\buae\b)' then 'Asia/Dubai'
    when v_location ~ '(mumbai|delhi|bengaluru|bangalore|hyderabad|chennai|kolkata|india)' then 'Asia/Kolkata'
    when v_location ~ '(singapore)' then 'Asia/Singapore'
    when v_location ~ '(sydney|melbourne|canberra|new south wales|victoria)' then 'Australia/Sydney'
    when v_location ~ '(brisbane|queensland)' then 'Australia/Brisbane'
    when v_location ~ '(perth|western australia)' then 'Australia/Perth'
    when v_location ~ '(auckland|wellington|new zealand)' then 'Pacific/Auckland'
    when v_location ~ '(toronto|ottawa|montreal|new york|boston|washington|miami|eastern time)' then 'America/New_York'
    when v_location ~ '(chicago|dallas|houston|central time)' then 'America/Chicago'
    when v_location ~ '(denver|mountain time)' then 'America/Denver'
    when v_location ~ '(los angeles|san francisco|seattle|pacific time)' then 'America/Los_Angeles'
    when v_location ~ '(berlin|germany)' then 'Europe/Berlin'
    when v_location ~ '(paris|france)' then 'Europe/Paris'
    when v_location ~ '(amsterdam|netherlands)' then 'Europe/Amsterdam'
    when v_location ~ '(madrid|spain)' then 'Europe/Madrid'
    when v_location ~ '(rome|italy)' then 'Europe/Rome'
    when v_location ~ '(warsaw|poland)' then 'Europe/Warsaw'
    when v_location ~ '(johannesburg|cape town|south africa)' then 'Africa/Johannesburg'
    when v_location ~ '(tokyo|japan)' then 'Asia/Tokyo'
    else null end;
  if timezone_name is not null then source_name:='CONTACT_LOCATION'; confidence_name:='HIGH'; return next; return; end if;

  timezone_name:=case
    when v_country in ('united kingdom','uk','great britain','england','scotland','wales','northern ireland') then 'Europe/London'
    when v_country in ('ireland','republic of ireland') then 'Europe/Dublin'
    when v_country in ('united arab emirates','uae') then 'Asia/Dubai'
    when v_country='india' then 'Asia/Kolkata'
    when v_country='singapore' then 'Asia/Singapore'
    when v_country='new zealand' then 'Pacific/Auckland'
    when v_country='south africa' then 'Africa/Johannesburg'
    when v_country='japan' then 'Asia/Tokyo'
    when v_country='germany' then 'Europe/Berlin'
    when v_country='france' then 'Europe/Paris'
    when v_country='netherlands' then 'Europe/Amsterdam'
    when v_country='spain' then 'Europe/Madrid'
    when v_country='italy' then 'Europe/Rome'
    when v_country='poland' then 'Europe/Warsaw'
    else null end;
  if timezone_name is not null then source_name:='COMPANY_COUNTRY'; confidence_name:='MEDIUM'; return next; end if;
end $$;

create or replace function public.next_recipient_send_time(p_timezone text,p_now timestamptz default now())
returns timestamptz language plpgsql stable as $$
declare v_local timestamp; v_candidate timestamp;
begin
  if p_timezone is null or not exists(select 1 from pg_timezone_names where name=p_timezone) then return null; end if;
  v_local:=timezone(p_timezone,p_now);
  if v_local::time >= time '08:00' and v_local::time < time '18:00' then return p_now; end if;
  if v_local::time < time '08:00' then v_candidate:=date_trunc('day',v_local)+interval '8 hours';
  else v_candidate:=date_trunc('day',v_local)+interval '1 day 8 hours'; end if;
  return v_candidate at time zone p_timezone;
end $$;

create or replace function public.run_engagement_queue_builder(p_scheduler_run_id uuid)
returns table(inspected integer,queued integer,held integer,already_queued integer)
language plpgsql security definer set search_path=public as $$
declare v record; v_tz record; v_draft_id uuid; v_address text; v_scheduled timestamptz; v_inspected integer:=0; v_queued integer:=0; v_held integer:=0; v_existing integer:=0; v_event_id uuid;
begin
  if not exists(select 1 from public.pipeline_scheduler_runs where id=p_scheduler_run_id) then raise exception 'scheduler run required'; end if;

  for v in
    select e.*,c.location contact_location,co.country company_country
    from public.opportunity_engagements e
    left join public.contacts c on c.id=e.contact_id
    join public.companies co on co.id=e.company_id
    where e.status='APPROVED_TO_SEND'
    order by e.source_opportunity_rank,e.updated_at
    for update of e skip locked
  loop
    v_inspected:=v_inspected+1;
    if exists(select 1 from public.engagement_send_queue q where q.engagement_id=v.id) then
      v_existing:=v_existing+1; continue;
    end if;
    select id into v_draft_id from public.engagement_drafts where engagement_id=v.id and status='COMPLETE' order by completed_at desc limit 1;
    if v_draft_id is null then
      insert into public.engagement_queue_holds(organisation_id,campaign_id,engagement_id,opportunity_id,reason_code,reason_message,last_checked_at)
      values(v.organisation_id,v.campaign_id,v.id,v.opportunity_id,'DRAFT_MISSING','Approved engagement has no completed draft.',now())
      on conflict on constraint engagement_queue_holds_engagement_id_reason_code_key do update set last_checked_at=now(),resolved_at=null;
      v_held:=v_held+1; continue;
    end if;
    v_address:=case when v.channel_type='EMAIL' then nullif(trim(coalesce(v.recipient_email,'')),'') when v.channel_type='LINKEDIN' then nullif(trim(coalesce(v.linkedin_profile_url,'')),'') else null end;
    if v.channel_type not in ('EMAIL','LINKEDIN') then
      insert into public.engagement_queue_holds(organisation_id,campaign_id,engagement_id,opportunity_id,reason_code,reason_message,last_checked_at)
      values(v.organisation_id,v.campaign_id,v.id,v.opportunity_id,'UNSUPPORTED_CHANNEL','Approved engagement does not have a supported sending channel.',now())
      on conflict on constraint engagement_queue_holds_engagement_id_reason_code_key do update set last_checked_at=now(),resolved_at=null;
      v_held:=v_held+1; continue;
    end if;
    if v_address is null then
      insert into public.engagement_queue_holds(organisation_id,campaign_id,engagement_id,opportunity_id,reason_code,reason_message,last_checked_at)
      values(v.organisation_id,v.campaign_id,v.id,v.opportunity_id,'MISSING_ROUTE','Approved engagement no longer has a usable recipient route.',now())
      on conflict on constraint engagement_queue_holds_engagement_id_reason_code_key do update set last_checked_at=now(),resolved_at=null;
      v_held:=v_held+1; continue;
    end if;
    select * into v_tz from public.resolve_engagement_timezone(v.contact_location,v.company_country) limit 1;
    if v_tz.timezone_name is null then
      insert into public.engagement_queue_holds(organisation_id,campaign_id,engagement_id,opportunity_id,reason_code,reason_message,metadata_json,last_checked_at)
      values(v.organisation_id,v.campaign_id,v.id,v.opportunity_id,'TIMEZONE_UNCERTAIN','Recipient timezone could not be established with sufficient confidence.',jsonb_build_object('contactLocation',v.contact_location,'companyCountry',v.company_country),now())
      on conflict on constraint engagement_queue_holds_engagement_id_reason_code_key do update set metadata_json=excluded.metadata_json,last_checked_at=now(),resolved_at=null;
      v_held:=v_held+1; continue;
    end if;
    v_scheduled:=public.next_recipient_send_time(v_tz.timezone_name,now());
    insert into public.engagement_send_queue(organisation_id,campaign_id,engagement_id,opportunity_id,draft_id,contact_id,channel_type,recipient_address,recipient_timezone,timezone_source,timezone_confidence,scheduled_for,scheduler_run_id)
    values(v.organisation_id,v.campaign_id,v.id,v.opportunity_id,v_draft_id,v.contact_id,v.channel_type,v_address,v_tz.timezone_name,v_tz.source_name,v_tz.confidence_name,v_scheduled,p_scheduler_run_id);
    update public.engagement_queue_holds set resolved_at=now(),last_checked_at=now() where engagement_id=v.id and resolved_at is null;
    update public.opportunity_engagements set status='QUEUED_FOR_SEND',updated_at=now() where id=v.id;
    insert into public.opportunity_engagement_history(organisation_id,campaign_id,engagement_id,opportunity_id,event_type,previous_status,next_status,metadata_json)
    values(v.organisation_id,v.campaign_id,v.id,v.opportunity_id,'QUEUED','APPROVED_TO_SEND','QUEUED_FOR_SEND',jsonb_build_object('draftId',v_draft_id,'scheduledFor',v_scheduled,'recipientTimezone',v_tz.timezone_name,'timezoneSource',v_tz.source_name,'schedulerRunId',p_scheduler_run_id));
    insert into public.campaign_timeline(organisation_id,campaign_id,event_type,title,description,visibility,metadata_json)
    values(v.organisation_id,v.campaign_id,'OUTREACH_QUEUED','Outreach queued','The approved outreach is queued for the recipient’s local sending window.','CUSTOMER',jsonb_build_object('engagementId',v.id,'opportunityId',v.opportunity_id,'scheduledFor',v_scheduled,'recipientTimezone',v_tz.timezone_name));
    v_event_id:=gen_random_uuid();
    insert into public.domain_outbox(organisation_id,event_id,event_type,aggregate_type,aggregate_id,payload_json,occurred_at)
    values(v.organisation_id,v_event_id,'EngagementQueuedForSend','Engagement',v.id,jsonb_build_object('campaignId',v.campaign_id,'opportunityId',v.opportunity_id,'draftId',v_draft_id,'queueId',(select id from public.engagement_send_queue where engagement_id=v.id),'scheduledFor',v_scheduled,'recipientTimezone',v_tz.timezone_name),now());
    v_queued:=v_queued+1;
  end loop;
  return query select v_inspected,v_queued,v_held,v_existing;
end $$;

create or replace view public.engagement_queue_overview with (security_invoker=true) as
select q.*,ca.name campaign_name,co.company_name,e.recipient_name,e.recipient_role,e.status engagement_status,d.subject
from public.engagement_send_queue q
join public.opportunity_engagements e on e.id=q.engagement_id
join public.campaigns ca on ca.id=q.campaign_id
join public.companies co on co.id=e.company_id
join public.engagement_drafts d on d.id=q.draft_id;

revoke all on function public.run_engagement_queue_builder(uuid) from public,anon,authenticated;
grant execute on function public.run_engagement_queue_builder(uuid) to service_role;
