-- Genesis G3 Phase 1: contact discovery persistence foundation.
-- Extends the frozen G2 architecture; no existing tables or workflows are replaced.

create table if not exists public.contact_discovery_sessions (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  status text not null default 'QUEUED'
    check (status in ('QUEUED','RUNNING','COMPLETED','FAILED','CANCELLED')),
  stage text not null default 'PREPARING'
    check (stage in ('PREPARING','RESEARCHING','IDENTIFYING','VALIDATING','SAVING','COMPLETE')),
  progress integer not null default 0 check (progress between 0 and 100),
  candidates_found integer not null default 0 check (candidates_found >= 0),
  contacts_saved integer not null default 0 check (contacts_saved >= 0),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  last_error text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id,campaign_id,company_id)
);

create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  contact_discovery_session_id uuid not null references public.contact_discovery_sessions(id) on delete cascade,
  full_name text not null,
  normalised_name text not null,
  role_title text not null,
  normalised_role text not null,
  department text,
  location text,
  reason_selected text not null,
  identity_confidence integer not null check (identity_confidence between 0 and 100),
  role_confidence integer not null check (role_confidence between 0 and 100),
  buying_relevance integer not null check (buying_relevance between 0 and 100),
  operational_relevance integer not null check (operational_relevance between 0 and 100),
  evidence_quality integer not null check (evidence_quality between 0 and 100),
  overall_confidence integer not null check (overall_confidence between 0 and 100),
  confidence_label text not null check (confidence_label in ('VERIFIED','LIKELY','POSSIBLE','UNKNOWN')),
  unknowns_json jsonb not null default '[]'::jsonb,
  risk_flags_json jsonb not null default '[]'::jsonb,
  review_status text not null default 'PENDING_REVIEW'
    check (review_status in ('PENDING_REVIEW','APPROVED','REJECTED','HOLD','ARCHIVED')),
  review_note text,
  review_version integer not null default 0,
  reviewed_at timestamptz,
  reviewed_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_id,company_id,normalised_name,normalised_role)
);

create table if not exists public.contact_versions (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  version_number integer not null check (version_number > 0),
  payload_json jsonb not null,
  created_at timestamptz not null default now(),
  unique (contact_id,version_number)
);

