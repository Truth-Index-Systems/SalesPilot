-- Genesis G3.5 Phase 3: unified Opportunity Review.
-- Adds review metadata, evidence-rich opportunity detail, and campaign-scoped
-- individual/bulk review RPCs without replacing company or contact truth.

alter table public.opportunities
  add column if not exists review_note text,
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by uuid;

drop view if exists public.opportunity_detail;
drop view if exists public.opportunity_overview;

create view public.opportunity_overview with (security_invoker=true) as
select
  o.*,
  ca.name as campaign_name,
  co.company_name,
  co.website_url as company_website_url,
  co.industry as company_industry,
  co.country as company_country,
  co.summary as company_summary,
  co.confidence as company_confidence,
  ct.full_name as primary_contact_name,
  ct.role_title as primary_contact_role,
  ct.department as primary_contact_department,
  ct.location as primary_contact_location,
  ct.reason_selected as contact_reason_selected,
  ct.overall_confidence as primary_contact_confidence,
  ct.review_status as primary_contact_review_status,
  ct.email_address as primary_contact_email,
  ct.email_status as primary_contact_email_status,
  ct.linkedin_profile_url as primary_contact_linkedin_url,
  (select count(*) from public.company_evidence ce where ce.company_id=o.company_id) as company_evidence_count,
  (select count(*) from public.contact_evidence cte where cte.contact_id=o.primary_contact_id) as contact_evidence_count,
  ch.id as primary_route_id,
  ch.email_address as primary_route_email,
  ch.verification_status as primary_route_verification_status,
  ch.routing_score as primary_route_score,
  ch.likely_reader as primary_route_likely_reader,
  ch.reason_selected as primary_route_reason,
  ch.source_url as primary_route_source_url
from public.opportunities o
join public.campaigns ca on ca.id=o.campaign_id
join public.companies co on co.id=o.company_id
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
) ch on true;

create view public.opportunity_detail with (security_invoker=true) as
select
  ov.*,
  coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',ce.id,'claim',ce.claim,'sourceUrl',ce.source_url,'sourceTitle',ce.source_title,
      'excerpt',ce.excerpt,'sourceDomain',ce.source_domain,'verified',ce.verified,
      'excerptMatched',ce.excerpt_matched,
      'qualityScore',case when ce.excerpt_matched then 100 when ce.verified then 80 else 40 end,
      'createdAt',ce.created_at
    ) order by
      case when ce.excerpt_matched then 100 when ce.verified then 80 else 40 end desc,
      ce.created_at)
    from public.company_evidence ce where ce.company_id=ov.company_id
  ),'[]'::jsonb) as company_evidence,
  coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',cte.id,'evidenceType',cte.evidence_type,'claim',cte.claim,'sourceUrl',cte.source_url,
      'sourceTitle',cte.source_title,'excerpt',cte.excerpt,'sourceKind',cte.source_kind,
      'verified',cte.verified,'excerptMatched',cte.excerpt_matched,'qualityScore',cte.quality_score,
      'createdAt',cte.created_at
    ) order by cte.quality_score desc,cte.created_at)
    from public.contact_evidence cte where cte.contact_id=ov.primary_contact_id
  ),'[]'::jsonb) as contact_evidence,
  coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',h.id,'eventType',h.event_type,'previousStatus',h.previous_status,
      'nextStatus',h.next_status,'previousRank',h.previous_rank,'nextRank',h.next_rank,
      'metadata',h.metadata_json,'occurredAt',h.occurred_at
    ) order by h.occurred_at desc)
    from public.opportunity_history h where h.opportunity_id=ov.id
  ),'[]'::jsonb) as history
from public.opportunity_overview ov;

drop function if exists public.review_salespilot_opportunity_scoped(uuid,uuid,uuid,uuid,text);
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

  update public.opportunities set
    status=p_status,
    review_note=nullif(trim(coalesce(p_note,'')),''),
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
      jsonb_build_object('reviewedBy',p_user_id,'note',nullif(trim(coalesce(p_note,'')),''))
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
      jsonb_build_object('campaignId',p_campaign_id,'companyId',v_current.company_id,
        'primaryContactId',v_current.primary_contact_id,'status',p_status),now()
    );
  end if;
  return v_updated;
end $$;

revoke all on function public.review_salespilot_opportunity_scoped(uuid,uuid,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.review_salespilot_opportunity_scoped(uuid,uuid,uuid,uuid,text,text) to service_role;

create or replace function public.bulk_review_salespilot_opportunities_scoped(
  p_organisation_id uuid,
  p_campaign_id uuid,
  p_opportunity_ids uuid[],
  p_user_id uuid,
  p_status text,
  p_note text default null
) returns integer
language plpgsql security definer set search_path=public as $$
declare
  v_id uuid;
  v_count integer:=0;
begin
  if coalesce(array_length(p_opportunity_ids,1),0)=0 then return 0; end if;
  foreach v_id in array p_opportunity_ids loop
    perform public.review_salespilot_opportunity_scoped(
      p_organisation_id,p_campaign_id,v_id,p_user_id,p_status,p_note
    );
    v_count:=v_count+1;
  end loop;
  return v_count;
end $$;

revoke all on function public.bulk_review_salespilot_opportunities_scoped(uuid,uuid,uuid[],uuid,text,text) from public,anon,authenticated;
grant execute on function public.bulk_review_salespilot_opportunities_scoped(uuid,uuid,uuid[],uuid,text,text) to service_role;
