-- Genesis G4.7.6: Opportunity readiness freeze.
-- Route Intelligence, not the existence of any legacy contact row, is the
-- authority that unlocks opportunity review/approval.

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
    select co.*,cs.status as contact_session_status,cs.job_state as contact_job_state,
      cs.route_research_state,cs.stage as contact_stage
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

    -- G4.7 invariant: a partial/legacy contact is supporting evidence only.
    -- Opportunity review opens only when Route Intelligence itself is READY.
    if coalesce(v_company.route_research_state,'')='READY' then
      v_status:='READY';
      v_ready:=v_ready+1;
    elsif coalesce(v_company.route_research_state,'')='EXHAUSTED'
       or coalesce(v_company.contact_job_state,'') in ('COMPLETED','NO_RESULTS','EXHAUSTED','FAILED_TERMINAL')
       or (coalesce(v_company.contact_session_status,'')='COMPLETED' and coalesce(v_company.route_research_state,'')<>'READY') then
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
        jsonb_build_object('companyId',v_company.id,'primaryContactId',v_contact.id,'schedulerRunId',p_scheduler_run_id,'routeResearchState',v_company.route_research_state)
      );

      insert into public.campaign_timeline(
        organisation_id,campaign_id,event_type,title,description,visibility,metadata_json
      ) values(
        v_company.organisation_id,v_company.campaign_id,'OPPORTUNITY_CREATED','Opportunity created',
        case when v_status='READY' then v_company.company_name||' has completed Route Intelligence and is ready for opportunity review.'
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
       or (v_existing.status not in ('APPROVED','REJECTED','ENGAGED') and v_existing.status is distinct from v_status) then
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
        jsonb_build_object('previousContactId',v_existing.primary_contact_id,'primaryContactId',v_contact.id,'schedulerRunId',p_scheduler_run_id,'routeResearchState',v_company.route_research_state)
      );
    end if;

    v_contact:=null;
    v_existing:=null;
  end loop;

  with ranked_rows as (
    select id,row_number() over(partition by organisation_id,campaign_id order by created_at,id)::integer as new_rank
    from public.opportunities
  ), changed as (
    update public.opportunities o set rank=r.new_rank,updated_at=case when o.rank<>r.new_rank then now() else o.updated_at end
    from ranked_rows r where o.id=r.id and o.rank<>r.new_rank
    returning o.id
  ) select count(*) into v_ranked from changed;

  return query select v_created,v_updated,v_ranked,v_ready,v_needs_contact;
end $$;

revoke all on function public.sync_opportunity_foundations(uuid) from public,anon,authenticated;
grant execute on function public.sync_opportunity_foundations(uuid) to service_role;

create or replace function public.apply_route_intelligence_opportunity_scoring(p_scheduler_run_id uuid)
returns integer language plpgsql security definer set search_path=public as $$
declare v_updated integer:=0;
begin
  if not exists(select 1 from public.pipeline_scheduler_lease where singleton=true and run_id=p_scheduler_run_id and lease_expires_at>now()) then raise exception 'PIPELINE_SCHEDULER_LEASE_NOT_HELD'; end if;
  with best as (
    select distinct on (r.organisation_id,r.campaign_id,r.company_id) r.*
    from public.commercial_routes r
    order by r.organisation_id,r.campaign_id,r.company_id,r.is_primary desc,r.is_viable desc,r.route_quality desc,r.confidence desc
  ), changed as (
    update public.opportunities o set
      route_quality=b.route_quality,
      route_confidence=b.confidence,
      recommended_entry_strategy=b.next_step,
      opportunity_score=least(100,greatest(0,round(
        coalesce(o.company_fit,0)::numeric*0.24+coalesce(o.operational_fit,0)::numeric*0.18+b.route_quality::numeric*0.24+b.confidence::numeric*0.10+
        coalesce(o.evidence_quality,0)::numeric*0.10+coalesce(o.commercial_value,0)::numeric*0.08+coalesce(o.urgency,0)::numeric*0.06
      )::integer)),
      score_explanation_json=coalesce(o.score_explanation_json,'{}'::jsonb)||jsonb_build_object('routeIntelligence',jsonb_build_object('routeId',b.id,'routeType',b.route_type,'routeQuality',b.route_quality,'routeConfidence',b.confidence,'authority',b.authority,'accessibility',b.accessibility,'resilience',b.resilience,'difficulty',b.difficulty)),
      status=case
        when o.status in ('REJECTED','ENGAGED') then o.status
        when cs.route_research_state='READY' and b.is_viable and b.route_quality>=50 then case when o.status='APPROVED' then 'APPROVED' else 'READY' end
        when cs.route_research_state in ('PLANNING','RESEARCHING','EXPANDING') or cs.status in ('RUNNING','QUEUED') then 'BUILDING'
        when cs.route_research_state='EXHAUSTED' and b.evidence_quality<35 then 'NEEDS_EVIDENCE'
        when cs.route_research_state='EXHAUSTED' then 'NEEDS_CONTACT'
        else 'BUILDING' end,
      recommended_action=case when cs.route_research_state='READY' and b.is_viable then b.next_step else 'Continue Route Intelligence until the route-readiness gate is complete.' end,
      scoring_version='opportunity-score/v3-route-intelligence',scored_at=now(),updated_at=now()
    from best b
    join public.contact_discovery_sessions cs on cs.organisation_id=b.organisation_id and cs.campaign_id=b.campaign_id and cs.company_id=b.company_id
    where o.organisation_id=b.organisation_id and o.campaign_id=b.campaign_id and o.company_id=b.company_id and o.status not in ('REJECTED','ENGAGED')
    returning o.id
  ) select count(*) into v_updated from changed;

  with ranked as (select id,row_number() over(partition by campaign_id order by opportunity_score desc nulls last,route_quality desc nulls last,created_at) as next_rank from public.opportunities where status<>'REJECTED')
  update public.opportunities o set rank=r.next_rank,updated_at=case when o.rank<>r.next_rank then now() else o.updated_at end from ranked r where o.id=r.id;
  return v_updated;
