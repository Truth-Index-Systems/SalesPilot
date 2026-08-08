-- Genesis G4.7: Route Intelligence Engine
-- Company Discovery is frozen. This release consumes its persisted evidence and
-- adds organisation/buying-path/access-route intelligence without repeating fit research.

create table if not exists public.route_intelligence_snapshots (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  contact_discovery_session_id uuid not null references public.contact_discovery_sessions(id) on delete cascade,
  organisation_map_json jsonb not null default '{}'::jsonb,
  buying_paths_json jsonb not null default '[]'::jsonb,
  research_summary text,
  route_count integer not null default 0,
  viable_route_count integer not null default 0,
  version_number integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id,campaign_id,company_id)
);

create table if not exists public.commercial_routes (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  contact_discovery_session_id uuid not null references public.contact_discovery_sessions(id) on delete cascade,
  route_key text not null,
  route_type text not null check(route_type in ('PRIMARY','OPERATIONAL','TRANSFORMATION','PROCUREMENT','TECHNICAL','EXECUTIVE','REGIONAL','FALLBACK')),
  label text not null,
  entry_role text not null,
  target_role text not null,
  department text,
  contact_name text,
  contact_role text,
  channel_type text not null check(channel_type in ('DIRECT_EMAIL','LINKEDIN','DEPARTMENT_EMAIL','GENERAL_EMAIL','SWITCHBOARD','INTRODUCTION','UNKNOWN')),
  channel_value text,
  authority integer not null check(authority between 0 and 100),
  accessibility integer not null check(accessibility between 0 and 100),
  commercial_relevance integer not null check(commercial_relevance between 0 and 100),
  evidence_quality integer not null check(evidence_quality between 0 and 100),
  resilience integer not null check(resilience between 0 and 100),
  confidence integer not null check(confidence between 0 and 100),
  route_quality integer not null check(route_quality between 0 and 100),
  difficulty text not null check(difficulty in ('LOW','MEDIUM','HIGH')),
  rationale text not null,
  next_step text not null,
  fallback_reason text,
  is_primary boolean not null default false,
  is_viable boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id,campaign_id,company_id,route_key)
);

