create extension if not exists pgcrypto;

alter table public.organisations add column if not exists updated_at timestamptz not null default now();
alter table public.organisation_memberships add column if not exists id uuid default gen_random_uuid();
alter table public.organisation_memberships add column if not exists status text not null default 'ACTIVE';
alter table public.organisation_memberships add column if not exists updated_at timestamptz not null default now();
alter table public.organisation_memberships drop constraint if exists organisation_memberships_role_check;
update public.organisation_memberships set role=case when upper(role)='MANAGER' then 'ADMIN' else upper(role) end, status=upper(status);
alter table public.organisation_memberships add constraint organisation_memberships_role_check check (role in ('OWNER','ADMIN','MEMBER','VIEWER'));
alter table public.organisation_memberships add constraint organisation_memberships_status_check check (status in ('ACTIVE','SUSPENDED','REMOVED'));
create unique index if not exists organisation_memberships_id_key on public.organisation_memberships(id);

alter table public.business_profiles alter column industry drop not null;
alter table public.business_profiles drop column if exists model_reference;
alter table public.business_profile_versions add column if not exists organisation_id uuid references public.organisations(id) on delete cascade;
update public.business_profile_versions v set organisation_id=p.organisation_id from public.business_profiles p where p.id=v.business_profile_id and v.organisation_id is null;
alter table public.business_profile_versions alter column organisation_id set not null;
alter table public.campaign_config_versions add column if not exists organisation_id uuid references public.organisations(id) on delete cascade;
update public.campaign_config_versions v set organisation_id=c.organisation_id from public.campaigns c where c.id=v.campaign_id and v.organisation_id is null;
alter table public.campaign_config_versions alter column organisation_id set not null;
alter table public.campaign_timeline add column if not exists organisation_id uuid references public.organisations(id) on delete cascade;
alter table public.campaign_timeline add column if not exists created_at timestamptz not null default now();
update public.campaign_timeline t set organisation_id=c.organisation_id from public.campaigns c where c.id=t.campaign_id and t.organisation_id is null;
alter table public.campaign_timeline alter column organisation_id set not null;
alter table public.domain_outbox add column if not exists organisation_id uuid references public.organisations(id) on delete cascade;
alter table public.domain_outbox add column if not exists created_at timestamptz not null default now();
update public.domain_outbox o set organisation_id=c.organisation_id from public.campaigns c where c.id=o.aggregate_id and o.aggregate_type='Campaign' and o.organisation_id is null;
alter table public.domain_outbox alter column organisation_id set not null;
do $$ begin
  if exists(select 1 from information_schema.columns where table_schema='public' and table_name='idempotency_records' and column_name='result_json')
     and not exists(select 1 from information_schema.columns where table_schema='public' and table_name='idempotency_records' and column_name='response_json') then
    alter table public.idempotency_records rename column result_json to response_json;
  end if;
end $$;
alter table public.idempotency_records add column if not exists resource_id uuid;
alter table public.idempotency_records add column if not exists created_by uuid;
alter table public.idempotency_records add column if not exists expires_at timestamptz;

alter table public.organisations enable row level security;
alter table public.organisation_memberships enable row level security;
alter table public.business_profiles enable row level security;
alter table public.business_profile_versions enable row level security;
alter table public.campaigns enable row level security;
alter table public.campaign_config_versions enable row level security;
alter table public.campaign_timeline enable row level security;
alter table public.domain_outbox enable row level security;
alter table public.idempotency_records enable row level security;

create or replace function public.is_active_org_member(p_org uuid) returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.organisation_memberships m where m.organisation_id=p_org and m.user_id=auth.uid() and m.status='ACTIVE');
$$;

create or replace function public.is_org_admin(p_org uuid) returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.organisation_memberships m where m.organisation_id=p_org and m.user_id=auth.uid() and m.status='ACTIVE' and m.role in ('OWNER','ADMIN'));
$$;

revoke all on function public.is_active_org_member(uuid) from public;
revoke all on function public.is_org_admin(uuid) from public;
grant execute on function public.is_active_org_member(uuid), public.is_org_admin(uuid) to authenticated, service_role;

do $$ declare r record; begin
  for r in select policyname, tablename from pg_policies where schemaname='public' and tablename in ('organisations','organisation_memberships','business_profiles','business_profile_versions','campaigns','campaign_config_versions','campaign_timeline','domain_outbox','idempotency_records') loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

create policy organisations_member_read on public.organisations for select to authenticated using (public.is_active_org_member(id));
create policy memberships_member_read on public.organisation_memberships for select to authenticated using (public.is_active_org_member(organisation_id));
create policy business_profiles_member_read on public.business_profiles for select to authenticated using (public.is_active_org_member(organisation_id));
create policy business_profile_versions_member_read on public.business_profile_versions for select to authenticated using (public.is_active_org_member(organisation_id));
create policy campaigns_member_read on public.campaigns for select to authenticated using (public.is_active_org_member(organisation_id));
create policy campaign_configs_member_read on public.campaign_config_versions for select to authenticated using (public.is_active_org_member(organisation_id));
create policy campaign_timeline_customer_read on public.campaign_timeline for select to authenticated using (visibility='CUSTOMER' and public.is_active_org_member(organisation_id));
-- No authenticated policies for domain_outbox or idempotency_records.

