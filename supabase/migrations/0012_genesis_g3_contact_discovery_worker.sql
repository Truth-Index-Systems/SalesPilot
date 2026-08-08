-- Genesis G3 Phase 2: autonomous contact discovery worker.
-- Extends the Phase 1 contact foundation and frozen G2 review flow.

alter table public.contact_discovery_sessions
  add column if not exists next_attempt_at timestamptz,
  add column if not exists lease_expires_at timestamptz,
  add column if not exists heartbeat_at timestamptz,
  add column if not exists research_summary text,
  add column if not exists uncertainties_json jsonb not null default '[]'::jsonb,
  add column if not exists unresolved_roles_json jsonb not null default '[]'::jsonb;

create index if not exists contact_discovery_retry_claim_idx
  on public.contact_discovery_sessions(status,next_attempt_at,lease_expires_at,created_at)
  where status in ('QUEUED','RUNNING','FAILED');

create or replace function public.queue_contact_discovery_for_company(
  p_organisation_id uuid,
  p_campaign_id uuid,
  p_company_id uuid
) returns uuid
language plpgsql security definer set search_path=public as $$
declare v_company public.companies%rowtype; v_session_id uuid; v_event_id uuid;
begin
  select * into v_company from public.companies
  where id=p_company_id and organisation_id=p_organisation_id and campaign_id=p_campaign_id
  for update;
  if v_company.id is null then raise exception 'company not found'; end if;
  if v_company.review_status<>'APPROVED' then raise exception 'company must be approved'; end if;

  insert into public.contact_discovery_sessions(organisation_id,campaign_id,company_id,status,stage,progress,next_attempt_at)
  values(p_organisation_id,p_campaign_id,p_company_id,'QUEUED','PREPARING',0,now())
  on conflict (organisation_id,campaign_id,company_id) do update set
    status=case when contact_discovery_sessions.status='CANCELLED' then 'QUEUED' else contact_discovery_sessions.status end,
    next_attempt_at=case when contact_discovery_sessions.status='CANCELLED' then now() else contact_discovery_sessions.next_attempt_at end,
    updated_at=now()
  returning id into v_session_id;

  if not exists(select 1 from public.campaign_timeline where campaign_id=p_campaign_id and event_type='CONTACT_DISCOVERY_QUEUED' and metadata_json->>'companyId'=p_company_id::text) then
    insert into public.campaign_timeline(organisation_id,campaign_id,event_type,title,description,visibility,metadata_json)
    values(p_organisation_id,p_campaign_id,'CONTACT_DISCOVERY_QUEUED','Contact research queued',v_company.company_name||' is ready for decision-maker research.','CUSTOMER',jsonb_build_object('companyId',p_company_id,'sessionId',v_session_id));
  end if;

  if not exists(select 1 from public.domain_outbox where event_type='ContactDiscoveryQueued' and aggregate_id=v_session_id) then
    v_event_id:=gen_random_uuid();
    insert into public.domain_outbox(organisation_id,event_id,event_type,aggregate_type,aggregate_id,payload_json,occurred_at)
    values(p_organisation_id,v_event_id,'ContactDiscoveryQueued','ContactDiscoverySession',v_session_id,jsonb_build_object('campaignId',p_campaign_id,'companyId',p_company_id,'sessionId',v_session_id),now());
  end if;
  return v_session_id;
end $$;

create or replace function public.queue_contact_discovery_after_company_review()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.review_status='APPROVED' and old.review_status is distinct from 'APPROVED' then
    perform public.queue_contact_discovery_for_company(new.organisation_id,new.campaign_id,new.id);
  elsif new.review_status<>'APPROVED' and old.review_status='APPROVED' then
    update public.contact_discovery_sessions set status='CANCELLED',updated_at=now()
    where organisation_id=new.organisation_id and campaign_id=new.campaign_id and company_id=new.id and status='QUEUED';
  end if;
  return new;
end $$;

