-- Genesis G3.5 Phase 1: Opportunity domain foundation.
-- Composes existing company/contact/evidence records into one campaign-scoped
-- commercial opportunity. No G2/G3 data or UI is replaced.

create table if not exists public.opportunities (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  primary_contact_id uuid references public.contacts(id) on delete set null,
  status text not null default 'BUILDING'
    check (status in ('BUILDING','READY','NEEDS_CONTACT','NEEDS_EVIDENCE','LOW_PRIORITY','APPROVED','REJECTED','ENGAGED')),
  opportunity_score integer check (opportunity_score between 0 and 100),
  company_fit integer check (company_fit between 0 and 100),
  operational_fit integer check (operational_fit between 0 and 100),
  buying_authority integer check (buying_authority between 0 and 100),
  contactability integer check (contactability between 0 and 100),
  commercial_value integer check (commercial_value between 0 and 100),
  evidence_quality integer check (evidence_quality between 0 and 100),
  urgency integer check (urgency between 0 and 100),
  buying_reason text,
  recommended_action text,
  rank integer not null default 1 check (rank > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id,campaign_id,company_id)
);

create table if not exists public.opportunity_history (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  event_type text not null
    check (event_type in ('CREATED','UPDATED','RANK_CHANGED','APPROVED','REJECTED','ENGAGED')),
  previous_status text,
  next_status text,
  previous_rank integer,
  next_rank integer,
  metadata_json jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create index if not exists opportunities_campaign_rank_idx
  on public.opportunities(organisation_id,campaign_id,rank,created_at);
create index if not exists opportunities_status_idx
  on public.opportunities(organisation_id,status,updated_at desc);
create index if not exists opportunities_contact_idx
  on public.opportunities(organisation_id,primary_contact_id)
  where primary_contact_id is not null;
create index if not exists opportunity_history_opportunity_idx
  on public.opportunity_history(organisation_id,opportunity_id,occurred_at desc);

alter table public.opportunities enable row level security;
alter table public.opportunity_history enable row level security;

drop policy if exists opportunities_member_read on public.opportunities;
create policy opportunities_member_read on public.opportunities
for select to authenticated using (public.is_active_org_member(organisation_id));

drop policy if exists opportunity_history_member_read on public.opportunity_history;
create policy opportunity_history_member_read on public.opportunity_history
for select to authenticated using (public.is_active_org_member(organisation_id));

create or replace view public.opportunity_overview with (security_invoker=true) as
select
  o.*,
  ca.name as campaign_name,
  co.company_name,
  co.website_url as company_website_url,
  co.industry as company_industry,
  co.country as company_country,
  co.confidence as company_confidence,
  ct.full_name as primary_contact_name,
  ct.role_title as primary_contact_role,
  ct.overall_confidence as primary_contact_confidence,
  ct.review_status as primary_contact_review_status,
  ct.email_address as primary_contact_email,
  ct.email_status as primary_contact_email_status,
  ct.linkedin_profile_url as primary_contact_linkedin_url,
  (select count(*) from public.company_evidence ce where ce.company_id=o.company_id) as company_evidence_count,
  (select count(*) from public.contact_evidence cte where cte.contact_id=o.primary_contact_id) as contact_evidence_count
from public.opportunities o
join public.campaigns ca on ca.id=o.campaign_id
join public.companies co on co.id=o.company_id
left join public.contacts ct on ct.id=o.primary_contact_id;

create or replace view public.opportunity_detail with (security_invoker=true) as
select
  ov.*,
  co.summary as company_summary,
  ct.reason_selected as contact_reason_selected,
  ct.department as primary_contact_department,
  ct.location as primary_contact_location,
  coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',h.id,'eventType',h.event_type,'previousStatus',h.previous_status,
      'nextStatus',h.next_status,'previousRank',h.previous_rank,'nextRank',h.next_rank,
      'metadata',h.metadata_json,'occurredAt',h.occurred_at
    ) order by h.occurred_at desc)
    from public.opportunity_history h where h.opportunity_id=ov.id
  ),'[]'::jsonb) as history