create table if not exists public.contact_evidence (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  evidence_type text not null
    check (evidence_type in ('IDENTITY','ROLE','DEPARTMENT','LOCATION','BUYING_RELEVANCE','OPERATIONAL_RELEVANCE')),
  claim text not null,
  source_url text not null,
  source_title text,
  excerpt text,
  source_kind text not null
    check (source_kind in ('OFFICIAL_WEBSITE','OFFICIAL_LINKEDIN_COMPANY','PRESS_RELEASE','REGULATORY_FILING','PUBLISHED_STAFF_DIRECTORY')),
  source_domain text,
  verified boolean not null default false,
  excerpt_matched boolean not null default false,
  quality_score integer not null default 0 check (quality_score between 0 and 100),
  retrieved_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.contact_review_events (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  previous_status text,
  next_status text not null
    check (next_status in ('PENDING_REVIEW','APPROVED','REJECTED','HOLD','ARCHIVED')),
  note text,
  reviewed_by uuid not null,
  occurred_at timestamptz not null default now()
);

create index if not exists contact_discovery_sessions_claim_idx
  on public.contact_discovery_sessions(status,created_at)
  where status in ('QUEUED','FAILED');
create index if not exists contact_discovery_sessions_campaign_idx
  on public.contact_discovery_sessions(organisation_id,campaign_id,status,created_at desc);
create index if not exists contacts_review_queue_idx
  on public.contacts(organisation_id,campaign_id,review_status,overall_confidence desc,created_at desc);
create index if not exists contacts_company_idx
  on public.contacts(organisation_id,company_id,review_status,overall_confidence desc);
create index if not exists contact_evidence_contact_idx
  on public.contact_evidence(organisation_id,contact_id,created_at);
create index if not exists contact_review_events_contact_idx
  on public.contact_review_events(organisation_id,contact_id,occurred_at desc);
create index if not exists contact_review_events_campaign_idx
  on public.contact_review_events(organisation_id,campaign_id,occurred_at desc);

alter table public.contact_discovery_sessions enable row level security;
alter table public.contacts enable row level security;
alter table public.contact_versions enable row level security;
alter table public.contact_evidence enable row level security;
alter table public.contact_review_events enable row level security;

drop policy if exists contact_discovery_sessions_member_read on public.contact_discovery_sessions;
create policy contact_discovery_sessions_member_read on public.contact_discovery_sessions
for select to authenticated using (public.is_active_org_member(organisation_id));

drop policy if exists contacts_member_read on public.contacts;
create policy contacts_member_read on public.contacts
for select to authenticated using (public.is_active_org_member(organisation_id));

drop policy if exists contact_versions_member_read on public.contact_versions;
create policy contact_versions_member_read on public.contact_versions
for select to authenticated using (public.is_active_org_member(organisation_id));

drop policy if exists contact_evidence_member_read on public.contact_evidence;
create policy contact_evidence_member_read on public.contact_evidence
for select to authenticated using (public.is_active_org_member(organisation_id));

drop policy if exists contact_review_events_member_read on public.contact_review_events;
create policy contact_review_events_member_read on public.contact_review_events
for select to authenticated using (public.is_active_org_member(organisation_id));

create or replace view public.contact_overview with (security_invoker = true) as
select
  c.*,
  ca.name as campaign_name,
  co.company_name,
  co.website_url as company_website_url,
  (select count(*) from public.contact_evidence e where e.contact_id=c.id and e.verified=true) as evidence_count
from public.contacts c
join public.campaigns ca on ca.id=c.campaign_id
join public.companies co on co.id=c.company_id;

create or replace view public.contact_detail with (security_invoker = true) as
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
    select jsonb_agg(jsonb_build_object(
      'id',e.id,
      'evidence_type',e.evidence_type,
      'claim',e.claim,
      'source_url',e.source_url,
      'source_title',e.source_title,
      'excerpt',e.excerpt,
      'source_kind',e.source_kind,
      'source_domain',e.source_domain,
      'verified',e.verified,
      'excerpt_matched',e.excerpt_matched,
      'quality_score',e.quality_score,
      'retrieved_at',e.retrieved_at,
      'created_at',e.created_at
    ) order by e.quality_score desc,e.created_at)
    from public.contact_evidence e where e.contact_id=c.id
  ),'[]'::jsonb) as evidence,
  coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',r.id,
      'previous_status',r.previous_status,
      'next_status',r.next_status,
      'note',r.note,
      'occurred_at',r.occurred_at
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

-- Shared event boundary for later G3 workers and review actions.
-- The service role remains the only writer to the frozen outbox architecture.
create or replace function public.enqueue_contact_domain_event(
  p_organisation_id uuid,
  p_event_type text,
  p_contact_id uuid,
  p_payload jsonb default '{}'::jsonb
) returns uuid
language plpgsql security definer set search_path=public as $$
declare
  v_contact public.contacts%rowtype;
  v_event_id uuid := gen_random_uuid();
begin
  if p_event_type not in (
    'ContactDiscoveryQueued',
    'ContactsDiscovered',
    'ContactApproved',
    'ContactRejected',
    'ContactHeld',
    'ContactDiscoveryCompleted'
  ) then
    raise exception 'invalid contact event type';
  end if;

  select * into v_contact
  from public.contacts
  where id=p_contact_id and organisation_id=p_organisation_id;

  if v_contact.id is null then raise exception 'contact not found'; end if;

  insert into public.domain_outbox(
    organisation_id,event_id,event_type,aggregate_type,aggregate_id,payload_json,occurred_at
  ) values(
    p_organisation_id,v_event_id,p_event_type,'Contact',v_contact.id,
    jsonb_build_object(
      'campaignId',v_contact.campaign_id,
      'companyId',v_contact.company_id,
      'contactId',v_contact.id
    ) || coalesce(p_payload,'{}'::jsonb),
    now()
  );

  return v_event_id;
end $$;

revoke all on function public.enqueue_contact_domain_event(uuid,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.enqueue_contact_domain_event(uuid,text,uuid,jsonb) to service_role;
