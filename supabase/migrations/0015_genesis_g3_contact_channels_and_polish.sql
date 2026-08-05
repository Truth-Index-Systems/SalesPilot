-- Genesis G3 final contact enrichment: transparent email and LinkedIn channels.
-- Extends the frozen G3 contact model. No existing contact identity or review data is replaced.

alter table public.contacts
  add column if not exists email_address text,
  add column if not exists email_status text not null default 'UNKNOWN'
    check (email_status in ('VERIFIED','LIKELY','UNKNOWN')),
  add column if not exists email_confidence integer not null default 0
    check (email_confidence between 0 and 100),
  add column if not exists email_source_url text,
  add column if not exists linkedin_profile_url text,
  add column if not exists linkedin_status text not null default 'UNKNOWN'
    check (linkedin_status in ('VERIFIED','HIGH_CONFIDENCE','UNKNOWN')),
  add column if not exists linkedin_confidence integer not null default 0
    check (linkedin_confidence between 0 and 100),
  add column if not exists linkedin_source_url text;

alter table public.contact_evidence drop constraint if exists contact_evidence_evidence_type_check;
alter table public.contact_evidence add constraint contact_evidence_evidence_type_check
  check (evidence_type in (
    'IDENTITY','ROLE','DEPARTMENT','LOCATION','BUYING_RELEVANCE',
    'OPERATIONAL_RELEVANCE','EMAIL','LINKEDIN'
  ));

alter table public.contact_evidence drop constraint if exists contact_evidence_source_kind_check;
alter table public.contact_evidence add constraint contact_evidence_source_kind_check
  check (source_kind in (
    'OFFICIAL_WEBSITE','OFFICIAL_LINKEDIN_COMPANY','OFFICIAL_LINKEDIN_PROFILE',
    'PRESS_RELEASE','REGULATORY_FILING','PUBLISHED_STAFF_DIRECTORY'
  ));

create index if not exists contacts_outreach_ready_idx
  on public.contacts(organisation_id,campaign_id,review_status,email_status,linkedin_status,created_at desc)
  where review_status='APPROVED';

-- PostgreSQL cannot insert the newly added contacts columns into an existing
-- view's output using CREATE OR REPLACE VIEW because c.* changes the column
-- positions. Drop the dependent detail view first, then recreate both views.
drop view if exists public.contact_detail;
drop view if exists public.contact_overview;

create view public.contact_overview with (security_invoker = true) as
select
  c.*,
  ca.name as campaign_name,
  co.company_name,
  co.website_url as company_website_url,
  (select count(*) from public.contact_evidence e where e.contact_id=c.id and e.verified=true) as evidence_count
from public.contacts c
join public.campaigns ca on ca.id=c.campaign_id
join public.companies co on co.id=c.company_id;

create view public.contact_detail with (security_invoker = true) as
select
  c.*,
  ca.name as campaign_name,
  co.company_name,
  co.website_url as company_website_url,
  co.industry as company_industry,
  co.country as company_country,
  co.summary as company_summary,
  co.confidence as company_confidence,
  co.review_status as company_review_status,
  coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'id',e.id,'evidence_type',e.evidence_type,'claim',e.claim,
        'source_url',e.source_url,'source_title',e.source_title,'excerpt',e.excerpt,
        'source_kind',e.source_kind,'source_domain',e.source_domain,'verified',e.verified,
        'excerpt_matched',e.excerpt_matched,'quality_score',e.quality_score,
        'retrieved_at',e.retrieved_at,'created_at',e.created_at
      ) order by e.quality_score desc,e.created_at
    )
    from public.contact_evidence e where e.contact_id=c.id
  ),'[]'::jsonb) as evidence,
  coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',r.id,'previous_status',r.previous_status,'next_status',r.next_status,
      'note',r.note,'occurred_at',r.occurred_at
    ) order by r.occurred_at desc)
    from public.contact_review_events r where r.contact_id=c.id
  ),'[]'::jsonb) as review_history,
  coalesce((
    select v.payload_json from public.contact_versions v
    where v.contact_id=c.id order by v.version_number desc limit 1
  ),'{}'::jsonb) as payload