drop trigger if exists companies_queue_contact_discovery on public.companies;
create trigger companies_queue_contact_discovery
after update of review_status on public.companies
for each row execute function public.queue_contact_discovery_after_company_review();

-- Backfill any companies approved before this migration is applied.
insert into public.contact_discovery_sessions(organisation_id,campaign_id,company_id,status,stage,progress,next_attempt_at)
select organisation_id,campaign_id,id,'QUEUED','PREPARING',0,now()
from public.companies where review_status='APPROVED'
on conflict (organisation_id,campaign_id,company_id) do nothing;

create or replace function public.claim_contact_discovery()
returns table(session_id uuid,organisation_id uuid,campaign_id uuid,company_id uuid)
language plpgsql security definer set search_path=public as $$
declare v_id uuid;
begin
  select s.id into v_id
  from public.contact_discovery_sessions s
  join public.companies c on c.id=s.company_id and c.campaign_id=s.campaign_id and c.organisation_id=s.organisation_id
  join public.campaigns ca on ca.id=s.campaign_id and ca.organisation_id=s.organisation_id
  where c.review_status='APPROVED'
    and ca.status not in ('PAUSED','CANCELLED')
    and (
      (s.status in ('QUEUED','FAILED') and coalesce(s.next_attempt_at,now())<=now() and s.attempt_count<5)
      or (s.status='RUNNING' and coalesce(s.lease_expires_at,now()-interval '1 second')<now())
    )
  order by case when s.status='RUNNING' then 0 else 1 end,s.created_at
  for update of s skip locked limit 1;
  if v_id is null then return; end if;

  update public.contact_discovery_sessions set
    status='RUNNING',stage='PREPARING',progress=5,
    attempt_count=attempt_count+1,last_error=null,
    started_at=coalesce(started_at,now()),heartbeat_at=now(),lease_expires_at=now()+interval '10 minutes',
    next_attempt_at=null,updated_at=now()
  where id=v_id;

  return query select s.id,s.organisation_id,s.campaign_id,s.company_id
  from public.contact_discovery_sessions s where s.id=v_id;
end $$;

create or replace function public.update_contact_discovery_progress(
  p_session_id uuid,p_stage text,p_progress integer,p_candidates integer default null
) returns void language plpgsql security definer set search_path=public as $$
begin
  if p_stage not in ('PREPARING','RESEARCHING','IDENTIFYING','VALIDATING','SAVING','COMPLETE') then raise exception 'invalid stage'; end if;
  update public.contact_discovery_sessions set
    stage=p_stage,progress=greatest(progress,least(99,greatest(0,p_progress))),
    candidates_found=coalesce(p_candidates,candidates_found),heartbeat_at=now(),lease_expires_at=now()+interval '10 minutes',updated_at=now()
  where id=p_session_id and status='RUNNING';
  if not found then raise exception 'contact discovery session is not running'; end if;
end $$;