create or replace function public.launch_campaign(p_organisation_id uuid,p_created_by uuid,p_idempotency_key text,p_website_url text,p_analysis jsonb,p_selected_proposal_id text)
returns setof public.campaign_overview language plpgsql security definer set search_path=public as $$
declare existing jsonb; profile_id uuid; campaign_id uuid; proposal jsonb; event_id uuid:=gen_random_uuid(); canonical text;
begin
  if not exists(select 1 from public.organisation_memberships where organisation_id=p_organisation_id and user_id=p_created_by and status='ACTIVE' and role in ('OWNER','ADMIN')) then raise exception 'campaign launch forbidden'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_organisation_id::text||':'||p_idempotency_key,0));
  select response_json into existing from public.idempotency_records where organisation_id=p_organisation_id and idempotency_key=p_idempotency_key and operation='launch_campaign';
  if existing is not null then return query select * from public.campaign_overview where id=(existing->>'campaign_id')::uuid; return; end if;
  select item into proposal from jsonb_array_elements(p_analysis->'payload'->'campaigns') item where item->>'id'=p_selected_proposal_id limit 1;
  if proposal is null then raise exception 'selected proposal missing'; end if;
  canonical:=coalesce(nullif(p_analysis->'payload'->'company'->>'website',''),p_website_url);
  select id into profile_id from public.business_profiles where organisation_id=p_organisation_id and canonical_url=canonical and status='APPROVED' order by approved_at desc limit 1;
  if profile_id is null then
    insert into public.business_profiles(organisation_id,website_url,canonical_url,company_name,summary,industry,confidence,schema_version,prompt_version,status,approved_at,created_by)
    values(p_organisation_id,p_website_url,canonical,p_analysis->'payload'->'company'->>'name',p_analysis->'payload'->'company'->>'summary',nullif(p_analysis->'payload'->'company'->>'industry',''),(p_analysis->>'confidence')::numeric,p_analysis->>'schemaVersion',p_analysis->>'promptVersion','APPROVED',now(),p_created_by) returning id into profile_id;
    insert into public.business_profile_versions(organisation_id,business_profile_id,version_number,payload_json,evidence_json,warnings_json,created_by)
    values(p_organisation_id,profile_id,1,p_analysis->'payload',coalesce(p_analysis->'evidence','[]'::jsonb),coalesce(p_analysis->'warnings','[]'::jsonb),p_created_by);
  end if;
  insert into public.campaigns(organisation_id,business_profile_id,name,objective,status,automation_mode,fit_score,current_config_version,launched_at,created_by)
  values(p_organisation_id,profile_id,proposal->>'name',proposal->>'objective','PREPARING',proposal->>'recommendedMode',(proposal->>'fitScore')::integer,1,now(),p_created_by) returning id into campaign_id;
  insert into public.campaign_config_versions(organisation_id,campaign_id,version_number,objective,audience,buyer_roles_json,message_angle,recommended_mode,why_json,source_proposal_id,created_by)
  values(p_organisation_id,campaign_id,1,proposal->>'objective',proposal->>'audience',proposal->'buyerRoles',proposal->>'messageAngle',proposal->>'recommendedMode',proposal->'why',proposal->>'id',p_created_by);
  insert into public.campaign_timeline(organisation_id,campaign_id,event_type,title,description,visibility) values
  (p_organisation_id,campaign_id,'CAMPAIGN_CREATED','Campaign created','Your approved campaign has been saved.','CUSTOMER'),
  (p_organisation_id,campaign_id,'BUSINESS_PROFILE_APPROVED','Business profile approved','SalesPilot saved its approved understanding of your business.','CUSTOMER'),
  (p_organisation_id,campaign_id,'STRATEGY_SELECTED','Strategy selected','Your chosen campaign strategy is now in place.','CUSTOMER'),
  (p_organisation_id,campaign_id,'CAMPAIGN_PREPARATION_STARTED','Campaign preparation started','SalesPilot is preparing the campaign for the next stage.','CUSTOMER');
  insert into public.domain_outbox(organisation_id,event_id,event_type,aggregate_type,aggregate_id,payload_json,occurred_at)
  values(p_organisation_id,event_id,'CampaignCreated','Campaign',campaign_id,jsonb_build_object('campaignId',campaign_id,'organisationId',p_organisation_id,'businessProfileId',profile_id,'configVersion',1,'occurredAt',now()),now());
  insert into public.idempotency_records(organisation_id,idempotency_key,operation,resource_id,response_json,created_by)
  values(p_organisation_id,p_idempotency_key,'launch_campaign',campaign_id,jsonb_build_object('campaign_id',campaign_id),p_created_by);
  return query select * from public.campaign_overview where id=campaign_id;
end $$;
revoke all on function public.launch_campaign(uuid,uuid,text,text,jsonb,text) from public, anon, authenticated;
grant execute on function public.launch_campaign(uuid,uuid,text,text,jsonb,text) to service_role;