create table if not exists public.commercial_route_evidence (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  route_id uuid not null references public.commercial_routes(id) on delete cascade,
  evidence_type text not null,
  claim text not null,
  source_url text not null,
  source_title text,
  excerpt text,
  source_kind text not null,
  source_domain text,
  verified boolean not null default false,
  excerpt_matched boolean not null default false,
  quality_score integer not null default 0 check(quality_score between 0 and 100),
  retrieved_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists route_intelligence_company_idx on public.route_intelligence_snapshots(organisation_id,campaign_id,company_id);
create index if not exists commercial_routes_rank_idx on public.commercial_routes(organisation_id,campaign_id,company_id,is_primary desc,is_viable desc,route_quality desc,confidence desc);
create index if not exists commercial_route_evidence_route_idx on public.commercial_route_evidence(route_id,quality_score desc);

alter table public.route_intelligence_snapshots enable row level security;
alter table public.commercial_routes enable row level security;
alter table public.commercial_route_evidence enable row level security;

drop policy if exists route_intelligence_snapshots_member_read on public.route_intelligence_snapshots;
create policy route_intelligence_snapshots_member_read on public.route_intelligence_snapshots for select to authenticated using(public.is_active_org_member(organisation_id));
drop policy if exists commercial_routes_member_read on public.commercial_routes;
create policy commercial_routes_member_read on public.commercial_routes for select to authenticated using(public.is_active_org_member(organisation_id));
drop policy if exists commercial_route_evidence_member_read on public.commercial_route_evidence;
create policy commercial_route_evidence_member_read on public.commercial_route_evidence for select to authenticated using(public.is_active_org_member(organisation_id));

create or replace function public.save_route_intelligence(
  p_session_id uuid,
  p_organisation_map jsonb,
  p_buying_paths jsonb,
  p_routes jsonb,
  p_research_summary text default null
) returns integer
language plpgsql security definer set search_path=public as $$
declare
  s public.contact_discovery_sessions%rowtype;
  item jsonb;
  ev jsonb;
  v_route_id uuid;
  v_route_quality integer;
  v_saved integer:=0;
  v_viable integer:=0;
  v_version integer:=1;
begin
  select * into s from public.contact_discovery_sessions where id=p_session_id for update;
  if s.id is null then raise exception 'contact discovery session missing'; end if;
  if s.status<>'RUNNING' then raise exception 'contact discovery session is not running'; end if;
  if jsonb_typeof(coalesce(p_routes,'[]'::jsonb))<>'array' then raise exception 'routes payload must be an array'; end if;

  select coalesce(version_number,0)+1 into v_version
  from public.route_intelligence_snapshots
  where organisation_id=s.organisation_id and campaign_id=s.campaign_id and company_id=s.company_id;
  v_version:=coalesce(v_version,1);

  insert into public.route_intelligence_snapshots(
    organisation_id,campaign_id,company_id,contact_discovery_session_id,
    organisation_map_json,buying_paths_json,research_summary,version_number,updated_at
  ) values(
    s.organisation_id,s.campaign_id,s.company_id,s.id,
    coalesce(p_organisation_map,'{}'::jsonb),coalesce(p_buying_paths,'[]'::jsonb),left(p_research_summary,1500),v_version,now()
  ) on conflict(organisation_id,campaign_id,company_id) do update set
    contact_discovery_session_id=excluded.contact_discovery_session_id,
    organisation_map_json=excluded.organisation_map_json,
    buying_paths_json=excluded.buying_paths_json,
    research_summary=excluded.research_summary,
    version_number=route_intelligence_snapshots.version_number+1,
    updated_at=now();

  update public.commercial_routes set is_primary=false,updated_at=now()
  where organisation_id=s.organisation_id and campaign_id=s.campaign_id and company_id=s.company_id;

  for item in select * from jsonb_array_elements(coalesce(p_routes,'[]'::jsonb)) loop
    if nullif(trim(item->>'routeKey'),'') is null or nullif(trim(item->>'entryRole'),'') is null or nullif(trim(item->>'targetRole'),'') is null then continue; end if;
    v_route_quality:=least(100,greatest(0,round(
      coalesce((item->>'authority')::numeric,0)*0.20+
      coalesce((item->>'accessibility')::numeric,0)*0.22+
      coalesce((item->>'commercialRelevance')::numeric,0)*0.23+
      coalesce((item->>'evidenceQuality')::numeric,0)*0.15+
      coalesce((item->>'resilience')::numeric,0)*0.10+
      coalesce((item->>'confidence')::numeric,0)*0.10
    )::integer));

    insert into public.commercial_routes(
      organisation_id,campaign_id,company_id,contact_discovery_session_id,route_key,route_type,label,
      entry_role,target_role,department,contact_name,contact_role,channel_type,channel_value,
      authority,accessibility,commercial_relevance,evidence_quality,resilience,confidence,route_quality,
      difficulty,rationale,next_step,fallback_reason,is_viable,updated_at
    ) values(
      s.organisation_id,s.campaign_id,s.company_id,s.id,item->>'routeKey',item->>'routeType',item->>'label',
      item->>'entryRole',item->>'targetRole',nullif(item->>'department',''),nullif(item->>'contactName',''),nullif(item->>'contactRole',''),
      item->>'channelType',nullif(item->>'channelValue',''),
      coalesce((item->>'authority')::integer,0),coalesce((item->>'accessibility')::integer,0),coalesce((item->>'commercialRelevance')::integer,0),
      coalesce((item->>'evidenceQuality')::integer,0),coalesce((item->>'resilience')::integer,0),coalesce((item->>'confidence')::integer,0),v_route_quality,
      item->>'difficulty',item->>'rationale',item->>'nextStep',nullif(item->>'fallbackReason',''),
      (item->>'channelType')<>'UNKNOWN' and coalesce((item->>'confidence')::integer,0)>=55 and v_route_quality>=50,now()
    ) on conflict(organisation_id,campaign_id,company_id,route_key) do update set
      contact_discovery_session_id=excluded.contact_discovery_session_id,route_type=excluded.route_type,label=excluded.label,
      entry_role=excluded.entry_role,target_role=excluded.target_role,department=excluded.department,
      contact_name=excluded.contact_name,contact_role=excluded.contact_role,channel_type=excluded.channel_type,
      channel_value=excluded.channel_value,authority=excluded.authority,accessibility=excluded.accessibility,
      commercial_relevance=excluded.commercial_relevance,evidence_quality=excluded.evidence_quality,
      resilience=excluded.resilience,confidence=excluded.confidence,route_quality=excluded.route_quality,
      difficulty=excluded.difficulty,rationale=excluded.rationale,next_step=excluded.next_step,
      fallback_reason=excluded.fallback_reason,is_viable=excluded.is_viable,updated_at=now()
    returning id into v_route_id;

    delete from public.commercial_route_evidence where route_id=v_route_id;
    for ev in select * from jsonb_array_elements(coalesce(item->'evidence','[]'::jsonb)) loop
      if nullif(ev->>'sourceUrl','') is null or nullif(ev->>'claim','') is null then continue; end if;
      insert into public.commercial_route_evidence(
        organisation_id,campaign_id,company_id,route_id,evidence_type,claim,source_url,source_title,excerpt,
        source_kind,source_domain,verified,excerpt_matched,quality_score,retrieved_at
      ) values(
        s.organisation_id,s.campaign_id,s.company_id,v_route_id,coalesce(nullif(ev->>'evidenceType',''),'ROLE'),ev->>'claim',ev->>'sourceUrl',
        nullif(ev->>'sourceTitle',''),nullif(ev->>'excerpt',''),coalesce(nullif(ev->>'sourceKind',''),'OFFICIAL_WEBSITE'),nullif(ev->>'sourceDomain',''),
        coalesce((ev->>'verified')::boolean,false),coalesce((ev->>'excerptMatched')::boolean,false),coalesce((ev->>'qualityScore')::integer,0),nullif(ev->>'retrievedAt','')::timestamptz
      );
    end loop;
    v_saved:=v_saved+1;
  end loop;

  update public.commercial_routes cr set is_primary=true
  where cr.id=(
    select r.id from public.commercial_routes r
    where r.organisation_id=s.organisation_id and r.campaign_id=s.campaign_id and r.company_id=s.company_id
    order by r.is_viable desc,r.route_quality desc,r.confidence desc,r.evidence_quality desc,r.created_at
    limit 1
  );

  select count(*) into v_viable from public.commercial_routes
  where organisation_id=s.organisation_id and campaign_id=s.campaign_id and company_id=s.company_id and is_viable=true;
  update public.route_intelligence_snapshots set route_count=(select count(*) from public.commercial_routes where organisation_id=s.organisation_id and campaign_id=s.campaign_id and company_id=s.company_id),viable_route_count=v_viable,updated_at=now()
  where organisation_id=s.organisation_id and campaign_id=s.campaign_id and company_id=s.company_id;

  return v_saved;
end $$;

revoke all on function public.save_route_intelligence(uuid,jsonb,jsonb,jsonb,text) from public,anon,authenticated;
grant execute on function public.save_route_intelligence(uuid,jsonb,jsonb,jsonb,text) to service_role;

-- Route readiness now evaluates independent commercial paths as well as legacy
-- contact/email channels. The existing four-pass expansion contract is preserved.
create or replace function public.evaluate_contact_discovery_route_readiness(
  p_session_id uuid,
  p_research_summary text default null,
  p_uncertainties jsonb default '[]'::jsonb,
  p_unresolved_roles jsonb default '[]'::jsonb
) returns table(action text,primary_ready boolean,fallback_ready boolean,route_count integer,expansion_pass integer)
language plpgsql security definer set search_path=public as $$
declare
  s public.contact_discovery_sessions%rowtype;
  v_legacy_count integer:=0;
  v_commercial_count integer:=0;
  v_route_count integer:=0;
  v_primary boolean:=false;
  v_fallback boolean:=false;
  v_next_pass integer;
  v_company_name text;
begin
  select * into s from public.contact_discovery_sessions where id=p_session_id for update;
  if s.id is null then raise exception 'contact discovery session missing'; end if;
  if s.status<>'RUNNING' then raise exception 'contact discovery session is not running'; end if;

  select count(*) into v_commercial_count from public.commercial_routes cr
  where cr.organisation_id=s.organisation_id and cr.campaign_id=s.campaign_id and cr.company_id=s.company_id and cr.is_viable=true;

  select
    (case when exists(select 1 from public.contacts c where c.contact_discovery_session_id=s.id and c.overall_confidence>=65 and c.email_address is not null and c.email_status in ('VERIFIED','LIKELY')) then 1 else 0 end)+
    (case when exists(select 1 from public.contacts c where c.contact_discovery_session_id=s.id and c.overall_confidence>=60 and c.linkedin_profile_url is not null and c.linkedin_status in ('VERIFIED','HIGH_CONFIDENCE')) then 1 else 0 end)+
    (case when exists(select 1 from public.company_contact_channels ch where ch.organisation_id=s.organisation_id and ch.campaign_id=s.campaign_id and ch.company_id=s.company_id and ch.deliverability_status not in ('UNDELIVERABLE','BOUNCED') and ch.confidence>=70 and ch.routing_score>=60) then 1 else 0 end)
  into v_legacy_count;

  v_route_count:=greatest(v_commercial_count,v_legacy_count);
  v_primary:=v_route_count>=1;
  v_fallback:=v_route_count>=2;
  v_next_pass:=least(4,coalesce(s.route_expansion_pass,0)+1);

  update public.contact_discovery_sessions set route_expansion_pass=v_next_pass,primary_route_ready=v_primary,fallback_route_ready=v_fallback,
    research_summary=left(coalesce(p_research_summary,research_summary,'Route intelligence completed.'),1500),uncertainties_json=coalesce(p_uncertainties,'[]'::jsonb),
    unresolved_roles_json=coalesce(p_unresolved_roles,'[]'::jsonb),heartbeat_at=now(),updated_at=now() where id=s.id;

  if v_primary and v_fallback then
    update public.contact_discovery_sessions set route_research_state='READY',stage='VALIDATING',progress=88 where id=s.id;
    return query select 'READY'::text,v_primary,v_fallback,v_route_count,v_next_pass; return;
  end if;
  if v_next_pass<4 then
    update public.contact_discovery_sessions set status='QUEUED',job_state='QUEUED',stage='EXPANDING',progress=45,route_research_state='EXPANDING',
      next_attempt_at=now()+interval '15 seconds',next_retry_at=now()+interval '15 seconds',lease_expires_at=null,claimed_at=null,
      last_error=null,last_error_code=null,last_error_message=null,updated_at=now() where id=s.id;
    select company_name into v_company_name from public.companies where id=s.company_id;
    insert into public.campaign_timeline(organisation_id,campaign_id,event_type,title,description,visibility,metadata_json)
    values(s.organisation_id,s.campaign_id,'ROUTE_RESEARCH_EXPANDING','MarketRoute is strengthening the access strategy',
      'MarketRoute found '||v_route_count||' viable route'||case when v_route_count=1 then '' else 's' end||' and is researching another independent way into '||coalesce(v_company_name,'the organisation')||'.',
      'CUSTOMER',jsonb_build_object('companyId',s.company_id,'sessionId',s.id,'pass',v_next_pass,'primaryReady',v_primary,'fallbackReady',v_fallback,'routeCount',v_route_count));
    return query select 'EXPAND'::text,v_primary,v_fallback,v_route_count,v_next_pass; return;
  end if;
  update public.contact_discovery_sessions set route_research_state='EXHAUSTED',route_exhausted_at=now(),stage='VALIDATING',progress=88 where id=s.id;
  return query select 'EXHAUSTED'::text,v_primary,v_fallback,v_route_count,v_next_pass;
end $$;

-- Expose Route Intelligence through the existing opportunity contract.
drop view if exists public.opportunity_detail;
drop view if exists public.opportunity_overview;
create view public.opportunity_overview with (security_invoker=true) as
select
  o.*,ca.name as campaign_name,co.company_name,co.website_url as company_website_url,co.industry as company_industry,co.country as company_country,co.confidence as company_confidence,
  ct.full_name as primary_contact_name,ct.role_title as primary_contact_role,ct.overall_confidence as primary_contact_confidence,ct.review_status as primary_contact_review_status,
  ct.email_address as primary_contact_email,ct.email_status as primary_contact_email_status,ct.linkedin_profile_url as primary_contact_linkedin_url,
  (select count(*) from public.company_evidence ce where ce.company_id=o.company_id) as company_evidence_count,
  (select count(*) from public.contact_evidence cte where cte.contact_id=o.primary_contact_id) as contact_evidence_count,
  ch.email_address as primary_route_email,ch.id as primary_route_id,ch.verification_status as primary_route_verification_status,ch.routing_score as primary_route_score,
  ch.confidence as primary_route_confidence,ch.response_likelihood as primary_route_response_likelihood,ch.campaign_relevance as primary_route_campaign_relevance,
  ch.channel_type as primary_route_channel_type,ch.likely_reader as primary_route_likely_reader,ch.reason_selected as primary_route_reason,ch.source_url as primary_route_source_url,
  (select count(*) from public.company_contact_channels alt where alt.organisation_id=o.organisation_id and alt.campaign_id=o.campaign_id and alt.company_id=o.company_id and alt.deliverability_status not in ('UNDELIVERABLE','BOUNCED')) as available_route_count,
  cr.id as commercial_route_id,cr.route_type as commercial_route_type,cr.label as commercial_route_label,cr.entry_role as commercial_route_entry_role,
  cr.target_role as commercial_route_target_role,cr.department as commercial_route_department,cr.contact_name as commercial_route_contact_name,
  cr.contact_role as commercial_route_contact_role,cr.channel_type as commercial_route_channel_type,cr.channel_value as commercial_route_channel_value,
  cr.route_quality as commercial_route_quality,cr.confidence as commercial_route_confidence,cr.authority as commercial_route_authority,
  cr.accessibility as commercial_route_accessibility,cr.evidence_quality as commercial_route_evidence_quality,cr.resilience as commercial_route_resilience,
  cr.difficulty as commercial_route_difficulty,cr.rationale as commercial_route_rationale,cr.next_step as commercial_route_next_step,
  (select count(*) from public.commercial_routes ar where ar.organisation_id=o.organisation_id and ar.campaign_id=o.campaign_id and ar.company_id=o.company_id and ar.is_viable=true) as commercial_route_count,
  (select count(*) from public.commercial_route_evidence cre join public.commercial_routes rr on rr.id=cre.route_id where rr.organisation_id=o.organisation_id and rr.campaign_id=o.campaign_id and rr.company_id=o.company_id and cre.verified=true) as commercial_route_evidence_count,
  ris.organisation_map_json as organisation_map,ris.buying_paths_json as buying_paths
from public.opportunities o
join public.campaigns ca on ca.id=o.campaign_id
join public.companies co on co.id=o.company_id
left join public.contacts ct on ct.id=o.primary_contact_id
left join lateral (
  select cch.* from public.company_contact_channels cch where cch.organisation_id=o.organisation_id and cch.campaign_id=o.campaign_id and cch.company_id=o.company_id and cch.deliverability_status not in ('UNDELIVERABLE','BOUNCED')
  order by cch.is_primary desc,cch.routing_score desc,cch.created_at limit 1
) ch on true
left join lateral (
  select r.* from public.commercial_routes r where r.organisation_id=o.organisation_id and r.campaign_id=o.campaign_id and r.company_id=o.company_id
  order by r.is_primary desc,r.is_viable desc,r.route_quality desc,r.confidence desc limit 1
) cr on true
left join public.route_intelligence_snapshots ris on ris.organisation_id=o.organisation_id and ris.campaign_id=o.campaign_id and ris.company_id=o.company_id;

create view public.opportunity_detail with (security_invoker=true) as
select ov.*,co.summary as company_summary,ct.reason_selected as contact_reason_selected,ct.department as primary_contact_department,ct.location as primary_contact_location,
  coalesce((select jsonb_agg(jsonb_build_object('id',h.id,'eventType',h.event_type,'previousStatus',h.previous_status,'nextStatus',h.next_status,'previousRank',h.previous_rank,'nextRank',h.next_rank,'metadata',h.metadata_json,'occurredAt',h.occurred_at) order by h.occurred_at desc) from public.opportunity_history h where h.opportunity_id=ov.id),'[]'::jsonb) as history,
  coalesce((select jsonb_agg(jsonb_build_object('id',ce.id,'claim',ce.claim,'sourceUrl',ce.source_url,'sourceTitle',ce.source_title,'excerpt',ce.excerpt,'sourceDomain',ce.source_domain,'verified',ce.verified,'excerptMatched',ce.excerpt_matched,'qualityScore',case when ce.excerpt_matched then 100 when ce.verified then 80 else 40 end,'createdAt',ce.created_at) order by case when ce.excerpt_matched then 100 when ce.verified then 80 else 40 end desc,ce.created_at) from public.company_evidence ce where ce.company_id=ov.company_id),'[]'::jsonb) as company_evidence,
  coalesce((select jsonb_agg(jsonb_build_object('id',cte.id,'evidenceType',cte.evidence_type,'claim',cte.claim,'sourceUrl',cte.source_url,'sourceTitle',cte.source_title,'excerpt',cte.excerpt,'sourceKind',cte.source_kind,'verified',cte.verified,'excerptMatched',cte.excerpt_matched,'qualityScore',cte.quality_score,'createdAt',cte.created_at) order by cte.quality_score desc,cte.created_at) from public.contact_evidence cte where cte.contact_id=ov.primary_contact_id),'[]'::jsonb) as contact_evidence,
  coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'routeType',r.route_type,'label',r.label,'entryRole',r.entry_role,'targetRole',r.target_role,'department',r.department,'contactName',r.contact_name,'contactRole',r.contact_role,'channelType',r.channel_type,'channelValue',r.channel_value,'routeQuality',r.route_quality,'confidence',r.confidence,'authority',r.authority,'accessibility',r.accessibility,'commercialRelevance',r.commercial_relevance,'evidenceQuality',r.evidence_quality,'resilience',r.resilience,'difficulty',r.difficulty,'rationale',r.rationale,'nextStep',r.next_step,'isPrimary',r.is_primary,'isViable',r.is_viable) order by r.is_primary desc,r.is_viable desc,r.route_quality desc) from public.commercial_routes r where r.organisation_id=ov.organisation_id and r.campaign_id=ov.campaign_id and r.company_id=ov.company_id),'[]'::jsonb) as commercial_routes,
  coalesce((select jsonb_agg(jsonb_build_object('id',cre.id,'routeId',cre.route_id,'evidenceType',cre.evidence_type,'claim',cre.claim,'sourceUrl',cre.source_url,'sourceTitle',cre.source_title,'excerpt',cre.excerpt,'sourceKind',cre.source_kind,'verified',cre.verified,'excerptMatched',cre.excerpt_matched,'qualityScore',cre.quality_score,'createdAt',cre.created_at) order by cre.quality_score desc,cre.created_at) from public.commercial_route_evidence cre join public.commercial_routes rr on rr.id=cre.route_id where rr.organisation_id=ov.organisation_id and rr.campaign_id=ov.campaign_id and rr.company_id=ov.company_id and cre.verified=true),'[]'::jsonb) as commercial_route_evidence