create or replace function public.save_contact_discovery_batch(
  p_session_id uuid,p_contacts jsonb,p_research_summary text default null,p_uncertainties jsonb default '[]'::jsonb,p_unresolved_roles jsonb default '[]'::jsonb
) returns integer language plpgsql security definer set search_path=public as $$
declare s public.contact_discovery_sessions%rowtype; item jsonb; ev jsonb; v_contact_id uuid; v_version integer; saved integer:=0; v_name text; v_role text; v_event_id uuid;
begin
  select * into s from public.contact_discovery_sessions where id=p_session_id for update;
  if s.id is null or s.status<>'RUNNING' then raise exception 'contact discovery session is not running'; end if;
  if jsonb_typeof(p_contacts)<>'array' then raise exception 'contacts payload must be an array'; end if;

  for item in select * from jsonb_array_elements(p_contacts) loop
    v_name:=lower(regexp_replace(trim(item->>'fullName'),'[^a-z0-9]+','','gi'));
    v_role:=lower(regexp_replace(trim(item->>'roleTitle'),'[^a-z0-9]+','','gi'));
    if coalesce(v_name,'')='' or coalesce(v_role,'')='' then continue; end if;
    if not exists(select 1 from jsonb_array_elements(coalesce(item->'evidence','[]'::jsonb)) e where e->>'evidenceType'='IDENTITY' and (e->>'verified')::boolean=true) then continue; end if;
    if not exists(select 1 from jsonb_array_elements(coalesce(item->'evidence','[]'::jsonb)) e where e->>'evidenceType'='ROLE' and (e->>'verified')::boolean=true) then continue; end if;

    insert into public.contacts(
      organisation_id,campaign_id,company_id,contact_discovery_session_id,full_name,normalised_name,role_title,normalised_role,
      department,location,reason_selected,identity_confidence,role_confidence,buying_relevance,operational_relevance,
      evidence_quality,overall_confidence,confidence_label,unknowns_json,risk_flags_json
    ) values(
      s.organisation_id,s.campaign_id,s.company_id,s.id,item->>'fullName',v_name,item->>'roleTitle',v_role,
      nullif(item->>'department',''),nullif(item->>'location',''),item->>'reasonSelected',
      (item->'confidence'->>'identity')::integer,(item->'confidence'->>'role')::integer,
      (item->'confidence'->>'buyingRelevance')::integer,(item->'confidence'->>'operationalRelevance')::integer,
      (item->'confidence'->>'evidenceQuality')::integer,(item->'confidence'->>'overall')::integer,item->'confidence'->>'label',
      coalesce(item->'unknowns','[]'::jsonb),coalesce(item->'riskFlags','[]'::jsonb)
    ) on conflict (campaign_id,company_id,normalised_name,normalised_role) do update set
      contact_discovery_session_id=excluded.contact_discovery_session_id,full_name=excluded.full_name,role_title=excluded.role_title,
      department=excluded.department,location=excluded.location,reason_selected=excluded.reason_selected,
      identity_confidence=excluded.identity_confidence,role_confidence=excluded.role_confidence,buying_relevance=excluded.buying_relevance,
      operational_relevance=excluded.operational_relevance,evidence_quality=excluded.evidence_quality,overall_confidence=excluded.overall_confidence,
      confidence_label=excluded.confidence_label,unknowns_json=excluded.unknowns_json,risk_flags_json=excluded.risk_flags_json,updated_at=now()
    returning id into v_contact_id;

    select coalesce(max(version_number),0)+1 into v_version from public.contact_versions where contact_id=v_contact_id;
    insert into public.contact_versions(organisation_id,contact_id,version_number,payload_json) values(s.organisation_id,v_contact_id,v_version,item);
    delete from public.contact_evidence where contact_id=v_contact_id;
    for ev in select * from jsonb_array_elements(coalesce(item->'evidence','[]'::jsonb)) loop
      insert into public.contact_evidence(organisation_id,campaign_id,company_id,contact_id,evidence_type,claim,source_url,source_title,excerpt,source_kind,source_domain,verified,excerpt_matched,quality_score,retrieved_at)
      values(s.organisation_id,s.campaign_id,s.company_id,v_contact_id,ev->>'evidenceType',ev->>'claim',ev->>'sourceUrl',nullif(ev->>'sourceTitle',''),nullif(ev->>'excerpt',''),ev->>'sourceKind',nullif(ev->>'sourceDomain',''),coalesce((ev->>'verified')::boolean,false),coalesce((ev->>'excerptMatched')::boolean,false),coalesce((ev->>'qualityScore')::integer,0),nullif(ev->>'retrievedAt','')::timestamptz);
    end loop;

    v_event_id:=gen_random_uuid();
    insert into public.domain_outbox(organisation_id,event_id,event_type,aggregate_type,aggregate_id,payload_json,occurred_at)
    values(s.organisation_id,v_event_id,'ContactsDiscovered','Contact',v_contact_id,jsonb_build_object('campaignId',s.campaign_id,'companyId',s.company_id,'contactId',v_contact_id,'sessionId',s.id),now());
    saved:=saved+1;
  end loop;

  update public.contact_discovery_sessions set contacts_saved=(select count(*) from public.contacts where contact_discovery_session_id=s.id),research_summary=left(p_research_summary,1500),uncertainties_json=coalesce(p_uncertainties,'[]'::jsonb),unresolved_roles_json=coalesce(p_unresolved_roles,'[]'::jsonb),stage='SAVING',progress=92,heartbeat_at=now(),lease_expires_at=now()+interval '10 minutes',updated_at=now() where id=s.id;
  return saved;
