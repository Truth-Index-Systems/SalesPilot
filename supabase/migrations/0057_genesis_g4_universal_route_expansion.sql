-- Genesis G4: universal, bounded Route Intelligence expansion.
-- A clean research pass is not considered route-ready until it has a usable
-- primary access route plus a credible independent fallback, or four safe
-- evidence-preserving passes have been exhausted.

alter table public.contact_discovery_sessions
  add column if not exists route_expansion_pass integer not null default 0,
  add column if not exists route_research_state text not null default 'PENDING',
  add column if not exists primary_route_ready boolean not null default false,
  add column if not exists fallback_route_ready boolean not null default false,
  add column if not exists route_exhausted_at timestamptz;

do $$ begin
  alter table public.contact_discovery_sessions
    add constraint contact_discovery_route_expansion_pass_check
    check(route_expansion_pass between 0 and 4);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.contact_discovery_sessions
    add constraint contact_discovery_route_research_state_check
    check(route_research_state in ('PENDING','EXPANDING','READY','EXHAUSTED'));
exception when duplicate_object then null; end $$;

create or replace function public.evaluate_contact_discovery_route_readiness(
  p_session_id uuid,
  p_research_summary text default null,
  p_uncertainties jsonb default '[]'::jsonb,
  p_unresolved_roles jsonb default '[]'::jsonb
) returns table(
  action text,
  primary_ready boolean,
  fallback_ready boolean,
  route_count integer,
  expansion_pass integer
)
language plpgsql security definer set search_path=public as $$
declare
  s public.contact_discovery_sessions%rowtype;
  v_email boolean:=false;
  v_linkedin boolean:=false;
  v_company_email boolean:=false;
  v_route_count integer:=0;
  v_primary boolean:=false;
  v_fallback boolean:=false;
  v_next_pass integer;
  v_company_name text;
begin
  select * into s from public.contact_discovery_sessions where id=p_session_id for update;
  if s.id is null then raise exception 'contact discovery session missing'; end if;
  if s.status<>'RUNNING' then raise exception 'contact discovery session is not running'; end if;

  select exists(
    select 1 from public.contacts c
    where c.contact_discovery_session_id=s.id
      and c.overall_confidence>=65
      and c.email_address is not null
      and c.email_status in ('VERIFIED','LIKELY')
  ) into v_email;

  select exists(
    select 1 from public.contacts c
    where c.contact_discovery_session_id=s.id
      and c.overall_confidence>=60
      and c.linkedin_profile_url is not null
      and c.linkedin_status in ('VERIFIED','HIGH_CONFIDENCE')
  ) into v_linkedin;

  select exists(
    select 1 from public.company_contact_channels ch
    where ch.organisation_id=s.organisation_id
      and ch.campaign_id=s.campaign_id
      and ch.company_id=s.company_id
      and ch.deliverability_status not in ('UNDELIVERABLE','BOUNCED')
      and ch.confidence>=70
      and ch.routing_score>=60
      and ch.verification_status in ('PUBLIC_VERIFIED','INTERNAL_CONFIRMED','PATTERN_LIKELY')
  ) into v_company_email;

  v_route_count := (case when v_email then 1 else 0 end)
                 + (case when v_linkedin then 1 else 0 end)
                 + (case when v_company_email then 1 else 0 end);
  v_primary := v_email or v_company_email or v_linkedin;
  v_fallback := v_route_count>=2;
  v_next_pass := least(4,coalesce(s.route_expansion_pass,0)+1);

  update public.contact_discovery_sessions set
    route_expansion_pass=v_next_pass,
    primary_route_ready=v_primary,
    fallback_route_ready=v_fallback,
    research_summary=left(coalesce(p_research_summary,research_summary,'Route research completed.'),1500),
    uncertainties_json=coalesce(p_uncertainties,'[]'::jsonb),
    unresolved_roles_json=coalesce(p_unresolved_roles,'[]'::jsonb),
    heartbeat_at=now(),updated_at=now()
  where id=s.id;

  if v_primary and v_fallback then
    update public.contact_discovery_sessions set
      route_research_state='READY',stage='VALIDATING',progress=88
    where id=s.id;
    return query select 'READY'::text,v_primary,v_fallback,v_route_count,v_next_pass;
    return;
  end if;

  if v_next_pass<4 then
    update public.contact_discovery_sessions set
      status='QUEUED',job_state='QUEUED',stage='EXPANDING',progress=45,
      route_research_state='EXPANDING',next_attempt_at=now()+interval '15 seconds',
      next_retry_at=now()+interval '15 seconds',lease_expires_at=null,claimed_at=null,
      last_error=null,last_error_code=null,last_error_message=null,updated_at=now()
    where id=s.id;

    select company_name into v_company_name from public.companies where id=s.company_id;
    insert into public.campaign_timeline(organisation_id,campaign_id,event_type,title,description,visibility,metadata_json)
    values(s.organisation_id,s.campaign_id,'ROUTE_RESEARCH_EXPANDING','SalesPilot is strengthening the access strategy',
      'The current route package is not yet strong enough, so SalesPilot is checking another evidence-backed way into '||coalesce(v_company_name,'the organisation')||'.',
      'CUSTOMER',jsonb_build_object('companyId',s.company_id,'sessionId',s.id,'pass',v_next_pass,'primaryReady',v_primary,'fallbackReady',v_fallback,'routeCount',v_route_count));

    return query select 'EXPAND'::text,v_primary,v_fallback,v_route_count,v_next_pass;
    return;
  end if;

  update public.contact_discovery_sessions set
    route_research_state='EXHAUSTED',route_exhausted_at=now(),stage='VALIDATING',progress=88
  where id=s.id;
  return query select 'EXHAUSTED'::text,v_primary,v_fallback,v_route_count,v_next_pass;
