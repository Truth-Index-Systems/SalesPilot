create extension if not exists pgcrypto;

create table if not exists public.organisations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.organisation_memberships (
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  user_id uuid not null,
  role text not null check (role in ('owner','admin','manager','member','viewer')),
  created_at timestamptz not null default now(),
  primary key (organisation_id,user_id)
);

create table if not exists public.business_profiles (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  website_url text not null,
  canonical_url text not null,
  company_name text not null,
  summary text not null,
  industry text not null,
  confidence numeric(5,4) not null check (confidence between 0 and 1),
  schema_version text not null,
  prompt_version text not null,
  model_reference text not null,
  status text not null default 'APPROVED' check (status in ('DRAFT','APPROVED','SUPERSEDED','ARCHIVED')),
  approved_at timestamptz,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.business_profile_versions (
  id uuid primary key default gen_random_uuid(),
  business_profile_id uuid not null references public.business_profiles(id) on delete cascade,
  version_number integer not null check (version_number > 0),
  payload_json jsonb not null,
  evidence_json jsonb not null default '[]'::jsonb,
  warnings_json jsonb not null default '[]'::jsonb,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  unique (business_profile_id,version_number)
);

create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  business_profile_id uuid not null references public.business_profiles(id) on delete restrict,
  name text not null,
  objective text not null,
  status text not null check (status in ('DRAFT','PREPARING','READY','FAILED','ARCHIVED')),
  automation_mode text not null check (automation_mode in ('autopilot','approval','assisted')),
  fit_score integer not null check (fit_score between 0 and 100),
  current_config_version integer not null default 1,
  launched_at timestamptz,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.campaign_config_versions (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  version_number integer not null check (version_number > 0),
  objective text not null,
  audience text not null,
  buyer_roles_json jsonb not null,
  message_angle text not null,
  recommended_mode text not null check (recommended_mode in ('autopilot','approval','assisted')),
  why_json jsonb not null,
  source_proposal_id text not null,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  unique (campaign_id,version_number)
);

create table if not exists public.campaign_timeline (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  event_type text not null,
  title text not null,
  description text,
  occurred_at timestamptz not null default now(),
  metadata_json jsonb not null default '{}'::jsonb,
  visibility text not null check (visibility in ('CUSTOMER','INTERNAL'))
);

create table if not exists public.domain_outbox (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null unique,
  event_type text not null,
  aggregate_type text not null,
  aggregate_id uuid not null,
  payload_json jsonb not null,
  occurred_at timestamptz not null default now(),
  processed_at timestamptz,
  attempt_count integer not null default 0,
  last_error text
);

create table if not exists public.idempotency_records (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  idempotency_key text not null,
  operation text not null,
  result_json jsonb not null,
  created_at timestamptz not null default now(),
  unique (organisation_id,idempotency_key,operation)
);

create index if not exists campaigns_organisation_created_idx on public.campaigns(organisation_id,created_at desc);
create index if not exists campaign_timeline_campaign_idx on public.campaign_timeline(campaign_id,occurred_at asc);
create index if not exists domain_outbox_pending_idx on public.domain_outbox(processed_at,occurred_at) where processed_at is null;

create or replace view public.campaign_overview with (security_invoker = true) as
select
  c.id,
  c.organisation_id,
  c.name,
  c.objective,
  c.status,
  c.automation_mode,
  c.fit_score,
  cfg.audience,
  c.created_at,
  latest.title as latest_progress
from public.campaigns c
join public.campaign_config_versions cfg
  on cfg.campaign_id=c.id and cfg.version_number=c.current_config_version
left join lateral (
  select t.title from public.campaign_timeline t
  where t.campaign_id=c.id and t.visibility='CUSTOMER'
  order by t.occurred_at desc, t.id desc limit 1
) latest on true;

create or replace view public.campaign_detail with (security_invoker = true) as
select
  overview.*,
  cfg.buyer_roles_json as buyer_roles,
  cfg.message_angle,
  cfg.why_json as why,
  bp.company_name as business_name,
  bp.summary as business_summary,
  bp.canonical_url as website_url,
  coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',t.id,
      'title',t.title,
      'description',t.description,
      'occurred_at',t.occurred_at
    ) order by t.occurred_at asc, t.id asc)
    from public.campaign_timeline t
    where t.campaign_id=overview.id and t.visibility='CUSTOMER'
  ),'[]'::jsonb) as timeline
