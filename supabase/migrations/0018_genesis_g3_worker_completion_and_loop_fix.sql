-- Genesis G3 reliability patch: finish valid empty research cycles and stop
-- company/contact workers from being presented as permanently active.
-- Safe to apply after 0017 and safe to rerun.

alter table public.contact_discovery_sessions
  add column if not exists result_status text
    check (result_status in ('CONTACTS_FOUND','NO_SUPPORTED_CONTACTS','FAILED')),
  add column if not exists no_match_completed_at timestamptz;

-- A completed search with no independently supported people is a valid outcome,
-- not a transient infrastructure failure. Persist the research explanation and
-- complete the company so it cannot monopolise the queue.
create or replace function public.complete_contact_discovery_without_matches(
  p_session_id uuid,
  p_research_summary text,
  p_uncertainties jsonb default '[]'::jsonb,
  p_unresolved_roles jsonb default '[]'::jsonb
) returns integer
language plpgsql security definer set search_path=public as $$
declare
  s public.contact_discovery_sessions%rowtype;
  v_company_name text;
  v_event_id uuid;
begin
  select * into s
  from public.contact_discovery_sessions
  where id=p_session_id
  for update;

  if s.id is null then raise exception 'contact discovery session missing'; end if;
  if s.status='COMPLETED' then return coalesce(s.contacts_saved,0); end if;

  select company_name into v_company_name
  from public.companies
  where id=s.company_id;

  update public.contact_discovery_sessions set
    status='COMPLETED',
    stage='COMPLETE',
    progress=100,
    contacts_saved=0,
    result_status='NO_SUPPORTED_CONTACTS',
    research_summary=left(coalesce(p_research_summary,'No independently supported decision-makers were found.'),1500),
    uncertainties_json=coalesce(p_uncertainties,'[]'::jsonb),
    unresolved_roles_json=coalesce(p_unresolved_roles,'[]'::jsonb),
    last_error=null,
    completed_at=now(),
    no_match_completed_at=now(),
    heartbeat_at=now(),
    lease_expires_at=null,
    next_attempt_at=null,
    updated_at=now()
  where id=s.id;

  if not exists (
    select 1 from public.campaign_timeline
    where campaign_id=s.campaign_id
      and event_type='CONTACT_DISCOVERY_NO_SUPPORTED_CONTACTS'
      and metadata_json->>'companyId'=s.company_id::text
  ) then
    insert into public.campaign_timeline(
      organisation_id,campaign_id,event_type,title,description,visibility,metadata_json
    ) values(
      s.organisation_id,s.campaign_id,'CONTACT_DISCOVERY_NO_SUPPORTED_CONTACTS',
      'Contact research completed',
      'MarketRoute could not independently verify a suitable current decision-maker at '||coalesce(v_company_name,'this company')||'. Nothing was invented or queued for review.',
      'CUSTOMER',
      jsonb_build_object(
        'companyId',s.company_id,
        'sessionId',s.id,
        'contactCount',0,
        'unresolvedRoles',coalesce(p_unresolved_roles,'[]'::jsonb),
        'uncertainties',coalesce(p_uncertainties,'[]'::jsonb)
      )
    );
  end if;

  v_event_id:=gen_random_uuid();
  insert into public.domain_outbox(
    organisation_id,event_id,event_type,aggregate_type,aggregate_id,payload_json,occurred_at
  ) values(
    s.organisation_id,v_event_id,'ContactDiscoveryCompleted','ContactDiscoverySession',s.id,
    jsonb_build_object(
      'campaignId',s.campaign_id,
      'companyId',s.company_id,
      'sessionId',s.id,
      'contactCount',0,
      'outcome','NO_SUPPORTED_CONTACTS'
    ),now()
  );

  return 0;
end $$;

-- Preserve the normal successful completion path while explicitly recording its
-- result. Existing callers and event contracts remain unchanged.
create or replace function public.finalize_contact_discovery(p_session_id uuid)
returns integer language plpgsql security definer set search_path=public as $$
declare s public.contact_discovery_sessions%rowtype; saved integer; v_company_name text; v_event_id uuid;
begin
  select * into s from public.contact_discovery_sessions where id=p_session_id for update;
  if s.id is null then raise exception 'contact discovery session missing'; end if;
  if s.status='COMPLETED' then return s.contacts_saved; end if;
  select count(*) into saved from public.contacts where contact_discovery_session_id=s.id;
  if saved=0 then raise exception 'no contacts saved'; end if;
  select company_name into v_company_name from public.companies where id=s.company_id;
  update public.contact_discovery_sessions set
    status='COMPLETED',stage='COMPLETE',progress=100,contacts_saved=saved,
    result_status='CONTACTS_FOUND',completed_at=now(),heartbeat_at=now(),
    lease_expires_at=null,next_attempt_at=null,last_error=null,updated_at=now()
  where id=s.id;
  insert into public.campaign_timeline(organisation_id,campaign_id,event_type,title,description,visibility,metadata_json)
  values(s.organisation_id,s.campaign_id,'CONTACT_DISCOVERY_COMPLETED','Decision-makers ready for review',saved||' evidence-backed contacts at '||coalesce(v_company_name,'the approved company')||' are ready for review.','CUSTOMER',jsonb_build_object('companyId',s.company_id,'sessionId',s.id,'contactCount',saved));
  v_event_id:=gen_random_uuid();
  insert into public.domain_outbox(organisation_id,event_id,event_type,aggregate_type,aggregate_id,payload_json,occurred_at)
  values(s.organisation_id,v_event_id,'ContactDiscoveryCompleted','ContactDiscoverySession',s.id,jsonb_build_object('campaignId',s.campaign_id,'companyId',s.company_id,'sessionId',s.id,'contactCount',saved,'outcome','CONTACTS_FOUND'),now());
  return saved;