from public.opportunity_overview ov
join public.companies co on co.id=ov.company_id
left join public.contacts ct on ct.id=ov.primary_contact_id;

create or replace function public.sync_opportunity_foundations(p_scheduler_run_id uuid)
returns table(created integer,updated integer,ranked integer,ready integer,"needsContact" integer)
language plpgsql security definer set search_path=public as $$
declare
  v_company record;
  v_existing public.opportunities%rowtype;
  v_contact public.contacts%rowtype;
  v_status text;
  v_rank integer;
  v_created integer:=0;
  v_updated integer:=0;
  v_ranked integer:=0;
  v_ready integer:=0;
  v_needs_contact integer:=0;
  v_opp_id uuid;
  v_event_id uuid;
begin
  if not exists(
    select 1 from public.pipeline_scheduler_lease
    where singleton=true and run_id=p_scheduler_run_id and lease_expires_at>now()
  ) then raise exception 'PIPELINE_SCHEDULER_LEASE_NOT_HELD'; end if;

  for v_company in
    select co.*,cs.status as contact_session_status,cs.job_state as contact_job_state
    from public.companies co
    left join public.contact_discovery_sessions cs
      on cs.organisation_id=co.organisation_id and cs.campaign_id=co.campaign_id and cs.company_id=co.id
    join public.campaigns ca on ca.id=co.campaign_id
    where co.review_status='APPROVED' and ca.status not in ('PAUSED','CANCELLED')
    order by co.campaign_id,co.created_at
    for update of co skip locked
  loop
    select c.* into v_contact
    from public.contacts c
    where c.organisation_id=v_company.organisation_id
      and c.campaign_id=v_company.campaign_id
      and c.company_id=v_company.id
      and c.review_status not in ('REJECTED','ARCHIVED')
    order by
      case c.review_status when 'APPROVED' then 0 when 'PENDING_REVIEW' then 1 when 'HOLD' then 2 else 3 end,
      c.buying_relevance desc,c.operational_relevance desc,c.overall_confidence desc,c.created_at
    limit 1;

    if v_contact.id is not null then
      v_status:='READY';
      v_ready:=v_ready+1;
    elsif coalesce(v_company.contact_job_state,'') in ('COMPLETED','NO_RESULTS','EXHAUSTED','FAILED_TERMINAL')
       or coalesce(v_company.contact_session_status,'')='COMPLETED' then
      v_status:='NEEDS_CONTACT';
      v_needs_contact:=v_needs_contact+1;
    else
      v_status:='BUILDING';
    end if;

    select * into v_existing from public.opportunities
    where organisation_id=v_company.organisation_id
      and campaign_id=v_company.campaign_id
      and company_id=v_company.id
    for update;

    if v_existing.id is null then
      select coalesce(max(o.rank),0)+1 into v_rank
      from public.opportunities o
      where o.organisation_id=v_company.organisation_id and o.campaign_id=v_company.campaign_id;

      insert into public.opportunities(
        organisation_id,campaign_id,company_id,primary_contact_id,status,rank
      ) values(
        v_company.organisation_id,v_company.campaign_id,v_company.id,v_contact.id,v_status,v_rank
      ) returning id into v_opp_id;
      v_created:=v_created+1;

      insert into public.opportunity_history(
        organisation_id,campaign_id,opportunity_id,event_type,next_status,next_rank,metadata_json
      ) values(
        v_company.organisation_id,v_company.campaign_id,v_opp_id,'CREATED',v_status,v_rank,
        jsonb_build_object('companyId',v_company.id,'primaryContactId',v_contact.id,'schedulerRunId',p_scheduler_run_id)
      );

      insert into public.opportunity_history(
        organisation_id,campaign_id,opportunity_id,event_type,next_status,next_rank,metadata_json
      ) values(
        v_company.organisation_id,v_company.campaign_id,v_opp_id,'RANK_CHANGED',v_status,v_rank,
        jsonb_build_object('rankingMode','CREATION_ORDER','schedulerRunId',p_scheduler_run_id)
      );

      insert into public.campaign_timeline(
        organisation_id,campaign_id,event_type,title,description,visibility,metadata_json
      ) values(
        v_company.organisation_id,v_company.campaign_id,'OPPORTUNITY_CREATED','Opportunity created',
        case when v_status='READY' then v_company.company_name||' now has a recommended buying contact.'
             else v_company.company_name||' is being assembled into a complete sales opportunity.' end,
        'CUSTOMER',jsonb_build_object('opportunityId',v_opp_id,'companyId',v_company.id,'status',v_status,'rank',v_rank)
      );

      v_event_id:=gen_random_uuid();
      insert into public.domain_outbox(
        organisation_id,event_id,event_type,aggregate_type,aggregate_id,payload_json,occurred_at
      ) values(
        v_company.organisation_id,v_event_id,'OpportunityCreated','Opportunity',v_opp_id,
        jsonb_build_object('campaignId',v_company.campaign_id,'companyId',v_company.id,'primaryContactId',v_contact.id,'status',v_status,'rank',v_rank),now()
      );
    elsif v_existing.primary_contact_id is distinct from v_contact.id
       or v_existing.status is distinct from v_status then
      update public.opportunities set
        primary_contact_id=v_contact.id,
        status=case when status in ('APPROVED','REJECTED','ENGAGED') then status else v_status end,
        updated_at=now()
      where id=v_existing.id;
      v_updated:=v_updated+1;

      insert into public.opportunity_history(
        organisation_id,campaign_id,opportunity_id,event_type,previous_status,next_status,
        previous_rank,next_rank,metadata_json
      ) values(
        v_existing.organisation_id,v_existing.campaign_id,v_existing.id,'UPDATED',v_existing.status,
        case when v_existing.status in ('APPROVED','REJECTED','ENGAGED') then v_existing.status else v_status end,
        v_existing.rank,v_existing.rank,
        jsonb_build_object('previousContactId',v_existing.primary_contact_id,'primaryContactId',v_contact.id,'schedulerRunId',p_scheduler_run_id)
      );


      v_event_id:=gen_random_uuid();
      insert into public.domain_outbox(
        organisation_id,event_id,event_type,aggregate_type,aggregate_id,payload_json,occurred_at
      ) values(
        v_existing.organisation_id,v_event_id,'OpportunityUpdated','Opportunity',v_existing.id,
        jsonb_build_object('campaignId',v_existing.campaign_id,'companyId',v_existing.company_id,
          'previousContactId',v_existing.primary_contact_id,'primaryContactId',v_contact.id,'status',v_status),now()
      );
    end if;

    v_contact:=null;
    v_existing:=null;
  end loop;

  -- Phase 1 ranking is intentionally deterministic: creation order within each campaign.
  with ranked_rows as (
    select id,row_number() over(partition by organisation_id,campaign_id order by created_at,id)::integer as new_rank
    from public.opportunities
  ), changed as (
    update public.opportunities o set rank=r.new_rank,updated_at=case when o.rank<>r.new_rank then now() else o.updated_at end
    from ranked_rows r where o.id=r.id and o.rank<>r.new_rank
    returning o.id,o.organisation_id,o.campaign_id,o.rank
  ) select count(*) into v_ranked from changed;

  return query select v_created,v_updated,v_ranked,v_ready,v_needs_contact;