end $$;

revoke all on function public.apply_route_intelligence_opportunity_scoring(uuid) from public,anon,authenticated;
grant execute on function public.apply_route_intelligence_opportunity_scoring(uuid) to service_role;

-- Server-side review gate. Client controls are convenience only; approval is
-- impossible unless Route Intelligence has completed its readiness contract.
create or replace function public.review_salespilot_opportunity_scoped(
  p_organisation_id uuid,
  p_campaign_id uuid,
  p_opportunity_id uuid,
  p_user_id uuid,
  p_status text,
  p_note text default null
) returns public.opportunities
language plpgsql security definer set search_path=public as $$
declare
  v_current public.opportunities%rowtype;
  v_updated public.opportunities%rowtype;
  v_role text;
  v_event_type text;
  v_title text;
  v_event_id uuid;
  v_route_state text;
  v_viable_count integer:=0;
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

  if p_status='APPROVED' then
    select cs.route_research_state into v_route_state
    from public.contact_discovery_sessions cs
    where cs.organisation_id=v_current.organisation_id and cs.campaign_id=v_current.campaign_id and cs.company_id=v_current.company_id
    limit 1;
    select count(*) into v_viable_count from public.commercial_routes cr
    where cr.organisation_id=v_current.organisation_id and cr.campaign_id=v_current.campaign_id and cr.company_id=v_current.company_id and cr.is_viable=true;
    if v_current.status<>'READY' or coalesce(v_route_state,'')<>'READY' or v_viable_count<1 then
      raise exception 'OPPORTUNITY_ROUTE_INTELLIGENCE_NOT_READY';
    end if;
  end if;

  update public.opportunities set
    status=p_status,
    review_note=nullif(trim(coalesce(p_note,'')),'') ,
    reviewed_at=now(),
    reviewed_by=p_user_id,
    updated_at=now()
  where id=v_current.id returning * into v_updated;

  if v_current.status is distinct from p_status or v_current.review_note is distinct from nullif(trim(coalesce(p_note,'')),'') then
    insert into public.opportunity_history(
      organisation_id,campaign_id,opportunity_id,event_type,previous_status,next_status,
      previous_rank,next_rank,metadata_json
    ) values(
      p_organisation_id,p_campaign_id,v_current.id,
      case when p_status='APPROVED' then 'APPROVED' else 'REJECTED' end,
      v_current.status,p_status,v_current.rank,v_current.rank,
      jsonb_build_object('reviewedBy',p_user_id,'note',nullif(trim(coalesce(p_note,'')),'') ,'routeResearchState',v_route_state,'viableRouteCount',v_viable_count)
    );

    v_event_type:=case when p_status='APPROVED' then 'OpportunityApproved' else 'OpportunityRejected' end;
    v_title:=case when p_status='APPROVED' then 'Opportunity approved' else 'Opportunity not selected' end;
    insert into public.campaign_timeline(
      organisation_id,campaign_id,event_type,title,description,visibility,metadata_json
    ) values(
      p_organisation_id,p_campaign_id,upper(v_event_type),v_title,
      case when p_status='APPROVED' then 'The completed opportunity is approved for the next engagement stage.'
           else 'The opportunity was removed from active consideration.' end,
      'CUSTOMER',jsonb_build_object('opportunityId',v_current.id,'companyId',v_current.company_id,'status',p_status)
    );

    v_event_id:=gen_random_uuid();
    insert into public.domain_outbox(
      organisation_id,event_id,event_type,aggregate_type,aggregate_id,payload_json,occurred_at
    ) values(
      p_organisation_id,v_event_id,v_event_type,'Opportunity',v_current.id,
      jsonb_build_object('campaignId',p_campaign_id,'companyId',v_current.company_id,
        'primaryContactId',v_current.primary_contact_id,'status',p_status),now()
    );
  end if;
  return v_updated;
end $$;

revoke all on function public.review_salespilot_opportunity_scoped(uuid,uuid,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.review_salespilot_opportunity_scoped(uuid,uuid,uuid,uuid,text,text) to service_role;

-- Repair impossible pre-G4.7 approvals that have no completed route readiness.
-- Do not disturb opportunities that have already entered engagement execution.
update public.opportunities o
set status=case when coalesce(cs.route_research_state,'')='EXHAUSTED' then 'NEEDS_CONTACT' else 'BUILDING' end,
    reviewed_at=null,reviewed_by=null,updated_at=now()
from public.contact_discovery_sessions cs
where o.organisation_id=cs.organisation_id and o.campaign_id=cs.campaign_id and o.company_id=cs.company_id
  and o.status='APPROVED'
  and coalesce(cs.route_research_state,'')<>'READY'
  and not exists(
    select 1
    from public.opportunity_engagements e
    where e.opportunity_id=o.id
      and e.status in ('APPROVED_TO_SEND','QUEUED_FOR_SEND','SENT')
  );
