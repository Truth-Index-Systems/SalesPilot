-- Genesis G3 Stage 5: continuous pipeline automation.
-- Extends the frozen G2/G3 workers without replacing their architecture.

alter table public.discovery_sessions
  add column if not exists cycle_number integer not null default 1 check (cycle_number > 0),
  add column if not exists cycle_started_at timestamptz,
  add column if not exists queue_floor integer not null default 6 check (queue_floor between 1 and 100);

-- Requeue the existing campaign discovery session when the human review queue
-- drops below six. The unique campaign session remains the stable aggregate;
-- each top-up is represented by cycle_number rather than a parallel workflow.
create or replace function public.ensure_company_review_queue(
  p_organisation_id uuid,
  p_campaign_id uuid
) returns boolean
language plpgsql security definer set search_path=public as $$
declare
  v_campaign public.campaigns%rowtype;
  v_session public.discovery_sessions%rowtype;
  v_pending integer;
  v_floor integer;
  v_event_id uuid;
begin
  select * into v_campaign
  from public.campaigns
  where id=p_campaign_id and organisation_id=p_organisation_id
  for update;

  if v_campaign.id is null then raise exception 'campaign not found'; end if;
  if v_campaign.status in ('PAUSED','ARCHIVED') then return false; end if;

  select count(*) into v_pending
  from public.companies
  where organisation_id=p_organisation_id
    and campaign_id=p_campaign_id
    and review_status='PENDING_REVIEW';

  select * into v_session
  from public.discovery_sessions
  where organisation_id=p_organisation_id and campaign_id=p_campaign_id
  for update;

  if v_session.id is null then
    insert into public.discovery_sessions(
      organisation_id,campaign_id,status,stage,progress,next_attempt_at,
      cycle_number,cycle_started_at,queue_floor
    ) values(
      p_organisation_id,p_campaign_id,'QUEUED','PREPARING',0,now(),1,now(),6
    ) returning * into v_session;
  end if;

  v_floor:=coalesce(v_session.queue_floor,6);
  if v_pending>=v_floor then return false; end if;
  if v_session.status in ('QUEUED','RUNNING') then return false; end if;

  update public.discovery_sessions set
    status='QUEUED',stage='PREPARING',progress=0,
    candidates_found=0,recommendations_saved=0,
    attempt_count=0,last_error=null,started_at=null,completed_at=null,
    next_attempt_at=now(),lease_expires_at=null,heartbeat_at=null,
    cycle_number=cycle_number+1,cycle_started_at=now(),updated_at=now()
  where id=v_session.id;

  insert into public.campaign_timeline(
    organisation_id,campaign_id,event_type,title,description,visibility,metadata_json
  ) values(
    p_organisation_id,p_campaign_id,'COMPANY_DISCOVERY_TOP_UP_QUEUED',
    'Company discovery continuing',
    'The review queue fell below six, so MarketRoute automatically started another evidence-backed company search.',
    'CUSTOMER',
    jsonb_build_object('sessionId',v_session.id,'pendingCount',v_pending,'queueFloor',v_floor,'cycleNumber',v_session.cycle_number+1)
  );

  v_event_id:=gen_random_uuid();
  insert into public.domain_outbox(
    organisation_id,event_id,event_type,aggregate_type,aggregate_id,payload_json,occurred_at
  ) values(
    p_organisation_id,v_event_id,'CompanyDiscoveryTopUpQueued','DiscoverySession',v_session.id,
    jsonb_build_object('campaignId',p_campaign_id,'sessionId',v_session.id,'pendingCount',v_pending,'queueFloor',v_floor,'cycleNumber',v_session.cycle_number+1),now()
  );

  return true;
end $$;

create or replace function public.keep_company_review_queue_healthy()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if old.review_status is distinct from new.review_status then
    perform public.ensure_company_review_queue(new.organisation_id,new.campaign_id);
  end if;
  return new;
end $$;

drop trigger if exists companies_keep_review_queue_healthy on public.companies;
create trigger companies_keep_review_queue_healthy
after update of review_status on public.companies
for each row execute function public.keep_company_review_queue_healthy();