end $$;

revoke all on function public.sync_opportunity_foundations(uuid) from public,anon,authenticated;
grant execute on function public.sync_opportunity_foundations(uuid) to service_role;

-- Backfill existing approved companies without requiring an AI request. The
-- first scheduler run after deployment performs the authoritative materialisation.

-- Extend scheduler diagnostics without changing the existing RPC caller contract.
drop function if exists public.record_pipeline_scheduler_outcome(uuid,jsonb,jsonb);
create or replace function public.record_pipeline_scheduler_outcome(
  p_run_id uuid,
  p_company_result jsonb,
  p_contact_result jsonb,
  p_opportunity_result jsonb default null
) returns void language plpgsql security definer set search_path=public as $$
begin
  update public.pipeline_scheduler_runs
  set outcome_json=jsonb_build_object(
    'company',coalesce(p_company_result,'{}'::jsonb),
    'contact',coalesce(p_contact_result,'{}'::jsonb),
    'opportunity',coalesce(p_opportunity_result,'{}'::jsonb)
  )
  where id=p_run_id;
end $$;
revoke all on function public.record_pipeline_scheduler_outcome(uuid,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.record_pipeline_scheduler_outcome(uuid,jsonb,jsonb,jsonb) to service_role;

create or replace function public.review_salespilot_opportunity_scoped(
  p_organisation_id uuid,
  p_campaign_id uuid,
  p_opportunity_id uuid,
  p_user_id uuid,
  p_status text
) returns public.opportunities
language plpgsql security definer set search_path=public as $$
declare
  v_current public.opportunities%rowtype;
  v_updated public.opportunities%rowtype;
  v_role text;
  v_event_type text;
  v_title text;
  v_event_id uuid;
begin
  if p_status not in ('APPROVED','REJECTED') then raise exception 'invalid opportunity review status'; end if;
  select role into v_role from public.organisation_memberships
  where organisation_id=p_organisation_id and user_id=p_user_id and status='ACTIVE' limit 1;
  if v_role is null then raise exception 'membership required'; end if;
  if v_role='VIEWER' then raise exception 'review forbidden'; end if;

  select * into v_current from public.opportunities
  where id=p_opportunity_id and organisation_id=p_organisation_id and campaign_id=p_campaign_id
  for update;
  if v_current.id is null then raise exception 'campaign opportunity not found'; end if;
  if v_current.status=p_status then return v_current; end if;

  update public.opportunities set status=p_status,updated_at=now()
  where id=v_current.id returning * into v_updated;

  insert into public.opportunity_history(
    organisation_id,campaign_id,opportunity_id,event_type,previous_status,next_status,
    previous_rank,next_rank,metadata_json
  ) values(
    p_organisation_id,p_campaign_id,v_current.id,
    case when p_status='APPROVED' then 'APPROVED' else 'REJECTED' end,
    v_current.status,p_status,v_current.rank,v_current.rank,jsonb_build_object('reviewedBy',p_user_id)
  );

  v_event_type:=case when p_status='APPROVED' then 'OpportunityApproved' else 'OpportunityRejected' end;
  v_title:=case when p_status='APPROVED' then 'Opportunity approved' else 'Opportunity not selected' end;
  insert into public.campaign_timeline(
    organisation_id,campaign_id,event_type,title,description,visibility,metadata_json
  ) values(
    p_organisation_id,p_campaign_id,upper(v_event_type),v_title,
    case when p_status='APPROVED' then 'The opportunity is approved for the next engagement stage.'
         else 'The opportunity was removed from active consideration.' end,
    'CUSTOMER',jsonb_build_object('opportunityId',v_current.id,'companyId',v_current.company_id,'status',p_status)
  );

  v_event_id:=gen_random_uuid();
  insert into public.domain_outbox(
    organisation_id,event_id,event_type,aggregate_type,aggregate_id,payload_json,occurred_at
  ) values(
    p_organisation_id,v_event_id,v_event_type,'Opportunity',v_current.id,
    jsonb_build_object('campaignId',p_campaign_id,'companyId',v_current.company_id,'primaryContactId',v_current.primary_contact_id,'status',p_status),now()
  );
  return v_updated;
end $$;

revoke all on function public.review_salespilot_opportunity_scoped(uuid,uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.review_salespilot_opportunity_scoped(uuid,uuid,uuid,uuid,text) to service_role;
