-- Genesis G3.5 Phase 5: deterministic Opportunity -> Engagement bridge.
-- Approved opportunities are prepared for G4 using existing contact, route and
-- autonomy-policy truth. This migration does not generate or send outreach.

create table if not exists public.opportunity_engagements (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  status text not null default 'NEEDS_ROUTE'
    check (status in ('NEEDS_ROUTE','READY_FOR_DRAFT','DRAFT_REVIEW','APPROVED_TO_SEND','QUEUED_FOR_SEND','SENT','PAUSED','CANCELLED')),
  outreach_policy text not null default 'MANUAL'
    check (outreach_policy in ('MANUAL','REVIEW_FIRST','AUTO_SEND')),
  reply_policy text not null default 'SUGGEST'
    check (reply_policy in ('MANUAL','SUGGEST','AUTO_RESPOND')),
  market_learning_enabled boolean not null default false,
  channel_type text not null default 'NONE'
    check (channel_type in ('EMAIL','LINKEDIN','NONE')),
  recipient_name text,
  recipient_role text,
  recipient_email text,
  linkedin_profile_url text,
  route_verification_status text,
  route_source_url text,
  source_opportunity_score integer check (source_opportunity_score between 0 and 100),
  source_opportunity_rank integer not null default 1 check (source_opportunity_rank > 0),
  prepared_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id,campaign_id,opportunity_id)
);

