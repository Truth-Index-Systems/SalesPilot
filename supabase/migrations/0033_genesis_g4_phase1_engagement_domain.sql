-- MarketRoute Genesis G4 Phase 1: production Engagement domain.
-- Extends the frozen G3.5 Opportunity -> Engagement bridge. No AI generation,
-- drafting, scheduling or sending is introduced by this migration.

alter table public.opportunity_engagements
  add column if not exists generation_version text,
  add column if not exists prompt_version text,
  add column if not exists engagement_score integer check (engagement_score between 0 and 100),
  add column if not exists confidence integer check (confidence between 0 and 100),
  add column if not exists created_at timestamptz not null default now();

update public.opportunity_engagements
set created_at=prepared_at
where created_at is null;

alter table public.opportunity_engagement_history
  drop constraint if exists opportunity_engagement_history_event_type_check;
alter table public.opportunity_engagement_history
  add constraint opportunity_engagement_history_event_type_check
  check (event_type in (
    'PREPARED','ROUTE_UPDATED','POLICY_UPDATED','STATUS_CHANGED','UPDATED',
    'PAUSED','CANCELLED','DRAFT_CREATED','APPROVED_TO_SEND','QUEUED','SENT'
  ));

create table if not exists public.engagement_generation_history (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  engagement_id uuid not null references public.opportunity_engagements(id) on delete cascade,
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  generation_version text not null,
  prompt_version text,
  model text,
  output_json jsonb,
  score integer check (score between 0 and 100),
  confidence integer check (confidence between 0 and 100),
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.engagement_prompt_versions (
  id uuid primary key default gen_random_uuid(),
  version text not null unique,
  purpose text not null default 'FIRST_OUTREACH',
  system_prompt text not null,
  template_json jsonb not null default '{}'::jsonb,
  schema_version text not null,
  model text,
  active boolean not null default false,
  created_by uuid,
  created_at timestamptz not null default now(),
  retired_at timestamptz
);

create table if not exists public.engagement_review_history (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  engagement_id uuid not null references public.opportunity_engagements(id) on delete cascade,
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  review_type text not null check (review_type in ('AI_SELF_REVIEW','HUMAN_REVIEW')),
  outcome text not null check (outcome in ('APPROVED','EDITED','REJECTED','REGENERATE_REQUESTED')),
  score integer check (score between 0 and 100),
  confidence integer check (confidence between 0 and 100),
  review_json jsonb not null default '{}'::jsonb,
  reviewed_by uuid,
  created_at timestamptz not null default now()
);

create index if not exists engagement_generation_history_lookup_idx
  on public.engagement_generation_history(organisation_id,engagement_id,created_at desc);
create index if not exists engagement_review_history_lookup_idx
  on public.engagement_review_history(organisation_id,engagement_id,created_at desc);
create unique index if not exists engagement_prompt_versions_one_active_purpose_idx
  on public.engagement_prompt_versions(purpose) where active=true;

alter table public.engagement_generation_history enable row level security;
alter table public.engagement_prompt_versions enable row level security;
alter table public.engagement_review_history enable row level security;

drop policy if exists engagement_generation_history_member_read on public.engagement_generation_history;
create policy engagement_generation_history_member_read on public.engagement_generation_history
for select to authenticated using (public.is_active_org_member(organisation_id));

drop policy if exists engagement_prompt_versions_authenticated_read on public.engagement_prompt_versions;
create policy engagement_prompt_versions_authenticated_read on public.engagement_prompt_versions
for select to authenticated using (true);

drop policy if exists engagement_review_history_member_read on public.engagement_review_history;
create policy engagement_review_history_member_read on public.engagement_review_history
for select to authenticated using (public.is_active_org_member(organisation_id));

-- Explicit, tenant-scoped idempotent creation entrypoint. The scheduler bridge
-- remains the normal owner; this function supports controlled service use and tests.
create or replace function public.create_engagement_from_opportunity(
  p_organisation_id uuid,
  p_opportunity_id uuid,
  p_user_id uuid
) returns public.opportunity_engagements
language plpgsql security definer set search_path=public as $$
declare
  v_role text;
  v_opportunity public.opportunities%rowtype;
  v_policy public.campaign_autonomy_policies%rowtype;
  v_governance public.ai_governance_policies%rowtype;
  v_contact public.contacts%rowtype;
  v_existing public.opportunity_engagements%rowtype;
  v_created public.opportunity_engagements%rowtype;
  v_email text;
  v_channel text;
  v_status text;
  v_event_id uuid;
begin
  select role into v_role from public.organisation_memberships
  where organisation_id=p_organisation_id and user_id=p_user_id and status='ACTIVE' limit 1;
  if v_role is null then raise exception 'membership required'; end if;
  if v_role='VIEWER' then raise exception 'engagement write forbidden'; end if;

  select * into v_opportunity from public.opportunities
  where id=p_opportunity_id and organisation_id=p_organisation_id for update;
  if v_opportunity.id is null then raise exception 'opportunity not found'; end if;
  if v_opportunity.status <> 'APPROVED' then raise exception 'approved opportunity required'; end if;

  select * into v_existing from public.opportunity_engagements
  where organisation_id=p_organisation_id and opportunity_id=p_opportunity_id;
  if v_existing.id is not null then return v_existing; end if;

  select * into v_governance from public.ensure_ai_governance_policy(p_organisation_id);
  if not coalesce(v_governance.autonomy_enabled,false) then
    raise exception 'AI governance disabled';
  end if;

  select * into v_policy from public.campaign_autonomy_policies
  where organisation_id=p_organisation_id and campaign_id=v_opportunity.campaign_id;
  if v_policy.campaign_id is null then
    insert into public.campaign_autonomy_policies(campaign_id,organisation_id)
    values(v_opportunity.campaign_id,p_organisation_id)
    on conflict(campaign_id) do nothing;
    select * into v_policy from public.campaign_autonomy_policies
    where organisation_id=p_organisation_id and campaign_id=v_opportunity.campaign_id;
  end if;

  if v_opportunity.primary_contact_id is not null then
    select * into v_contact from public.contacts
    where id=v_opportunity.primary_contact_id and organisation_id=p_organisation_id;
  end if;
  v_email:=case when nullif(trim(coalesce(v_contact.email_address,'')),'') is not null
      and coalesce(v_contact.email_status,'UNKNOWN') in ('VERIFIED','LIKELY')
    then lower(trim(v_contact.email_address)) else null end;
  v_channel:=case when v_email is not null then 'EMAIL'
    when nullif(trim(coalesce(v_contact.linkedin_profile_url,'')),'') is not null then 'LINKEDIN'
    else 'NONE' end;
  v_status:=case when v_channel='NONE' then 'NEEDS_ROUTE' else 'READY_FOR_DRAFT' end;

  insert into public.opportunity_engagements(
    organisation_id,campaign_id,opportunity_id,company_id,contact_id,status,
    outreach_policy,reply_policy,market_learning_enabled,channel_type,
    recipient_name,recipient_role,recipient_email,linkedin_profile_url,
    route_verification_status,source_opportunity_score,source_opportunity_rank
  ) values(
    p_organisation_id,v_opportunity.campaign_id,v_opportunity.id,v_opportunity.company_id,v_opportunity.primary_contact_id,v_status,
    coalesce(v_policy.outreach_approval,'MANUAL'),coalesce(v_policy.reply_handling,'SUGGEST'),coalesce(v_policy.market_learning_enabled,false),v_channel,
    v_contact.full_name,v_contact.role_title,v_email,v_contact.linkedin_profile_url,
    v_contact.email_status,v_opportunity.opportunity_score,v_opportunity.rank
  ) returning * into v_created;

  insert into public.opportunity_engagement_history(
    organisation_id,campaign_id,engagement_id,opportunity_id,event_type,next_status,metadata_json
  ) values(
    p_organisation_id,v_created.campaign_id,v_created.id,v_created.opportunity_id,'PREPARED',v_created.status,
    jsonb_build_object('createdBy',p_user_id,'source','ENGAGEMENT_SERVICE','channelType',v_created.channel_type)
  );

  insert into public.campaign_timeline(
    organisation_id,campaign_id,event_type,title,description,visibility,metadata_json
  ) values(
    p_organisation_id,v_created.campaign_id,'ENGAGEMENT_CREATED','Engagement created',
    'An approved opportunity entered the engagement workflow. No outreach has been generated or sent.',
    'CUSTOMER',jsonb_build_object('opportunityId',v_created.opportunity_id,'engagementId',v_created.id,'status',v_created.status)
  );

  v_event_id:=gen_random_uuid();
  insert into public.domain_outbox(
    organisation_id,event_id,event_type,aggregate_type,aggregate_id,payload_json,occurred_at
  ) values(
    p_organisation_id,v_event_id,'EngagementCreated','Engagement',v_created.id,
    jsonb_build_object('campaignId',v_created.campaign_id,'opportunityId',v_created.opportunity_id,
      'companyId',v_created.company_id,'contactId',v_created.contact_id,'status',v_created.status),now()
  );

  return v_created;
end $$;

create or replace function public.update_salespilot_engagement(
  p_organisation_id uuid,
  p_engagement_id uuid,
  p_user_id uuid,
  p_status text default null,
  p_generation_version text default null,
  p_prompt_version text default null,
  p_engagement_score integer default null,
  p_confidence integer default null
) returns public.opportunity_engagements
language plpgsql security definer set search_path=public as $$ DECLARE
  v_role text;
  v_current public.opportunity_engagements%rowtype;
  v_updated public.opportunity_engagements%rowtype;
  v_next_status text;
begin
  select role into v_role from public.organisation_memberships
  where organisation_id=p_organisation_id and user_id=p_user_id and status='ACTIVE' limit 1;
  if v_role is null then raise exception 'membership required'; end if;
  if v_role='VIEWER' then raise exception 'engagement write forbidden'; end if;

  select * into v_current from public.opportunity_engagements
  where id=p_engagement_id and organisation_id=p_organisation_id for update;
  if v_current.id is null then raise exception 'engagement not found'; end if;

  v_next_status:=coalesce(p_status,v_current.status);
  if v_next_status not in ('NEEDS_ROUTE','READY_FOR_DRAFT','DRAFT_REVIEW','APPROVED_TO_SEND','QUEUED_FOR_SEND','SENT','PAUSED','CANCELLED') then
    raise exception 'invalid engagement status';
  end if;
  if p_engagement_score is not null and (p_engagement_score<0 or p_engagement_score>100) then raise exception 'invalid engagement score'; end if;
  if p_confidence is not null and (p_confidence<0 or p_confidence>100) then raise exception 'invalid engagement confidence'; end if;

  update public.opportunity_engagements set
    status=v_next_status,
    generation_version=coalesce(p_generation_version,generation_version),
    prompt_version=coalesce(p_prompt_version,prompt_version),
    engagement_score=coalesce(p_engagement_score,engagement_score),
    confidence=coalesce(p_confidence,confidence),
    updated_at=now()
  where id=v_current.id returning * into v_updated;

  if v_current.status is distinct from v_updated.status then
    insert into public.opportunity_engagement_history(
      organisation_id,campaign_id,engagement_id,opportunity_id,event_type,previous_status,next_status,metadata_json
    ) values(
      p_organisation_id,v_updated.campaign_id,v_updated.id,v_updated.opportunity_id,'STATUS_CHANGED',v_current.status,v_updated.status,
      jsonb_build_object('updatedBy',p_user_id)
    );
  elsif v_current.generation_version is distinct from v_updated.generation_version
     or v_current.prompt_version is distinct from v_updated.prompt_version
     or v_current.engagement_score is distinct from v_updated.engagement_score
     or v_current.confidence is distinct from v_updated.confidence then
    insert into public.opportunity_engagement_history(
      organisation_id,campaign_id,engagement_id,opportunity_id,event_type,previous_status,next_status,metadata_json
    ) values(
      p_organisation_id,v_updated.campaign_id,v_updated.id,v_updated.opportunity_id,'UPDATED',v_current.status,v_updated.status,
      jsonb_build_object('updatedBy',p_user_id)
    );
  end if;
  return v_updated;
end $$;

revoke all on function public.create_engagement_from_opportunity(uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function public.update_salespilot_engagement(uuid,uuid,uuid,text,text,text,integer,integer) from public,anon,authenticated;
grant execute on function public.create_engagement_from_opportunity(uuid,uuid,uuid) to service_role;
grant execute on function public.update_salespilot_engagement(uuid,uuid,uuid,text,text,text,integer,integer) to service_role;

-- Refresh the customer-facing view with G4 domain fields and opportunity context.
drop view if exists public.opportunity_engagement_overview;
create view public.opportunity_engagement_overview with (security_invoker=true) as
select
  e.*,
  ca.name as campaign_name,
  co.company_name,
  o.opportunity_score,
  o.buying_reason,
  o.operational_pain,
  o.recommended_action
from public.opportunity_engagements e
join public.campaigns ca on ca.id=e.campaign_id
join public.companies co on co.id=e.company_id
join public.opportunities o on o.id=e.opportunity_id;