from public.campaign_overview overview
join public.campaigns c on c.id=overview.id
join public.campaign_config_versions cfg on cfg.campaign_id=c.id and cfg.version_number=c.current_config_version
join public.business_profiles bp on bp.id=c.business_profile_id;

create or replace function public.launch_campaign(
  p_organisation_id uuid,
  p_created_by uuid,
  p_idempotency_key text,
  p_website_url text,
  p_analysis jsonb,
  p_selected_proposal_id text
) returns setof public.campaign_overview
language plpgsql
security definer
set search_path = public
as $$
declare
  existing jsonb;
  profile_id uuid;
  campaign_id uuid;
  proposal jsonb;
  event_id uuid := gen_random_uuid();
begin
  perform pg_advisory_xact_lock(hashtextextended(p_organisation_id::text || ':' || p_idempotency_key, 0));

  select result_json into existing from public.idempotency_records
    where organisation_id=p_organisation_id and idempotency_key=p_idempotency_key and operation='launch_campaign';
  if existing is not null then
    return query select * from public.campaign_overview where id=(existing->>'campaign_id')::uuid;
    return;
  end if;

  select item into proposal
  from jsonb_array_elements(p_analysis->'payload'->'campaigns') item
  where item->>'id'=p_selected_proposal_id
  limit 1;
  if proposal is null then raise exception 'Selected campaign proposal not found'; end if;

  insert into public.business_profiles(
    organisation_id,website_url,canonical_url,company_name,summary,industry,confidence,
    schema_version,prompt_version,model_reference,status,approved_at,created_by
  ) values (
    p_organisation_id,p_website_url,p_analysis->'payload'->'company'->>'website',
    p_analysis->'payload'->'company'->>'name',p_analysis->'payload'->'company'->>'summary',
    p_analysis->'payload'->'company'->>'industry',(p_analysis->>'confidence')::numeric,
    p_analysis->>'schemaVersion',p_analysis->>'promptVersion',p_analysis->>'model','APPROVED',now(),p_created_by
  ) returning id into profile_id;

  insert into public.business_profile_versions(business_profile_id,version_number,payload_json,evidence_json,warnings_json,created_by)
  values(profile_id,1,p_analysis->'payload',coalesce(p_analysis->'evidence','[]'::jsonb),coalesce(p_analysis->'warnings','[]'::jsonb),p_created_by);

  insert into public.campaigns(organisation_id,business_profile_id,name,objective,status,automation_mode,fit_score,current_config_version,launched_at,created_by)
  values(p_organisation_id,profile_id,proposal->>'name',proposal->>'objective','PREPARING',proposal->>'recommendedMode',(proposal->>'fitScore')::integer,1,now(),p_created_by)
  returning id into campaign_id;

  insert into public.campaign_config_versions(campaign_id,version_number,objective,audience,buyer_roles_json,message_angle,recommended_mode,why_json,source_proposal_id,created_by)
  values(campaign_id,1,proposal->>'objective',proposal->>'audience',proposal->'buyerRoles',proposal->>'messageAngle',proposal->>'recommendedMode',proposal->'why',proposal->>'id',p_created_by);

  insert into public.campaign_timeline(campaign_id,event_type,title,description,visibility) values
    (campaign_id,'CAMPAIGN_CREATED','Campaign created','Your approved strategy has been saved.','CUSTOMER'),
    (campaign_id,'BUSINESS_PROFILE_APPROVED','Business profile approved','MarketRoute saved what it understood about your business.','CUSTOMER'),
    (campaign_id,'STRATEGY_SELECTED','Strategy selected',proposal->>'name','CUSTOMER'),
    (campaign_id,'CAMPAIGN_PREPARATION_STARTED','Campaign preparation started','Company discovery is the next stage.','CUSTOMER');

  insert into public.domain_outbox(event_id,event_type,aggregate_type,aggregate_id,payload_json)
  values(event_id,'CampaignCreated','Campaign',campaign_id,jsonb_build_object('campaignId',campaign_id,'organisationId',p_organisation_id,'configVersion',1));

  insert into public.idempotency_records(organisation_id,idempotency_key,operation,result_json)
  values(p_organisation_id,p_idempotency_key,'launch_campaign',jsonb_build_object('campaign_id',campaign_id));

  return query select * from public.campaign_overview where id=campaign_id;