end $$;

-- Do not let a genuine failure look like active research in the UI.
create or replace function public.fail_contact_discovery(p_session_id uuid,p_error text)
returns void language plpgsql security definer set search_path=public as $$
declare s public.contact_discovery_sessions%rowtype; v_delay interval;
begin
  select * into s from public.contact_discovery_sessions where id=p_session_id for update;
  if s.id is null then return; end if;
  v_delay:=case
    when s.attempt_count<=1 then interval '2 minutes'
    when s.attempt_count=2 then interval '10 minutes'
    when s.attempt_count=3 then interval '30 minutes'
    else interval '2 hours'
  end;
  update public.contact_discovery_sessions set
    status='FAILED',stage='PREPARING',progress=0,result_status='FAILED',
    last_error=left(coalesce(p_error,'CONTACT_DISCOVERY_FAILED'),500),
    lease_expires_at=null,heartbeat_at=now(),
    next_attempt_at=case when attempt_count<4 then now()+v_delay else null end,
    updated_at=now()
  where id=p_session_id;

  if not exists (
    select 1 from public.campaign_timeline
    where campaign_id=s.campaign_id
      and event_type='CONTACT_DISCOVERY_RETRY'
      and metadata_json->>'sessionId'=s.id::text
      and occurred_at>=now()-interval '10 minutes'
  ) then
    insert into public.campaign_timeline(
      organisation_id,campaign_id,event_type,title,description,visibility,metadata_json
    ) values(
      s.organisation_id,s.campaign_id,'CONTACT_DISCOVERY_RETRY',
      'Contact research will retry',
      'MarketRoute paused this attempt safely and will continue without presenting uncertain contacts.',
      'CUSTOMER',jsonb_build_object('companyId',s.company_id,'sessionId',s.id,'attemptCount',s.attempt_count)
    );
  end if;
end $$;

-- Repair the exact company-loop state created when a valid zero-result cycle was
-- incorrectly sent through fail_company_discovery before this patch.
update public.discovery_sessions
set status='COMPLETED',stage='COMPLETE',progress=100,
    last_cycle_new_companies=0,
    consecutive_empty_cycles=greatest(consecutive_empty_cycles,1),
    top_up_not_before=greatest(coalesce(top_up_not_before,now()),now()+interval '30 minutes'),
    next_attempt_at=null,lease_expires_at=null,completed_at=coalesce(completed_at,now()),updated_at=now()
where status in ('FAILED','QUEUED')
  and last_error='DISCOVERY_NO_VERIFIED_COMPANIES';

-- Recover contact jobs that have visibly remained RUNNING beyond their lease.
update public.contact_discovery_sessions
set status='FAILED',stage='PREPARING',progress=0,result_status='FAILED',
    last_error=coalesce(last_error,'WORKER_LEASE_EXPIRED'),
    lease_expires_at=null,next_attempt_at=now()+interval '2 minutes',updated_at=now()
where status='RUNNING'
  and (lease_expires_at is null or lease_expires_at<now());

-- Remove recent duplicate top-up events, retaining only the newest entry for the
-- current cycle. This is presentation cleanup; no companies or evidence change.
with duplicates as (
  select id,
         row_number() over (
           partition by organisation_id,campaign_id,event_type,
                        coalesce(metadata_json->>'cycleNumber','legacy')
           order by occurred_at desc,id desc
         ) as rn
  from public.campaign_timeline
  where event_type='COMPANY_DISCOVERY_TOP_UP_QUEUED'
    and occurred_at>=now()-interval '24 hours'
)
delete from public.campaign_timeline t
using duplicates d
where t.id=d.id and d.rn>1;

revoke all on function public.complete_contact_discovery_without_matches(uuid,text,jsonb,jsonb) from public,anon,authenticated;
revoke all on function public.finalize_contact_discovery(uuid) from public,anon,authenticated;
revoke all on function public.fail_contact_discovery(uuid,text) from public,anon,authenticated;
grant execute on function public.complete_contact_discovery_without_matches(uuid,text,jsonb,jsonb) to service_role;
grant execute on function public.finalize_contact_discovery(uuid) to service_role;
grant execute on function public.fail_contact_discovery(uuid,text) to service_role;
