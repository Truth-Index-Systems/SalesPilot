-- SalesPilot Genesis — post-freeze governance deferral + canonical contact/route synchronisation
-- 1) AI allowance exhaustion parks claimed work without consuming an attempt.
-- 2) Route Intelligence named direct-email/LinkedIn findings reconcile into public.contacts.
-- G4/G5 intelligence remains authoritative; this migration changes recovery/presentation persistence only.

create or replace function public.defer_company_discovery_governance_owned(
  p_session_id uuid,
  p_scheduler_run_id uuid,
  p_reason_code text
) returns boolean
language plpgsql security definer set search_path=public as $$
declare s public.discovery_sessions%rowtype;
begin
  perform public.assert_active_pipeline_scheduler_run(p_scheduler_run_id);
  select * into s from public.discovery_sessions where id=p_session_id for update;
  if s.id is null then return false; end if;
  if s.status<>'RUNNING' or s.scheduler_run_id is distinct from p_scheduler_run_id then return false; end if;

  update public.discovery_sessions set
    status='QUEUED',
    job_state='QUEUED',
    attempt_count=greatest(attempt_count-1,0),
    claimed_at=null,
    lease_expires_at=null,
    scheduler_run_id=null,
    next_attempt_at=now(),
    next_retry_at=null,
    last_error=null,
    last_error_code=null,
    last_error_message=null,
    heartbeat_at=now(),
    last_heartbeat_at=now(),
    updated_at=now()
  where id=p_session_id;

  insert into public.campaign_timeline(organisation_id,campaign_id,event_type,title,description,visibility,metadata_json)
  values(s.organisation_id,s.campaign_id,'AI_ALLOWANCE_DEFERRED','Research waiting for AI allowance',
    'SalesPilot kept the current company-research job intact. It will resume automatically when the workspace AI allowance permits another request.',
    'CUSTOMER',jsonb_build_object('sessionId',s.id,'reasonCode',coalesce(p_reason_code,'UNKNOWN'),'attemptConsumed',false));
  return true;
end $$;

create or replace function public.defer_contact_discovery_governance_owned(
  p_session_id uuid,
  p_scheduler_run_id uuid,
  p_reason_code text
) returns boolean
language plpgsql security definer set search_path=public as $$
declare s public.contact_discovery_sessions%rowtype;
begin
  perform public.assert_active_pipeline_scheduler_run(p_scheduler_run_id);
  select * into s from public.contact_discovery_sessions where id=p_session_id for update;
  if s.id is null then return false; end if;
  if s.status<>'RUNNING' or s.scheduler_run_id is distinct from p_scheduler_run_id then return false; end if;

  update public.contact_discovery_sessions set
    status='QUEUED',
    job_state='QUEUED',
    attempt_count=greatest(attempt_count-1,0),
    claimed_at=null,
    lease_expires_at=null,
    scheduler_run_id=null,
    next_attempt_at=now(),
    next_retry_at=null,
    last_error=null,
    last_error_code=null,
    last_error_message=null,
    heartbeat_at=now(),
    last_heartbeat_at=now(),
    updated_at=now()
  where id=p_session_id;

  insert into public.campaign_timeline(organisation_id,campaign_id,event_type,title,description,visibility,metadata_json)
  values(s.organisation_id,s.campaign_id,'AI_ALLOWANCE_DEFERRED','Route research waiting for AI allowance',
    'SalesPilot kept this account at its current route-research pass. It will resume automatically when the workspace AI allowance permits another request.',
    'CUSTOMER',jsonb_build_object('sessionId',s.id,'companyId',s.company_id,'reasonCode',coalesce(p_reason_code,'UNKNOWN'),'attemptConsumed',false,'routeExpansionPass',coalesce(s.route_expansion_pass,0)));
  return true;
end $$;