create table if not exists public.opportunity_engagement_history (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  engagement_id uuid not null references public.opportunity_engagements(id) on delete cascade,
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  event_type text not null
    check (event_type in ('PREPARED','ROUTE_UPDATED','POLICY_UPDATED','PAUSED','CANCELLED','DRAFT_CREATED','APPROVED_TO_SEND','QUEUED','SENT')),
  previous_status text,
  next_status text,
  metadata_json jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create index if not exists opportunity_engagements_campaign_idx
  on public.opportunity_engagements(organisation_id,campaign_id,status,source_opportunity_rank,prepared_at);
create index if not exists opportunity_engagements_status_idx
  on public.opportunity_engagements(organisation_id,status,updated_at desc);
create index if not exists opportunity_engagement_history_idx
  on public.opportunity_engagement_history(organisation_id,engagement_id,occurred_at desc);

alter table public.opportunity_engagements enable row level security;
alter table public.opportunity_engagement_history enable row level security;

drop policy if exists opportunity_engagements_member_read on public.opportunity_engagements;
create policy opportunity_engagements_member_read on public.opportunity_engagements
for select to authenticated using (public.is_active_org_member(organisation_id));

drop policy if exists opportunity_engagement_history_member_read on public.opportunity_engagement_history;
create policy opportunity_engagement_history_member_read on public.opportunity_engagement_history
for select to authenticated using (public.is_active_org_member(organisation_id));

drop view if exists public.opportunity_engagement_overview;
create view public.opportunity_engagement_overview with (security_invoker=true) as
select
  e.*,
  ca.name as campaign_name,
  co.company_name,
  o.opportunity_score,
  o.buying_reason,
  o.recommended_action
from public.opportunity_engagements e
join public.campaigns ca on ca.id=e.campaign_id
join public.companies co on co.id=e.company_id
join public.opportunities o on o.id=e.opportunity_id;

create or replace function public.sync_opportunity_engagement_bridge(p_scheduler_run_id uuid)
returns table(created integer,updated integer,cancelled integer,"readyForDraft" integer,"needsRoute" integer)
language plpgsql security definer set search_path=public as $$
declare
  v_opp record;
  v_existing public.opportunity_engagements%rowtype;
  v_policy public.campaign_autonomy_policies%rowtype;
  v_email text;
  v_linkedin text;
  v_channel text;
  v_route_status text;
  v_route_source text;
  v_next_status text;
  v_engagement_id uuid;
  v_created integer:=0;
  v_updated integer:=0;
  v_cancelled integer:=0;
  v_ready integer:=0;
  v_needs integer:=0;
  v_changed boolean;
  v_event_id uuid;
begin
  if not exists(select 1 from public.pipeline_scheduler_runs where id=p_scheduler_run_id) then
    raise exception 'scheduler run required';
  end if;

  for v_opp in
    select
      o.*,
      ct.full_name as contact_name,
      ct.role_title as contact_role,
      ct.email_address as contact_email,
      ct.email_status as contact_email_status,
      ct.linkedin_profile_url as contact_linkedin,
      ch.email_address as route_email,
      ch.verification_status as route_verification_status,
      ch.source_url as route_source_url
    from public.opportunities o
    left join public.contacts ct on ct.id=o.primary_contact_id
    left join lateral (
      select cch.*
      from public.company_contact_channels cch
      where cch.organisation_id=o.organisation_id
        and cch.campaign_id=o.campaign_id
        and cch.company_id=o.company_id
        and cch.deliverability_status not in ('UNDELIVERABLE','BOUNCED')
      order by cch.is_primary desc,cch.routing_score desc,cch.created_at
      limit 1
    ) ch on true
    where o.status='APPROVED'
    order by o.campaign_id,o.rank,o.created_at
  loop
    select * into v_policy from public.campaign_autonomy_policies
    where organisation_id=v_opp.organisation_id and campaign_id=v_opp.campaign_id;
    if v_policy.campaign_id is null then
      insert into public.campaign_autonomy_policies(campaign_id,organisation_id)
      values(v_opp.campaign_id,v_opp.organisation_id)
      on conflict(campaign_id) do nothing;
      select * into v_policy from public.campaign_autonomy_policies
      where organisation_id=v_opp.organisation_id and campaign_id=v_opp.campaign_id;
    end if;

    v_email:=case
      when nullif(trim(coalesce(v_opp.contact_email,'')),'') is not null
        and coalesce(v_opp.contact_email_status,'UNKNOWN') in ('VERIFIED','LIKELY')
        then lower(trim(v_opp.contact_email))
      when nullif(trim(coalesce(v_opp.route_email,'')),'') is not null
        then lower(trim(v_opp.route_email))
      else null
    end;
    v_linkedin:=nullif(trim(coalesce(v_opp.contact_linkedin,'')),'');
    v_channel:=case when v_email is not null then 'EMAIL' when v_linkedin is not null then 'LINKEDIN' else 'NONE' end;
    v_route_status:=case when v_email=v_opp.contact_email then v_opp.contact_email_status else v_opp.route_verification_status end;
    v_route_source:=case when v_email=v_opp.route_email then v_opp.route_source_url else null end;
    v_next_status:=case when v_channel='NONE' then 'NEEDS_ROUTE' else 'READY_FOR_DRAFT' end;

    select * into v_existing from public.opportunity_engagements
    where organisation_id=v_opp.organisation_id and campaign_id=v_opp.campaign_id and opportunity_id=v_opp.id
    for update;

    if v_existing.id is null then
      insert into public.opportunity_engagements(
        organisation_id,campaign_id,opportunity_id,company_id,contact_id,status,
        outreach_policy,reply_policy,market_learning_enabled,channel_type,
        recipient_name,recipient_role,recipient_email,linkedin_profile_url,
        route_verification_status,route_source_url,source_opportunity_score,source_opportunity_rank
      ) values(
        v_opp.organisation_id,v_opp.campaign_id,v_opp.id,v_opp.company_id,v_opp.primary_contact_id,v_next_status,
        coalesce(v_policy.outreach_approval,'MANUAL'),coalesce(v_policy.reply_handling,'SUGGEST'),coalesce(v_policy.market_learning_enabled,false),v_channel,
        v_opp.contact_name,v_opp.contact_role,v_email,v_linkedin,
        v_route_status,v_route_source,v_opp.opportunity_score,v_opp.rank
      ) returning id into v_engagement_id;
      v_created:=v_created+1;
      insert into public.opportunity_engagement_history(
        organisation_id,campaign_id,engagement_id,opportunity_id,event_type,next_status,metadata_json
      ) values(
        v_opp.organisation_id,v_opp.campaign_id,v_engagement_id,v_opp.id,'PREPARED',v_next_status,
        jsonb_build_object('schedulerRunId',p_scheduler_run_id,'channelType',v_channel,'outreachPolicy',coalesce(v_policy.outreach_approval,'MANUAL'))
      );
      if not exists(
        select 1 from public.campaign_timeline t
        where t.organisation_id=v_opp.organisation_id and t.campaign_id=v_opp.campaign_id
          and t.event_type='ENGAGEMENT_PREPARED' and t.metadata_json->>'opportunityId'=v_opp.id::text
      ) then
        insert into public.campaign_timeline(
          organisation_id,campaign_id,event_type,title,description,visibility,metadata_json
        ) values(
          v_opp.organisation_id,v_opp.campaign_id,'ENGAGEMENT_PREPARED','Opportunity prepared for engagement',
          case when v_next_status='READY_FOR_DRAFT'
            then 'SalesPilot selected the strongest supported route and prepared this opportunity for personalised outreach.'
            else 'The opportunity is approved, but SalesPilot still needs a supported contact route before outreach can be prepared.' end,
          'CUSTOMER',jsonb_build_object('opportunityId',v_opp.id,'engagementId',v_engagement_id,'channelType',v_channel,'status',v_next_status)
        );
      end if;
      v_event_id:=gen_random_uuid();
      insert into public.domain_outbox(
        organisation_id,event_id,event_type,aggregate_type,aggregate_id,payload_json,occurred_at
      ) values(
        v_opp.organisation_id,v_event_id,'EngagementPrepared','OpportunityEngagement',v_engagement_id,
        jsonb_build_object('campaignId',v_opp.campaign_id,'opportunityId',v_opp.id,'companyId',v_opp.company_id,
          'contactId',v_opp.primary_contact_id,'status',v_next_status,'channelType',v_channel),now()
      );
    else
      v_changed:=v_existing.contact_id is distinct from v_opp.primary_contact_id
        or v_existing.status is distinct from v_next_status
        or v_existing.channel_type is distinct from v_channel
        or v_existing.recipient_email is distinct from v_email
        or v_existing.linkedin_profile_url is distinct from v_linkedin
        or v_existing.outreach_policy is distinct from coalesce(v_policy.outreach_approval,'MANUAL')
        or v_existing.reply_policy is distinct from coalesce(v_policy.reply_handling,'SUGGEST')
        or v_existing.market_learning_enabled is distinct from coalesce(v_policy.market_learning_enabled,false)
        or v_existing.source_opportunity_score is distinct from v_opp.opportunity_score
        or v_existing.source_opportunity_rank is distinct from v_opp.rank;

      if v_changed and v_existing.status not in ('SENT','QUEUED_FOR_SEND','APPROVED_TO_SEND','DRAFT_REVIEW') then
        update public.opportunity_engagements set
          contact_id=v_opp.primary_contact_id,status=v_next_status,
          outreach_policy=coalesce(v_policy.outreach_approval,'MANUAL'),
          reply_policy=coalesce(v_policy.reply_handling,'SUGGEST'),
          market_learning_enabled=coalesce(v_policy.market_learning_enabled,false),
          channel_type=v_channel,recipient_name=v_opp.contact_name,recipient_role=v_opp.contact_role,
          recipient_email=v_email,linkedin_profile_url=v_linkedin,
          route_verification_status=v_route_status,route_source_url=v_route_source,
          source_opportunity_score=v_opp.opportunity_score,source_opportunity_rank=v_opp.rank,updated_at=now()
        where id=v_existing.id;
        insert into public.opportunity_engagement_history(
          organisation_id,campaign_id,engagement_id,opportunity_id,event_type,previous_status,next_status,metadata_json
        ) values(
          v_opp.organisation_id,v_opp.campaign_id,v_existing.id,v_opp.id,
          case when v_existing.channel_type is distinct from v_channel or v_existing.recipient_email is distinct from v_email then 'ROUTE_UPDATED' else 'POLICY_UPDATED' end,
          v_existing.status,v_next_status,jsonb_build_object('schedulerRunId',p_scheduler_run_id,'channelType',v_channel)
        );
        v_updated:=v_updated+1;
      end if;
    end if;

    if v_next_status='READY_FOR_DRAFT' then v_ready:=v_ready+1; else v_needs:=v_needs+1; end if;
  end loop;

  for v_existing in
    select e.* from public.opportunity_engagements e
    join public.opportunities o on o.id=e.opportunity_id
    where o.status='REJECTED' and e.status not in ('SENT','CANCELLED')
    for update of e
  loop
    update public.opportunity_engagements set status='CANCELLED',updated_at=now() where id=v_existing.id;
    insert into public.opportunity_engagement_history(
      organisation_id,campaign_id,engagement_id,opportunity_id,event_type,previous_status,next_status,metadata_json
    ) values(
      v_existing.organisation_id,v_existing.campaign_id,v_existing.id,v_existing.opportunity_id,
      'CANCELLED',v_existing.status,'CANCELLED',jsonb_build_object('schedulerRunId',p_scheduler_run_id,'reason','OPPORTUNITY_REJECTED')
    );
    v_cancelled:=v_cancelled+1;
  end loop;

  return query select v_created,v_updated,v_cancelled,v_ready,v_needs;
end $$;

revoke all on function public.sync_opportunity_engagement_bridge(uuid) from public,anon,authenticated;
grant execute on function public.sync_opportunity_engagement_bridge(uuid) to service_role;

-- Backfill existing approved opportunities on the next scheduler cycle only.
-- The scheduler remains the sole owner of progression into Engagement.