-- A contact approval can make the current contact batch ready for G4. This does
-- not send outreach; it only records the deterministic pipeline hand-off.
create or replace function public.refresh_campaign_contact_readiness(
  p_organisation_id uuid,
  p_campaign_id uuid
) returns boolean
language plpgsql security definer set search_path=public as $$
declare
  v_pending integer;
  v_approved integer;
  v_active integer;
  v_event_id uuid;
begin
  select count(*) filter (where review_status='PENDING_REVIEW'),
         count(*) filter (where review_status='APPROVED')
  into v_pending,v_approved
  from public.contacts
  where organisation_id=p_organisation_id and campaign_id=p_campaign_id;

  select count(*) into v_active
  from public.contact_discovery_sessions
  where organisation_id=p_organisation_id and campaign_id=p_campaign_id
    and status in ('QUEUED','RUNNING');

  if v_approved=0 or v_pending>0 or v_active>0 then return false; end if;

  if exists(
    select 1 from public.campaign_timeline
    where organisation_id=p_organisation_id and campaign_id=p_campaign_id
      and event_type='CONTACTS_READY_FOR_OUTREACH'
  ) then return false; end if;

  insert into public.campaign_timeline(
    organisation_id,campaign_id,event_type,title,description,visibility,metadata_json
  ) values(
    p_organisation_id,p_campaign_id,'CONTACTS_READY_FOR_OUTREACH',
    'Contacts ready for outreach',
    v_approved||' approved contact'||case when v_approved=1 then ' is' else 's are' end||' ready for the Outreach stage.',
    'CUSTOMER',jsonb_build_object('approvedContactCount',v_approved)
  );

  v_event_id:=gen_random_uuid();
  insert into public.domain_outbox(
    organisation_id,event_id,event_type,aggregate_type,aggregate_id,payload_json,occurred_at
  ) values(
    p_organisation_id,v_event_id,'CampaignContactsReadyForOutreach','Campaign',p_campaign_id,
    jsonb_build_object('campaignId',p_campaign_id,'approvedContactCount',v_approved),now()
  );

  return true;
end $$;

create or replace function public.refresh_contact_readiness_after_review()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if old.review_status is distinct from new.review_status then
    perform public.refresh_campaign_contact_readiness(new.organisation_id,new.campaign_id);
  end if;
  return new;
end $$;

drop trigger if exists contacts_refresh_campaign_readiness on public.contacts;
create trigger contacts_refresh_campaign_readiness
after update of review_status on public.contacts
for each row execute function public.refresh_contact_readiness_after_review();

-- Re-evaluate readiness whenever autonomous research finishes because the last
-- active session may have just completed with contacts already reviewed.
create or replace function public.refresh_readiness_after_contact_session()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.status='COMPLETED' and old.status is distinct from 'COMPLETED' then
    perform public.refresh_campaign_contact_readiness(new.organisation_id,new.campaign_id);
  end if;
  return new;
end $$;

drop trigger if exists contact_sessions_refresh_campaign_readiness on public.contact_discovery_sessions;
create trigger contact_sessions_refresh_campaign_readiness
after update of status on public.contact_discovery_sessions
for each row execute function public.refresh_readiness_after_contact_session();

-- Immediately evaluate existing active campaigns so the queue-health rule does
-- not wait for the next manual review action.
do $$
declare r record;
begin
  for r in
    select organisation_id,id as campaign_id
    from public.campaigns
    where status not in ('PAUSED','ARCHIVED')
  loop
    perform public.ensure_company_review_queue(r.organisation_id,r.campaign_id);
  end loop;
end $$;

revoke all on function public.ensure_company_review_queue(uuid,uuid) from public,anon,authenticated;
revoke all on function public.refresh_campaign_contact_readiness(uuid,uuid) from public,anon,authenticated;
grant execute on function public.ensure_company_review_queue(uuid,uuid) to service_role;
grant execute on function public.refresh_campaign_contact_readiness(uuid,uuid) to service_role;