from public.contacts c
join public.campaigns ca on ca.id=c.campaign_id
join public.companies co on co.id=c.company_id;

create or replace function public.save_contact_discovery_batch(
  p_session_id uuid,p_contacts jsonb,p_research_summary text default null,
  p_uncertainties jsonb default '[]'::jsonb,p_unresolved_roles jsonb default '[]'::jsonb
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
      evidence_quality,overall_confidence,confidence_label,unknowns_json,risk_flags_json,
      email_address,email_status,email_confidence,email_source_url,
      linkedin_profile_url,linkedin_status,linkedin_confidence,linkedin_source_url
    ) values(
      s.organisation_id,s.campaign_id,s.company_id,s.id,item->>'fullName',v_name,item->>'roleTitle',v_role,
      nullif(item->>'department',''),nullif(item->>'location',''),item->>'reasonSelected',
      (item->'confidence'->>'identity')::integer,(item->'confidence'->>'role')::integer,
      (item->'confidence'->>'buyingRelevance')::integer,(item->'confidence'->>'operationalRelevance')::integer,
      (item->'confidence'->>'evidenceQuality')::integer,(item->'confidence'->>'overall')::integer,item->'confidence'->>'label',
      coalesce(item->'unknowns','[]'::jsonb),coalesce(item->'riskFlags','[]'::jsonb),
      nullif(item->'email'->>'address',''),coalesce(nullif(item->'email'->>'status',''),'UNKNOWN'),
      coalesce((item->'email'->>'confidence')::integer,0),nullif(item->'email'->>'sourceUrl',''),
      nullif(item->'linkedin'->>'profileUrl',''),coalesce(nullif(item->'linkedin'->>'status',''),'UNKNOWN'),
      coalesce((item->'linkedin'->>'confidence')::integer,0),nullif(item->'linkedin'->>'sourceUrl','')
    ) on conflict (campaign_id,company_id,normalised_name,normalised_role) do update set
      contact_discovery_session_id=excluded.contact_discovery_session_id,full_name=excluded.full_name,role_title=excluded.role_title,
      department=excluded.department,location=excluded.location,reason_selected=excluded.reason_selected,
      identity_confidence=excluded.identity_confidence,role_confidence=excluded.role_confidence,buying_relevance=excluded.buying_relevance,
      operational_relevance=excluded.operational_relevance,evidence_quality=excluded.evidence_quality,overall_confidence=excluded.overall_confidence,
      confidence_label=excluded.confidence_label,unknowns_json=excluded.unknowns_json,risk_flags_json=excluded.risk_flags_json,
      email_address=excluded.email_address,email_status=excluded.email_status,email_confidence=excluded.email_confidence,
      email_source_url=excluded.email_source_url,linkedin_profile_url=excluded.linkedin_profile_url,
      linkedin_status=excluded.linkedin_status,linkedin_confidence=excluded.linkedin_confidence,
      linkedin_source_url=excluded.linkedin_source_url,updated_at=now()
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
    values(s.organisation_id,v_event_id,'ContactsDiscovered','Contact',v_contact_id,
      jsonb_build_object('campaignId',s.campaign_id,'companyId',s.company_id,'contactId',v_contact_id,'sessionId',s.id,
        'emailStatus',coalesce(item->'email'->>'status','UNKNOWN'),'linkedinStatus',coalesce(item->'linkedin'->>'status','UNKNOWN')),now());
    saved:=saved+1;
  end loop;

  update public.contact_discovery_sessions set contacts_saved=(select count(*) from public.contacts where contact_discovery_session_id=s.id),research_summary=left(p_research_summary,1500),uncertainties_json=coalesce(p_uncertainties,'[]'::jsonb),unresolved_roles_json=coalesce(p_unresolved_roles,'[]'::jsonb),stage='SAVING',progress=92,heartbeat_at=now(),lease_expires_at=now()+interval '10 minutes',updated_at=now() where id=s.id;
  return saved;
end $$;

revoke all on function public.save_contact_discovery_batch(uuid,jsonb,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.save_contact_discovery_batch(uuid,jsonb,text,jsonb,jsonb) to service_role;
