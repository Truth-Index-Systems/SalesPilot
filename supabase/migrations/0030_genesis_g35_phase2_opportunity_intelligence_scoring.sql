-- Genesis G3.5 Phase 2: Opportunity Intelligence scoring.
-- Scores and ranks complete commercial opportunities from already-persisted
-- company, contact, route and evidence intelligence. This migration performs
-- no AI or web requests and does not hide low-scoring opportunities.

alter table public.opportunities
  add column if not exists operational_pain text,
  add column if not exists score_explanation_json jsonb not null default '{}'::jsonb,
  add column if not exists scoring_version text,
  add column if not exists scored_at timestamptz;

create index if not exists opportunities_score_rank_idx
  on public.opportunities(organisation_id,campaign_id,opportunity_score desc nulls last,rank);

-- o.* expands when columns are appended, so rebuild the views rather than using
-- CREATE OR REPLACE and accidentally changing an existing view column position.
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
  co.confidence as company_confidence,
  ct.full_name as primary_contact_name,
  ct.role_title as primary_contact_role,
  ct.overall_confidence as primary_contact_confidence,
  ct.review_status as primary_contact_review_status,
  ct.email_address as primary_contact_email,
  ct.email_status as primary_contact_email_status,
  ct.linkedin_profile_url as primary_contact_linkedin_url,
  (select count(*) from public.company_evidence ce where ce.company_id=o.company_id) as company_evidence_count,
  (select count(*) from public.contact_evidence cte where cte.contact_id=o.primary_contact_id) as contact_evidence_count,
  ch.email_address as primary_route_email,
  ch.verification_status as primary_route_verification_status,
  ch.routing_score as primary_route_score