create or replace function public.defer_g5_engagement_governance_owned(
  p_strategy_id uuid,
  p_scheduler_run_id uuid,
  p_lease_token uuid,
  p_active_state text,
  p_resume_state text,
  p_reason_code text
) returns boolean
language plpgsql security definer set search_path=public as $$
declare s public.engagement_strategies%rowtype;
begin
  perform public.assert_active_pipeline_scheduler_run(p_scheduler_run_id);
  if p_active_state not in ('REASONING','STRATEGY_READY','GENERATING','SELF_REVIEW') then raise exception 'G5_GOVERNANCE_DEFER_ACTIVE_STATE_INVALID'; end if;
  if p_resume_state not in ('WAITING','STRATEGY_READY','SELF_REVIEW') then raise exception 'G5_GOVERNANCE_DEFER_RESUME_STATE_INVALID'; end if;
  select * into s from public.engagement_strategies where id=p_strategy_id for update;
  if s.id is null then return false; end if;
  if s.state<>p_active_state or s.scheduler_run_id is distinct from p_scheduler_run_id or s.lease_token is distinct from p_lease_token
     or s.lease_expires_at is null or s.lease_expires_at<now() then return false; end if;

  update public.engagement_strategies set
    previous_state=p_active_state,
    state=p_resume_state,
    attempt_count=greatest(attempt_count-1,0),
    scheduler_run_id=null,
    lease_token=null,
    claimed_at=null,
    lease_expires_at=null,
    next_retry_at=null,
    failure_stage=null,
    failure_reason=null,
    updated_at=now()
  where id=p_strategy_id;

  insert into public.engagement_strategy_events(
    organisation_id,campaign_id,strategy_id,opportunity_id,scheduler_run_id,event_type,
    previous_state,next_state,lease_token,metadata_json
  ) values(
    s.organisation_id,s.campaign_id,s.id,s.opportunity_id,p_scheduler_run_id,'LEASE_RELEASED',
    p_active_state,p_resume_state,p_lease_token,
    jsonb_build_object('release','POST_G5_FREEZE','governanceDeferred',true,'reasonCode',coalesce(p_reason_code,'UNKNOWN'),'attemptConsumed',false)
  );
  return true;
end $$;