end $$;

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
  update public.contact_discovery_sessions set status='COMPLETED',stage='COMPLETE',progress=100,contacts_saved=saved,completed_at=now(),heartbeat_at=now(),lease_expires_at=null,next_attempt_at=null,updated_at=now() where id=s.id;
  insert into public.campaign_timeline(organisation_id,campaign_id,event_type,title,description,visibility,metadata_json)
  values(s.organisation_id,s.campaign_id,'CONTACT_DISCOVERY_COMPLETED','Decision-makers ready for review',saved||' evidence-backed contacts at '||coalesce(v_company_name,'the approved company')||' are ready for review.','CUSTOMER',jsonb_build_object('companyId',s.company_id,'sessionId',s.id,'contactCount',saved));
  v_event_id:=gen_random_uuid();
  insert into public.domain_outbox(organisation_id,event_id,event_type,aggregate_type,aggregate_id,payload_json,occurred_at)
  values(s.organisation_id,v_event_id,'ContactDiscoveryCompleted','ContactDiscoverySession',s.id,jsonb_build_object('campaignId',s.campaign_id,'companyId',s.company_id,'sessionId',s.id,'contactCount',saved),now());
  return saved;
end $$;

create or replace function public.fail_contact_discovery(p_session_id uuid,p_error text)
returns void language plpgsql security definer set search_path=public as $$
declare s public.contact_discovery_sessions%rowtype; v_delay interval;
begin
  select * into s from public.contact_discovery_sessions where id=p_session_id for update;
  if s.id is null then return; end if;
  v_delay:=case when s.attempt_count<=1 then interval '5 minutes' when s.attempt_count=2 then interval '15 minutes' when s.attempt_count=3 then interval '1 hour' else interval '6 hours' end;
  update public.contact_discovery_sessions set status='FAILED',last_error=left(coalesce(p_error,'CONTACT_DISCOVERY_FAILED'),500),lease_expires_at=null,heartbeat_at=now(),next_attempt_at=case when attempt_count<5 then now()+v_delay else null end,updated_at=now() where id=p_session_id;
  insert into public.campaign_timeline(organisation_id,campaign_id,event_type,title,description,visibility,metadata_json)
  values(s.organisation_id,s.campaign_id,'CONTACT_DISCOVERY_RETRY','Contact research will retry','MarketRoute held back uncertain contact results and will retry the research safely.','CUSTOMER',jsonb_build_object('companyId',s.company_id,'sessionId',s.id,'attemptCount',s.attempt_count));
end $$;

revoke all on function public.queue_contact_discovery_for_company(uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function public.claim_contact_discovery() from public,anon,authenticated;
revoke all on function public.update_contact_discovery_progress(uuid,text,integer,integer) from public,anon,authenticated;
revoke all on function public.save_contact_discovery_batch(uuid,jsonb,text,jsonb,jsonb) from public,anon,authenticated;
revoke all on function public.finalize_contact_discovery(uuid) from public,anon,authenticated;
revoke all on function public.fail_contact_discovery(uuid,text) from public,anon,authenticated;
grant execute on function public.queue_contact_discovery_for_company(uuid,uuid,uuid),public.claim_contact_discovery(),public.update_contact_discovery_progress(uuid,text,integer,integer),public.save_contact_discovery_batch(uuid,jsonb,text,jsonb,jsonb),public.finalize_contact_discovery(uuid),public.fail_contact_discovery(uuid,text) to service_role;