from public.opportunities o
join public.campaigns ca on ca.id=o.campaign_id
join public.companies co on co.id=o.company_id
left join public.contacts ct on ct.id=o.primary_contact_id
left join lateral (
  select cch.email_address,cch.verification_status,cch.routing_score
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

create or replace function public.score_opportunity_intelligence(p_scheduler_run_id uuid)
returns table(
  scored integer,
  reranked integer,
  recommended integer,
  review integer,
  "needsContact" integer,
  "needsEvidence" integer,
  "lowPriority" integer
)
language plpgsql security definer set search_path=public as $$
declare
  v_opp public.opportunities%rowtype;
  v_company public.companies%rowtype;
  v_contact public.contacts%rowtype;
  v_payload jsonb;
  v_fit jsonb;
  v_route record;
  v_company_evidence integer;
  v_contact_evidence integer;
  v_company_fit integer;
  v_operational_fit integer;
  v_buying_authority integer;
  v_contactability integer;
  v_commercial_value integer;
  v_evidence_quality integer;
  v_urgency integer;
  v_score integer;
  v_status text;
  v_reason text;
  v_pain text;
  v_action text;
  v_limitations jsonb;
  v_explanation jsonb;
  v_previous_score integer;
  v_previous_rank integer;
  v_rank_change record;
  v_scored integer:=0;
  v_reranked integer:=0;
  v_recommended integer:=0;
  v_review integer:=0;
  v_needs_contact integer:=0;
  v_needs_evidence integer:=0;
  v_low_priority integer:=0;
begin
  if not exists(
    select 1 from public.pipeline_scheduler_lease
    where singleton=true and run_id=p_scheduler_run_id and lease_expires_at>now()
  ) then raise exception 'PIPELINE_SCHEDULER_LEASE_NOT_HELD'; end if;

  for v_opp in
    select o.* from public.opportunities o
    join public.campaigns ca on ca.id=o.campaign_id
    where ca.status not in ('PAUSED','CANCELLED')
      and o.status not in ('REJECTED','ENGAGED')
    order by o.campaign_id,o.created_at
    for update of o skip locked
  loop
    select * into v_company from public.companies where id=v_opp.company_id;
    select * into v_contact from public.contacts where id=v_opp.primary_contact_id;
    select payload_json into v_payload from public.company_versions
      where company_id=v_opp.company_id order by version_number desc limit 1;
    v_payload:=coalesce(v_payload,'{}'::jsonb);
    v_fit:=coalesce(v_payload->'fitBreakdown','{}'::jsonb);

    select count(*) into v_company_evidence from public.company_evidence where company_id=v_opp.company_id;
    select count(*) into v_contact_evidence from public.contact_evidence where contact_id=v_opp.primary_contact_id;
    select cch.* into v_route from public.company_contact_channels cch
      where cch.organisation_id=v_opp.organisation_id and cch.campaign_id=v_opp.campaign_id
        and cch.company_id=v_opp.company_id
        and cch.deliverability_status not in ('UNDELIVERABLE','BOUNCED')
      order by cch.is_primary desc,cch.routing_score desc,cch.created_at limit 1;

    -- Company fit uses the five independent G2 fit dimensions when available.
    v_company_fit:=least(100,greatest(0,round(
      coalesce((v_fit->>'industryFit')::numeric,v_company.confidence::numeric)*0.25+
      coalesce((v_fit->>'audienceFit')::numeric,v_company.confidence::numeric)*0.25+
      coalesce((v_fit->>'operationalFit')::numeric,v_company.confidence::numeric)*0.20+
      coalesce((v_fit->>'geographyFit')::numeric,v_company.confidence::numeric)*0.10+
      coalesce((v_fit->>'commercialFit')::numeric,v_company.confidence::numeric)*0.20
    )::integer));
    v_operational_fit:=least(100,greatest(0,coalesce((v_fit->>'operationalFit')::integer,v_company.confidence)));
    v_commercial_value:=least(100,greatest(0,round(
      coalesce((v_fit->>'commercialFit')::numeric,v_company.confidence::numeric)*0.60+
      coalesce((v_fit->>'audienceFit')::numeric,v_company.confidence::numeric)*0.25+
      coalesce((v_fit->>'industryFit')::numeric,v_company.confidence::numeric)*0.15
    )::integer));

    if v_contact.id is null then
      v_buying_authority:=0;
    else
      v_buying_authority:=least(100,greatest(0,round(
        v_contact.buying_relevance::numeric*0.55+
        v_contact.role_confidence::numeric*0.25+
        v_contact.operational_relevance::numeric*0.20
      )::integer));
    end if;

    -- Contactability rewards direct supported channels, while still recognising
    -- a strong monitored company route. Unknown contactability remains visible.
    v_contactability:=0;
    if v_contact.id is not null then
      if v_contact.email_status='VERIFIED' and nullif(v_contact.email_address,'') is not null then
        v_contactability:=100;
      elsif v_contact.email_status='LIKELY' and nullif(v_contact.email_address,'') is not null then
        v_contactability:=82;
      elsif nullif(v_contact.linkedin_profile_url,'') is not null then
        v_contactability:=55;
      end if;
    end if;
    if v_route.id is not null then
      v_contactability:=greatest(v_contactability,
        least(95,greatest(45,
          round(v_route.routing_score::numeric*0.55+
                v_route.response_likelihood::numeric*0.25+
                v_route.confidence::numeric*0.20)::integer
        ))
      );
    end if;

    v_evidence_quality:=least(100,greatest(0,round(
      least(100,v_company_evidence*18)::numeric*0.35+
      least(100,v_contact_evidence*20)::numeric*0.30+
      v_company.confidence::numeric*0.20+
      coalesce(v_contact.evidence_quality,0)::numeric*0.15
    )::integer));

    -- Urgency is an evidence-constrained prioritisation signal, not invented
    -- buyer intent. It derives only from persisted operational and commercial fit.
    v_urgency:=least(100,greatest(0,round(
      v_operational_fit::numeric*0.50+
      v_commercial_value::numeric*0.30+
      v_evidence_quality::numeric*0.10+
      coalesce(v_contact.operational_relevance,0)::numeric*0.10
    )::integer));

    v_score:=least(100,greatest(0,round(
      v_company_fit::numeric*0.25+
      v_operational_fit::numeric*0.20+
      v_buying_authority::numeric*0.20+
      v_contactability::numeric*0.15+
      v_evidence_quality::numeric*0.10+
      v_commercial_value::numeric*0.05+
      v_urgency::numeric*0.05
    )::integer));

    v_reason:=coalesce(nullif(v_payload->'why'->>0,''),nullif(v_company.summary,''),
      v_company.company_name||' matches the campaign profile.');
    if jsonb_array_length(coalesce(v_payload->'why','[]'::jsonb))>1 then
      v_reason:=v_reason||' '||coalesce(v_payload->'why'->>1,'');
    end if;
    v_pain:=coalesce(nullif(v_payload->'why'->>2,''),nullif(v_payload->'why'->>0,''),nullif(v_company.summary,''));

    v_limitations:='[]'::jsonb;
    if v_contact.id is null then v_limitations:=v_limitations||jsonb_build_array('No supported decision-maker is currently linked.'); end if;
    if v_contactability<50 then v_limitations:=v_limitations||jsonb_build_array('No strong supported contact route is currently available.'); end if;
    if v_company_evidence<2 then v_limitations:=v_limitations||jsonb_build_array('Company evidence is currently sparse.'); end if;
    if v_contact.id is not null and v_contact_evidence<1 then v_limitations:=v_limitations||jsonb_build_array('The selected contact has limited supporting evidence.'); end if;

    if v_contact.id is null then
      v_status:='NEEDS_CONTACT';
      v_action:='Continue contact research before engagement.';
      v_needs_contact:=v_needs_contact+1;
    elsif v_evidence_quality<35 then
      v_status:='NEEDS_EVIDENCE';
      v_action:='Review the opportunity and gather stronger official evidence.';
      v_needs_evidence:=v_needs_evidence+1;
    elsif v_score<50 then
      v_status:='LOW_PRIORITY';
      v_action:='Keep visible as a low-priority opportunity; do not hide it.';
      v_low_priority:=v_low_priority+1;
    else
      v_status:='READY';
      if v_score>=75 then
        v_action:='Recommend for opportunity review and engagement preparation.';
        v_recommended:=v_recommended+1;
      else
        v_action:='Present for human review with the stated limitations.';
        v_review:=v_review+1;
      end if;
    end if;

    -- Human decisions remain authoritative.
    if v_opp.status in ('APPROVED','REJECTED','ENGAGED') then v_status:=v_opp.status; end if;

    v_explanation:=jsonb_build_object(
      'version','opportunity-score/v1',
      'weights',jsonb_build_object(
        'companyFit',25,'operationalFit',20,'buyingAuthority',20,'contactability',15,
        'evidenceQuality',10,'commercialValue',5,'urgency',5
      ),
      'components',jsonb_build_object(
        'companyFit',v_company_fit,'operationalFit',v_operational_fit,
        'buyingAuthority',v_buying_authority,'contactability',v_contactability,
        'evidenceQuality',v_evidence_quality,'commercialValue',v_commercial_value,'urgency',v_urgency
      ),
      'evidence',jsonb_build_object(
        'companySources',v_company_evidence,'contactSources',v_contact_evidence,
        'contactChannel',case
          when v_contact.email_status='VERIFIED' then 'VERIFIED_EMAIL'
          when v_contact.email_status='LIKELY' then 'LIKELY_EMAIL'
          when v_route.id is not null then v_route.verification_status
          when nullif(v_contact.linkedin_profile_url,'') is not null then 'LINKEDIN_ONLY'
          else 'UNKNOWN' end
      ),
      'limitations',v_limitations
    );

    v_previous_score:=v_opp.opportunity_score;
    update public.opportunities set
      status=v_status,
      opportunity_score=v_score,
      company_fit=v_company_fit,
      operational_fit=v_operational_fit,
      buying_authority=v_buying_authority,
      contactability=v_contactability,
      commercial_value=v_commercial_value,
      evidence_quality=v_evidence_quality,
      urgency=v_urgency,
      buying_reason=left(v_reason,1200),
      operational_pain=left(v_pain,1200),
      recommended_action=v_action,
      score_explanation_json=v_explanation,
      scoring_version='opportunity-score/v1',
      scored_at=now(),
      updated_at=now()
    where id=v_opp.id;
    v_scored:=v_scored+1;

    if v_previous_score is distinct from v_score then
      insert into public.opportunity_history(
        organisation_id,campaign_id,opportunity_id,event_type,previous_status,next_status,
        previous_rank,next_rank,metadata_json
      ) values(
        v_opp.organisation_id,v_opp.campaign_id,v_opp.id,'UPDATED',v_opp.status,v_status,
        v_opp.rank,v_opp.rank,jsonb_build_object(
          'reason','OPPORTUNITY_SCORED','previousScore',v_previous_score,'opportunityScore',v_score,
          'scoringVersion','opportunity-score/v1','schedulerRunId',p_scheduler_run_id
        )
      );
    end if;

    v_contact:=null;
    v_company:=null;
  end loop;

  -- Rank every opportunity by commercial recommendation while keeping low and
  -- rejected records visible for transparency.
  for v_rank_change in
    with ordered as (
      select id,organisation_id,campaign_id,status,rank as old_rank,
        row_number() over(
          partition by organisation_id,campaign_id
          order by
            case status when 'APPROVED' then 0 when 'READY' then 1 when 'NEEDS_EVIDENCE' then 2
              when 'NEEDS_CONTACT' then 3 when 'LOW_PRIORITY' then 4 when 'BUILDING' then 5
              when 'ENGAGED' then 6 else 7 end,
            opportunity_score desc nulls last,updated_at desc,id
        )::integer as new_rank
      from public.opportunities
    )
    select * from ordered where old_rank<>new_rank order by campaign_id,new_rank
  loop
    update public.opportunities set rank=v_rank_change.new_rank,updated_at=now()
    where id=v_rank_change.id;
    insert into public.opportunity_history(
      organisation_id,campaign_id,opportunity_id,event_type,previous_status,next_status,
      previous_rank,next_rank,metadata_json
    ) values(
      v_rank_change.organisation_id,v_rank_change.campaign_id,v_rank_change.id,'RANK_CHANGED',
      v_rank_change.status,v_rank_change.status,v_rank_change.old_rank,v_rank_change.new_rank,
      jsonb_build_object('rankingMode','OPPORTUNITY_SCORE','schedulerRunId',p_scheduler_run_id)
    );
    v_reranked:=v_reranked+1;
  end loop;

  return query select v_scored,v_reranked,v_recommended,v_review,v_needs_contact,v_needs_evidence,v_low_priority;
end $$;

revoke all on function public.score_opportunity_intelligence(uuid) from public,anon,authenticated;
grant execute on function public.score_opportunity_intelligence(uuid) to service_role;