-- Preserve a stronger previously-known email/LinkedIn channel when a later pass omits it.
create or replace function public.save_contact_discovery_batch(
  p_session_id uuid,p_contacts jsonb,p_research_summary text default null,
  p_uncertainties jsonb default '[]'::jsonb,p_unresolved_roles jsonb default '[]'::jsonb
) returns integer language plpgsql security definer set search_path=public as $$
declare s public.contact_discovery_sessions%rowtype; item jsonb; ev jsonb; v_contact_id uuid; v_version integer; saved integer:=0; v_name text; v_role text; v_event_id uuid;
begin
  select * into s from public.contact_discovery_sessions where id=p_session_id for update;
  if s.id is null or s.status<>'RUNNING' then raise exception 'contact discovery session is not running'; end if;
  if jsonb_typeof(p_contacts)<>'array' then raise exception 'contacts payload must be an array'; end if;

  for item in select * from jsonb_array_elements(p_contacts) loop
    v_name:=lower(regexp_replace(trim(item->>'fullName'),'[^a-z0-9]+','','gi'));
    v_role:=lower(regexp_replace(trim(item->>'roleTitle'),'[^a-z0-9]+','','gi'));
    if coalesce(v_name,'')='' or coalesce(v_role,'')='' then continue; end if;
    if not exists(select 1 from jsonb_array_elements(coalesce(item->'evidence','[]'::jsonb)) e where e->>'evidenceType'='IDENTITY' and coalesce((e->>'verified')::boolean,false)=true) then continue; end if;
    if not exists(select 1 from jsonb_array_elements(coalesce(item->'evidence','[]'::jsonb)) e where e->>'evidenceType'='ROLE' and coalesce((e->>'verified')::boolean,false)=true) then continue; end if;

    insert into public.contacts(
      organisation_id,campaign_id,company_id,contact_discovery_session_id,full_name,normalised_name,role_title,normalised_role,
      department,location,reason_selected,identity_confidence,role_confidence,buying_relevance,operational_relevance,
      evidence_quality,overall_confidence,confidence_label,unknowns_json,risk_flags_json,
      email_address,email_status,email_confidence,email_source_url,
      linkedin_profile_url,linkedin_status,linkedin_confidence,linkedin_source_url
    ) values(
      s.organisation_id,s.campaign_id,s.company_id,s.id,item->>'fullName',v_name,item->>'roleTitle',v_role,
      nullif(item->>'department',''),nullif(item->>'location',''),item->>'reasonSelected',
      (item->'confidence'->>'identity')::integer,(item->'confidence'->>'role')::integer,
      (item->'confidence'->>'buyingRelevance')::integer,(item->'confidence'->>'operationalRelevance')::integer,
      (item->'confidence'->>'evidenceQuality')::integer,(item->'confidence'->>'overall')::integer,item->'confidence'->>'label',
      coalesce(item->'unknowns','[]'::jsonb),coalesce(item->'riskFlags','[]'::jsonb),
      nullif(item->'email'->>'address',''),coalesce(nullif(item->'email'->>'status',''),'UNKNOWN'),
      coalesce((item->'email'->>'confidence')::integer,0),nullif(item->'email'->>'sourceUrl',''),
      nullif(item->'linkedin'->>'profileUrl',''),coalesce(nullif(item->'linkedin'->>'status',''),'UNKNOWN'),
      coalesce((item->'linkedin'->>'confidence')::integer,0),nullif(item->'linkedin'->>'sourceUrl','')
    ) on conflict (campaign_id,company_id,normalised_name,normalised_role) do update set
      contact_discovery_session_id=excluded.contact_discovery_session_id,full_name=excluded.full_name,role_title=excluded.role_title,
      department=coalesce(excluded.department,contacts.department),location=coalesce(excluded.location,contacts.location),reason_selected=excluded.reason_selected,
      identity_confidence=greatest(contacts.identity_confidence,excluded.identity_confidence),role_confidence=greatest(contacts.role_confidence,excluded.role_confidence),
      buying_relevance=greatest(contacts.buying_relevance,excluded.buying_relevance),operational_relevance=greatest(contacts.operational_relevance,excluded.operational_relevance),
      evidence_quality=greatest(contacts.evidence_quality,excluded.evidence_quality),overall_confidence=greatest(contacts.overall_confidence,excluded.overall_confidence),
      confidence_label=case when excluded.overall_confidence>=contacts.overall_confidence then excluded.confidence_label else contacts.confidence_label end,
      unknowns_json=excluded.unknowns_json,risk_flags_json=excluded.risk_flags_json,
      email_address=case when excluded.email_address is not null and (contacts.email_address is null or excluded.email_confidence>=contacts.email_confidence) then excluded.email_address else contacts.email_address end,
      email_status=case when excluded.email_address is not null and (contacts.email_address is null or excluded.email_confidence>=contacts.email_confidence) then excluded.email_status else contacts.email_status end,
      email_confidence=case when excluded.email_address is not null then greatest(contacts.email_confidence,excluded.email_confidence) else contacts.email_confidence end,
      email_source_url=case when excluded.email_address is not null and (contacts.email_address is null or excluded.email_confidence>=contacts.email_confidence) then excluded.email_source_url else contacts.email_source_url end,
      linkedin_profile_url=case when excluded.linkedin_profile_url is not null and (contacts.linkedin_profile_url is null or excluded.linkedin_confidence>=contacts.linkedin_confidence) then excluded.linkedin_profile_url else contacts.linkedin_profile_url end,
      linkedin_status=case when excluded.linkedin_profile_url is not null and (contacts.linkedin_profile_url is null or excluded.linkedin_confidence>=contacts.linkedin_confidence) then excluded.linkedin_status else contacts.linkedin_status end,
      linkedin_confidence=case when excluded.linkedin_profile_url is not null then greatest(contacts.linkedin_confidence,excluded.linkedin_confidence) else contacts.linkedin_confidence end,
      linkedin_source_url=case when excluded.linkedin_profile_url is not null and (contacts.linkedin_profile_url is null or excluded.linkedin_confidence>=contacts.linkedin_confidence) then excluded.linkedin_source_url else contacts.linkedin_source_url end,
      updated_at=now()
    returning id into v_contact_id;

    select coalesce(max(version_number),0)+1 into v_version from public.contact_versions where contact_id=v_contact_id;
    insert into public.contact_versions(organisation_id,contact_id,version_number,payload_json) values(s.organisation_id,v_contact_id,v_version,item);
    for ev in select * from jsonb_array_elements(coalesce(item->'evidence','[]'::jsonb)) loop
      if not exists(select 1 from public.contact_evidence ce where ce.contact_id=v_contact_id and ce.evidence_type=ev->>'evidenceType' and ce.source_url=ev->>'sourceUrl' and ce.claim=ev->>'claim') then
        insert into public.contact_evidence(organisation_id,campaign_id,company_id,contact_id,evidence_type,claim,source_url,source_title,excerpt,source_kind,source_domain,verified,excerpt_matched,quality_score,retrieved_at)
        values(s.organisation_id,s.campaign_id,s.company_id,v_contact_id,ev->>'evidenceType',ev->>'claim',ev->>'sourceUrl',nullif(ev->>'sourceTitle',''),nullif(ev->>'excerpt',''),ev->>'sourceKind',nullif(ev->>'sourceDomain',''),coalesce((ev->>'verified')::boolean,false),coalesce((ev->>'excerptMatched')::boolean,false),coalesce((ev->>'qualityScore')::integer,0),nullif(ev->>'retrievedAt','')::timestamptz);
      end if;
    end loop;

    v_event_id:=gen_random_uuid();
    insert into public.domain_outbox(organisation_id,event_id,event_type,aggregate_type,aggregate_id,payload_json,occurred_at)
    values(s.organisation_id,v_event_id,'ContactsDiscovered','Contact',v_contact_id,
      jsonb_build_object('campaignId',s.campaign_id,'companyId',s.company_id,'contactId',v_contact_id,'sessionId',s.id,
        'emailStatus',coalesce(item->'email'->>'status','UNKNOWN'),'linkedinStatus',coalesce(item->'linkedin'->>'status','UNKNOWN')),now());
    saved:=saved+1;
  end loop;

  update public.contact_discovery_sessions set contacts_saved=(select count(*) from public.contacts where contact_discovery_session_id=s.id),research_summary=left(p_research_summary,1500),uncertainties_json=coalesce(p_uncertainties,'[]'::jsonb),unresolved_roles_json=coalesce(p_unresolved_roles,'[]'::jsonb),stage='SAVING',progress=92,heartbeat_at=now(),lease_expires_at=now()+interval '10 minutes',updated_at=now() where id=s.id;
  return saved;