end;
$$;

alter table public.organisations enable row level security;
alter table public.organisation_memberships enable row level security;
alter table public.business_profiles enable row level security;
alter table public.business_profile_versions enable row level security;
alter table public.campaigns enable row level security;
alter table public.campaign_config_versions enable row level security;
alter table public.campaign_timeline enable row level security;
alter table public.domain_outbox enable row level security;
alter table public.idempotency_records enable row level security;

create policy organisations_member_read on public.organisations for select using (
  exists(select 1 from public.organisation_memberships m where m.organisation_id=id and m.user_id=auth.uid())
);
create policy memberships_self_read on public.organisation_memberships for select using (user_id=auth.uid());
create policy business_profiles_member_access on public.business_profiles for all using (
  exists(select 1 from public.organisation_memberships m where m.organisation_id=business_profiles.organisation_id and m.user_id=auth.uid())
) with check (
  exists(select 1 from public.organisation_memberships m where m.organisation_id=business_profiles.organisation_id and m.user_id=auth.uid())
);
create policy campaigns_member_access on public.campaigns for all using (
  exists(select 1 from public.organisation_memberships m where m.organisation_id=campaigns.organisation_id and m.user_id=auth.uid())
) with check (
  exists(select 1 from public.organisation_memberships m where m.organisation_id=campaigns.organisation_id and m.user_id=auth.uid())
);

create policy business_profile_versions_member_access on public.business_profile_versions for all using (
  exists(select 1 from public.business_profiles bp join public.organisation_memberships m on m.organisation_id=bp.organisation_id where bp.id=business_profile_versions.business_profile_id and m.user_id=auth.uid())
) with check (
  exists(select 1 from public.business_profiles bp join public.organisation_memberships m on m.organisation_id=bp.organisation_id where bp.id=business_profile_versions.business_profile_id and m.user_id=auth.uid())
);
create policy campaign_config_versions_member_access on public.campaign_config_versions for all using (
  exists(select 1 from public.campaigns c join public.organisation_memberships m on m.organisation_id=c.organisation_id where c.id=campaign_config_versions.campaign_id and m.user_id=auth.uid())
) with check (
  exists(select 1 from public.campaigns c join public.organisation_memberships m on m.organisation_id=c.organisation_id where c.id=campaign_config_versions.campaign_id and m.user_id=auth.uid())
);
create policy campaign_timeline_member_access on public.campaign_timeline for all using (
  exists(select 1 from public.campaigns c join public.organisation_memberships m on m.organisation_id=c.organisation_id where c.id=campaign_timeline.campaign_id and m.user_id=auth.uid())
) with check (
  exists(select 1 from public.campaigns c join public.organisation_memberships m on m.organisation_id=c.organisation_id where c.id=campaign_timeline.campaign_id and m.user_id=auth.uid())
);
revoke all on public.domain_outbox from anon, authenticated;
revoke all on public.idempotency_records from anon, authenticated;

revoke all on function public.launch_campaign(uuid,uuid,text,text,jsonb,text) from public, anon, authenticated;
grant execute on function public.launch_campaign(uuid,uuid,text,text,jsonb,text) to service_role;
