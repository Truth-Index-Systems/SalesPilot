create table if not exists public.discovery_sessions (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  status text not null default 'QUEUED' check (status in ('QUEUED','RUNNING','COMPLETED','FAILED','CANCELLED')),
  stage text not null default 'PREPARING' check (stage in ('PREPARING','SEARCHING','ANALYSING','VALIDATING','SAVING','COMPLETE')),
  progress integer not null default 0 check (progress between 0 and 100),
  candidates_found integer not null default 0,
  recommendations_saved integer not null default 0,
  attempt_count integer not null default 0,
  last_error text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id, campaign_id)
);

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  discovery_session_id uuid not null references public.discovery_sessions(id) on delete cascade,
  company_name text not null,
  website_url text not null,
  canonical_domain text not null,
  country text,
  industry text,
  summary text not null,
  confidence integer not null check (confidence between 0 and 100),
  review_status text not null default 'PENDING_REVIEW' check (review_status in ('PENDING_REVIEW','APPROVED','REJECTED','ARCHIVED')),
  match_label text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid,
  unique (campaign_id, canonical_domain)
);

create table if not exists public.company_versions (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  version_number integer not null,
  payload_json jsonb not null,
  created_at timestamptz not null default now(),
  unique(company_id, version_number)
);

create table if not exists public.company_evidence (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  claim text not null,
  source_url text not null,
  excerpt text,
  source_title text,
  created_at timestamptz not null default now()
);

create index if not exists discovery_sessions_org_campaign_idx on public.discovery_sessions(organisation_id,campaign_id);
create index if not exists companies_org_status_idx on public.companies(organisation_id,review_status,created_at desc);
create index if not exists companies_campaign_idx on public.companies(campaign_id,confidence desc);
create index if not exists company_evidence_company_idx on public.company_evidence(company_id);

alter table public.discovery_sessions enable row level security;
alter table public.companies enable row level security;
alter table public.company_versions enable row level security;
alter table public.company_evidence enable row level security;

create policy discovery_sessions_member_read on public.discovery_sessions for select to authenticated using (public.is_active_org_member(organisation_id));
create policy companies_member_read on public.companies for select to authenticated using (public.is_active_org_member(organisation_id));
create policy company_versions_member_read on public.company_versions for select to authenticated using (public.is_active_org_member(organisation_id));
create policy company_evidence_member_read on public.company_evidence for select to authenticated using (public.is_active_org_member(organisation_id));

create or replace function public.queue_company_discovery_from_campaign_created() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if new.event_type='CampaignCreated' and new.aggregate_type='Campaign' then
    insert into public.discovery_sessions(organisation_id,campaign_id,status,stage,progress)
    values(new.organisation_id,new.aggregate_id,'QUEUED','PREPARING',0)
    on conflict (organisation_id,campaign_id) do nothing;
    insert into public.campaign_timeline(organisation_id,campaign_id,event_type,title,description,visibility)
    values(new.organisation_id,new.aggregate_id,'COMPANY_DISCOVERY_QUEUED','Company discovery queued','SalesPilot is preparing to find companies that match your approved campaign.','CUSTOMER');
  end if;
  return new;
end $$;

drop trigger if exists domain_outbox_queue_company_discovery on public.domain_outbox;
create trigger domain_outbox_queue_company_discovery after insert on public.domain_outbox
for each row execute function public.queue_company_discovery_from_campaign_created();

-- Backfill campaigns created before this migration.
insert into public.discovery_sessions(organisation_id,campaign_id,status,stage,progress)
select organisation_id,id,'QUEUED','PREPARING',0 from public.campaigns
where status='PREPARING'
on conflict (organisation_id,campaign_id) do nothing;

create or replace function public.claim_company_discovery()
returns table(session_id uuid, organisation_id uuid, campaign_id uuid)
language plpgsql security definer set search_path=public as $$
declare claimed uuid;
begin
  select id into claimed from public.discovery_sessions
  where status in ('QUEUED','FAILED') and attempt_count < 3
  order by created_at asc for update skip locked limit 1;
  if claimed is null then return; end if;
  update public.discovery_sessions set status='RUNNING',stage='SEARCHING',progress=10,attempt_count=attempt_count+1,started_at=coalesce(started_at,now()),last_error=null,updated_at=now() where id=claimed;
  return query select s.id,s.organisation_id,s.campaign_id from public.discovery_sessions s where s.id=claimed;
end $$;