end $$;

create or replace function public.reconcile_route_contacts(p_session_id uuid)
returns integer language plpgsql security definer set search_path=public as $$
declare
  s public.contact_discovery_sessions%rowtype;
  r record;
  v_contact_id uuid;
  v_name text;
  v_role text;
  v_source text;
  v_touched integer:=0;
  v_conf integer;
begin
  select * into s from public.contact_discovery_sessions where id=p_session_id for update;
  if s.id is null or s.status<>'RUNNING' then raise exception 'contact discovery session is not running'; end if;

  for r in
    select cr.*
    from public.commercial_routes cr
    where cr.contact_discovery_session_id=s.id
      and cr.is_viable=true
      and cr.channel_type in ('DIRECT_EMAIL','LINKEDIN')
      and nullif(trim(coalesce(cr.channel_value,'')),'') is not null
      and nullif(trim(coalesce(cr.contact_name,'')),'') is not null
      and nullif(trim(coalesce(cr.contact_role,'')),'') is not null
      and exists(select 1 from public.commercial_route_evidence cre where cre.route_id=cr.id and cre.verified=true and cre.evidence_type='IDENTITY' and cre.quality_score>=60)
      and exists(select 1 from public.commercial_route_evidence cre where cre.route_id=cr.id and cre.verified=true and cre.evidence_type='ROLE' and cre.quality_score>=60)
      and exists(select 1 from public.commercial_route_evidence cre where cre.route_id=cr.id and cre.verified=true and cre.evidence_type=case when cr.channel_type='DIRECT_EMAIL' then 'EMAIL' else 'LINKEDIN' end and cre.quality_score>=60)
    order by cr.is_primary desc,cr.route_quality desc,cr.confidence desc
  loop
    v_name:=lower(regexp_replace(trim(r.contact_name),'[^a-z0-9]+','','gi'));
    v_role:=lower(regexp_replace(trim(r.contact_role),'[^a-z0-9]+','','gi'));
    if coalesce(v_name,'')='' or coalesce(v_role,'')='' then continue; end if;
    select cre.source_url into v_source from public.commercial_route_evidence cre where cre.route_id=r.id and cre.verified=true and cre.evidence_type=case when r.channel_type='DIRECT_EMAIL' then 'EMAIL' else 'LINKEDIN' end order by cre.quality_score desc,cre.created_at asc limit 1;
    if v_source is null then continue; end if;
    v_conf:=least(95,greatest(65,round((r.confidence+r.evidence_quality+r.commercial_relevance)/3.0)::integer));

    insert into public.contacts(
      organisation_id,campaign_id,company_id,contact_discovery_session_id,full_name,normalised_name,role_title,normalised_role,
      department,location,reason_selected,identity_confidence,role_confidence,buying_relevance,operational_relevance,evidence_quality,overall_confidence,confidence_label,
      unknowns_json,risk_flags_json,email_address,email_status,email_confidence,email_source_url,linkedin_profile_url,linkedin_status,linkedin_confidence,linkedin_source_url
    ) values(
      s.organisation_id,s.campaign_id,s.company_id,s.id,r.contact_name,v_name,r.contact_role,v_role,
      r.department,null,'Route Intelligence verified an executable named-person access route.',v_conf,v_conf,r.commercial_relevance,r.commercial_relevance,r.evidence_quality,v_conf,
      case when v_conf>=80 then 'VERIFIED' else 'LIKELY' end,'[]'::jsonb,'[]'::jsonb,
      case when r.channel_type='DIRECT_EMAIL' then lower(trim(r.channel_value)) else null end,
      case when r.channel_type='DIRECT_EMAIL' then 'VERIFIED' else 'UNKNOWN' end,
      case when r.channel_type='DIRECT_EMAIL' then v_conf else 0 end,
      case when r.channel_type='DIRECT_EMAIL' then v_source else null end,
      case when r.channel_type='LINKEDIN' then trim(r.channel_value) else null end,
      case when r.channel_type='LINKEDIN' then 'VERIFIED' else 'UNKNOWN' end,
      case when r.channel_type='LINKEDIN' then v_conf else 0 end,
      case when r.channel_type='LINKEDIN' then v_source else null end
    ) on conflict(campaign_id,company_id,normalised_name,normalised_role) do update set
      contact_discovery_session_id=excluded.contact_discovery_session_id,
      department=coalesce(excluded.department,contacts.department),
      reason_selected=excluded.reason_selected,
      identity_confidence=greatest(contacts.identity_confidence,excluded.identity_confidence),
      role_confidence=greatest(contacts.role_confidence,excluded.role_confidence),
      buying_relevance=greatest(contacts.buying_relevance,excluded.buying_relevance),
      operational_relevance=greatest(contacts.operational_relevance,excluded.operational_relevance),
      evidence_quality=greatest(contacts.evidence_quality,excluded.evidence_quality),
      overall_confidence=greatest(contacts.overall_confidence,excluded.overall_confidence),
      confidence_label=case when greatest(contacts.overall_confidence,excluded.overall_confidence)>=80 then 'VERIFIED' else 'LIKELY' end,
      email_address=coalesce(contacts.email_address,excluded.email_address),
      email_status=case when contacts.email_address is null and excluded.email_address is not null then excluded.email_status else contacts.email_status end,
      email_confidence=greatest(contacts.email_confidence,excluded.email_confidence),
      email_source_url=case when contacts.email_address is null and excluded.email_address is not null then excluded.email_source_url else contacts.email_source_url end,
      linkedin_profile_url=coalesce(contacts.linkedin_profile_url,excluded.linkedin_profile_url),
      linkedin_status=case when contacts.linkedin_profile_url is null and excluded.linkedin_profile_url is not null then excluded.linkedin_status else contacts.linkedin_status end,
      linkedin_confidence=greatest(contacts.linkedin_confidence,excluded.linkedin_confidence),
      linkedin_source_url=case when contacts.linkedin_profile_url is null and excluded.linkedin_profile_url is not null then excluded.linkedin_source_url else contacts.linkedin_source_url end,
      updated_at=now()
    returning id into v_contact_id;

    insert into public.contact_evidence(organisation_id,campaign_id,company_id,contact_id,evidence_type,claim,source_url,source_title,excerpt,source_kind,source_domain,verified,excerpt_matched,quality_score,retrieved_at)
    select cre.organisation_id,cre.campaign_id,cre.company_id,v_contact_id,
      case when r.channel_type='DIRECT_EMAIL' then 'EMAIL' else 'LINKEDIN' end,
      cre.claim,cre.source_url,cre.source_title,cre.excerpt,cre.source_kind,cre.source_domain,cre.verified,cre.excerpt_matched,cre.quality_score,cre.retrieved_at
    from public.commercial_route_evidence cre
    where cre.route_id=r.id and cre.verified=true
      and not exists(select 1 from public.contact_evidence ce where ce.contact_id=v_contact_id and ce.source_url=cre.source_url and ce.claim=cre.claim and ce.evidence_type=case when r.channel_type='DIRECT_EMAIL' then 'EMAIL' else 'LINKEDIN' end);

    v_touched:=v_touched+1;
  end loop;

  update public.contact_discovery_sessions set contacts_saved=(select count(*) from public.contacts where organisation_id=s.organisation_id and campaign_id=s.campaign_id and company_id=s.company_id),updated_at=now() where id=s.id;
  return v_touched;