from public.opportunity_overview ov join public.companies co on co.id=ov.company_id left join public.contacts ct on ct.id=ov.primary_contact_id;

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
        when o.status in ('APPROVED','REJECTED','ENGAGED') then o.status
        when b.is_viable and b.route_quality>=50 then 'READY'
        when b.evidence_quality<35 then 'NEEDS_EVIDENCE'
        else 'NEEDS_CONTACT' end,
      recommended_action=case when b.is_viable then b.next_step else 'Continue Route Intelligence until a supported access path is available.' end,
      scoring_version='opportunity-score/v3-route-intelligence',scored_at=now(),updated_at=now()
    from best b where o.organisation_id=b.organisation_id and o.campaign_id=b.campaign_id and o.company_id=b.company_id and o.status not in ('REJECTED','ENGAGED') returning o.id
  ) select count(*) into v_updated from changed;

  with ranked as (select id,row_number() over(partition by campaign_id order by opportunity_score desc nulls last,route_quality desc nulls last,created_at) as next_rank from public.opportunities where status<>'REJECTED')
  update public.opportunities o set rank=r.next_rank,updated_at=case when o.rank<>r.next_rank then now() else o.updated_at end from ranked r where o.id=r.id;
  return v_updated;
end $$;

revoke all on function public.apply_route_intelligence_opportunity_scoring(uuid) from public,anon,authenticated;
grant execute on function public.apply_route_intelligence_opportunity_scoring(uuid) to service_role;