end $$;

revoke all on function public.evaluate_contact_discovery_route_readiness(uuid,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.evaluate_contact_discovery_route_readiness(uuid,text,jsonb,jsonb) to service_role;

-- Resume all live, non-exhausted route sessions that previously completed
-- without a usable primary+fallback package. This is deliberately universal,
-- not limited to onboarding or recently-created campaigns.
update public.contact_discovery_sessions cs set
  status='QUEUED',job_state='QUEUED',stage='EXPANDING',progress=45,
  route_research_state='EXPANDING',next_attempt_at=now(),next_retry_at=now(),
  completed_at=null,no_match_completed_at=null,lease_expires_at=null,updated_at=now()
from public.companies co
join public.campaigns ca on ca.id=co.campaign_id and ca.organisation_id=co.organisation_id
where cs.company_id=co.id and cs.campaign_id=co.campaign_id and cs.organisation_id=co.organisation_id
  and co.review_status='APPROVED'
  and ca.status not in ('PAUSED','FAILED','ARCHIVED','CANCELLED')
  and cs.status='COMPLETED'
  and coalesce(cs.route_expansion_pass,0)<4
  and not (
    exists(select 1 from public.contacts c where c.contact_discovery_session_id=cs.id and c.overall_confidence>=65 and c.email_address is not null and c.email_status in ('VERIFIED','LIKELY'))
    and exists(select 1 from public.contacts c where c.contact_discovery_session_id=cs.id and c.overall_confidence>=60 and c.linkedin_profile_url is not null and c.linkedin_status in ('VERIFIED','HIGH_CONFIDENCE'))
  );

drop function if exists public.claim_contact_discovery(uuid,uuid,boolean);
create or replace function public.claim_contact_discovery(
  p_scheduler_run_id uuid,
  p_campaign_id uuid default null,
  p_fresh_only boolean default false
)
returns table(session_id uuid,organisation_id uuid,campaign_id uuid,company_id uuid,route_expansion_pass integer)
language plpgsql security definer set search_path=public as $$
declare v_id uuid;
begin
  select s.id into v_id
  from public.contact_discovery_sessions s
  join public.companies c on c.id=s.company_id and c.review_status='APPROVED'
  join public.campaigns ca on ca.id=s.campaign_id and ca.status not in('PAUSED','CANCELLED','ARCHIVED','FAILED')
  join public.ai_governance_policies g on g.organisation_id=s.organisation_id and g.autonomy_enabled=true
  where s.attempt_count<8
    and coalesce(s.route_expansion_pass,0)<4
    and (p_campaign_id is null or s.campaign_id=p_campaign_id)
    and (
      (s.status='QUEUED' and coalesce(s.next_attempt_at,s.next_retry_at,now())<=now()
        and (not p_fresh_only or (coalesce(s.job_state,'QUEUED')='QUEUED' and s.attempt_count=0)))
      or
      (not p_fresh_only and s.status='FAILED' and s.job_state='FAILED_RETRYABLE'
        and coalesce(s.next_retry_at,s.next_attempt_at,now())<=now())
    )
  order by case when s.stage='EXPANDING' then 0 when s.status='QUEUED' then 1 else 2 end,
    coalesce(s.next_retry_at,s.next_attempt_at,s.created_at),s.created_at
  for update of s skip locked limit 1;

  if v_id is null then return; end if;
  update public.contact_discovery_sessions set
    status='RUNNING',job_state='RUNNING',stage=case when route_expansion_pass>0 then 'EXPANDING' else 'PREPARING' end,progress=5,
    attempt_count=attempt_count+1,claimed_at=now(),started_at=coalesce(started_at,now()),
    heartbeat_at=now(),last_heartbeat_at=now(),lease_expires_at=now()+interval '8 minutes',
    last_error=null,last_error_code=null,last_error_message=null,next_attempt_at=null,next_retry_at=null,
    scheduler_run_id=p_scheduler_run_id,updated_at=now()
  where id=v_id;
  return query select s.id,s.organisation_id,s.campaign_id,s.company_id,s.route_expansion_pass
    from public.contact_discovery_sessions s where s.id=v_id;
end $$;

revoke all on function public.claim_contact_discovery(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.claim_contact_discovery(uuid,uuid,boolean) to service_role;