end $$;

create or replace function public.reconcile_route_contacts_owned(p_session_id uuid,p_scheduler_run_id uuid)
returns integer language plpgsql security definer set search_path=public as $$
begin
  perform public.assert_contact_discovery_owner(p_session_id,p_scheduler_run_id);
  return public.reconcile_route_contacts(p_session_id);
end $$;

revoke all on function public.defer_company_discovery_governance_owned(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.defer_contact_discovery_governance_owned(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.defer_g5_engagement_governance_owned(uuid,uuid,uuid,text,text,text) from public,anon,authenticated;
revoke all on function public.reconcile_route_contacts(uuid) from public,anon,authenticated;
revoke all on function public.reconcile_route_contacts_owned(uuid,uuid) from public,anon,authenticated;
revoke all on function public.save_contact_discovery_batch(uuid,jsonb,text,jsonb,jsonb) from public,anon,authenticated;

grant execute on function public.defer_company_discovery_governance_owned(uuid,uuid,text) to service_role;
grant execute on function public.defer_contact_discovery_governance_owned(uuid,uuid,text) to service_role;
grant execute on function public.defer_g5_engagement_governance_owned(uuid,uuid,uuid,text,text,text) to service_role;
grant execute on function public.reconcile_route_contacts(uuid) to service_role;
grant execute on function public.reconcile_route_contacts_owned(uuid,uuid) to service_role;
grant execute on function public.save_contact_discovery_batch(uuid,jsonb,text,jsonb,jsonb) to service_role;