create or replace function public.update_company_discovery_progress(p_session_id uuid,p_stage text,p_progress integer,p_candidates integer default null)
returns void language plpgsql security definer set search_path=public as $$
begin
 update public.discovery_sessions set stage=p_stage,progress=greatest(progress,least(95,p_progress)),candidates_found=coalesce(p_candidates,candidates_found),updated_at=now() where id=p_session_id and status='RUNNING';
end $$;

create or replace function public.complete_company_discovery(p_session_id uuid,p_companies jsonb)
returns integer language plpgsql security definer set search_path=public as $$
declare s public.discovery_sessions%rowtype; item jsonb; company_id uuid; saved integer:=0; ev jsonb; domain text;
begin
 select * into s from public.discovery_sessions where id=p_session_id for update;
 if s.id is null then raise exception 'discovery session missing'; end if;
 if s.status='COMPLETED' then return s.recommendations_saved; end if;
 for item in select * from jsonb_array_elements(p_companies) loop
   domain:=lower(regexp_replace(regexp_replace(item->>'websiteUrl','^https?://',''),'[/#?].*$',''));
   insert into public.companies(organisation_id,campaign_id,discovery_session_id,company_name,website_url,canonical_domain,country,industry,summary,confidence,match_label)
   values(s.organisation_id,s.campaign_id,s.id,item->>'name',item->>'websiteUrl',domain,nullif(item->>'country',''),nullif(item->>'industry',''),item->>'summary',(item->>'confidence')::integer,item->>'matchLabel')
   on conflict (campaign_id,canonical_domain) do update set summary=excluded.summary,confidence=excluded.confidence,match_label=excluded.match_label,updated_at=now()
   returning id into company_id;
   insert into public.company_versions(organisation_id,company_id,version_number,payload_json)
   values(s.organisation_id,company_id,1,item) on conflict(company_id,version_number) do nothing;
   for ev in select * from jsonb_array_elements(coalesce(item->'evidence','[]'::jsonb)) loop
     insert into public.company_evidence(organisation_id,company_id,claim,source_url,excerpt,source_title)
     values(s.organisation_id,company_id,ev->>'claim',ev->>'sourceUrl',nullif(ev->>'excerpt',''),nullif(ev->>'sourceTitle',''));
   end loop;
   saved:=saved+1;
 end loop;
 update public.discovery_sessions set status='COMPLETED',stage='COMPLETE',progress=100,recommendations_saved=saved,completed_at=now(),updated_at=now() where id=s.id;
 update public.campaigns set status='READY',updated_at=now() where id=s.campaign_id;
 insert into public.campaign_timeline(organisation_id,campaign_id,event_type,title,description,visibility,metadata_json)
 values(s.organisation_id,s.campaign_id,'COMPANY_DISCOVERY_COMPLETED','Companies ready for review',saved||' matching companies are ready for your review.','CUSTOMER',jsonb_build_object('companyCount',saved));
 return saved;
end $$;

create or replace function public.fail_company_discovery(p_session_id uuid,p_error text)
returns void language plpgsql security definer set search_path=public as $$
begin
 update public.discovery_sessions set status='FAILED',last_error=left(p_error,1000),updated_at=now() where id=p_session_id;
end $$;

revoke all on function public.claim_company_discovery() from public,anon,authenticated;
revoke all on function public.update_company_discovery_progress(uuid,text,integer,integer) from public,anon,authenticated;
revoke all on function public.complete_company_discovery(uuid,jsonb) from public,anon,authenticated;
revoke all on function public.fail_company_discovery(uuid,text) from public,anon,authenticated;
grant execute on function public.claim_company_discovery(),public.update_company_discovery_progress(uuid,text,integer,integer),public.complete_company_discovery(uuid,jsonb),public.fail_company_discovery(uuid,text) to service_role;

create or replace view public.company_overview with (security_invoker = true) as
select c.*,ca.name as campaign_name,
 (select count(*) from public.company_evidence e where e.company_id=c.id) as evidence_count
from public.companies c join public.campaigns ca on ca.id=c.campaign_id;

create or replace view public.company_detail with (security_invoker = true) as
select c.*,ca.name as campaign_name,
 coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'claim',e.claim,'source_url',e.source_url,'excerpt',e.excerpt,'source_title',e.source_title,'created_at',e.created_at) order by e.created_at) from public.company_evidence e where e.company_id=c.id),'[]'::jsonb) as evidence,
 coalesce((select v.payload_json from public.company_versions v where v.company_id=c.id order by version_number desc limit 1),'{}'::jsonb) as payload
from public.companies c join public.campaigns ca on ca.id=c.campaign_id;
