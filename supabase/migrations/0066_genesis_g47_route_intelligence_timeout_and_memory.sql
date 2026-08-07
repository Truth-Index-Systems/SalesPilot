-- Genesis G4.7.1: Route Intelligence timeout hardening + reusable route memory
-- Company Discovery remains frozen.
--
-- Route Intelligence research is deliberately expensive. This release prevents
-- the platform from forgetting previously verified public routes when the same
-- organisation/company domain is researched in a later campaign.

create or replace function public.get_route_intelligence_memory(p_company_id uuid)
returns table(
  company_domain text,
  channels jsonb,
  contacts jsonb,
  commercial_routes jsonb
)
language plpgsql security definer set search_path=public as $$
declare
  c public.companies%rowtype;
  v_domain text;
begin
  select * into c from public.companies where id=p_company_id;
  if c.id is null then return; end if;

  v_domain:=lower(regexp_replace(regexp_replace(coalesce(c.website_url,''),'^https?://(www\\.)?','','i'),'/.*$','','g'));
  if nullif(v_domain,'') is null then return; end if;

  return query
  with matching_companies as (
    select x.id
    from public.companies x
    where x.organisation_id=c.organisation_id
      and x.id<>c.id
      and lower(regexp_replace(regexp_replace(coalesce(x.website_url,''),'^https?://(www\\.)?','','i'),'/.*$','','g'))=v_domain
  )
  select
    v_domain,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'emailAddress',ch.email_address,
        'channelType',ch.channel_type,
        'department',ch.department,
        'associatedContactName',ac.full_name,
        'likelyReader',ch.likely_reader,
        'reasonSelected',ch.reason_selected,
        'verificationStatus',ch.verification_status,
        'confidence',ch.confidence,
        'routingScore',ch.routing_score,
        'responseLikelihood',ch.response_likelihood,
        'campaignRelevance',ch.campaign_relevance,
        'sourceUrl',ch.source_url,
        'sourceTitle',ch.source_title,
        'evidenceExcerpt',ch.evidence_excerpt
      ) order by ch.routing_score desc,ch.confidence desc)
      from public.company_contact_channels ch
      left join public.contacts ac on ac.id=ch.associated_contact_id
      where ch.organisation_id=c.organisation_id
        and ch.company_id in(select id from matching_companies)
        and ch.deliverability_status not in('UNDELIVERABLE','BOUNCED')
        and ch.confidence>=60
    ),'[]'::jsonb),
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'fullName',ct.full_name,
        'roleTitle',ct.role_title,
        'department',ct.department,
        'location',ct.location,
        'emailAddress',ct.email_address,
        'emailStatus',ct.email_status,
        'emailConfidence',ct.email_confidence,
        'emailSourceUrl',ct.email_source_url,
        'linkedinProfileUrl',ct.linkedin_profile_url,
        'linkedinStatus',ct.linkedin_status,
        'linkedinConfidence',ct.linkedin_confidence,
        'linkedinSourceUrl',ct.linkedin_source_url,
        'overallConfidence',ct.overall_confidence
      ) order by ct.overall_confidence desc)
      from public.contacts ct
      where ct.organisation_id=c.organisation_id
        and ct.company_id in(select id from matching_companies)
        and (ct.email_address is not null or ct.linkedin_profile_url is not null)
        and ct.overall_confidence>=55
    ),'[]'::jsonb),
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'routeType',r.route_type,
        'label',r.label,
        'entryRole',r.entry_role,
        'targetRole',r.target_role,
        'department',r.department,
        'contactName',r.contact_name,
        'contactRole',r.contact_role,
        'channelType',r.channel_type,
        'channelValue',r.channel_value,
        'routeQuality',r.route_quality,
        'confidence',r.confidence,
        'rationale',r.rationale,
        'nextStep',r.next_step
      ) order by r.is_primary desc,r.is_viable desc,r.route_quality desc)
      from public.commercial_routes r
      where r.organisation_id=c.organisation_id
        and r.company_id in(select id from matching_companies)
        and (r.is_viable=true or r.confidence>=60)
    ),'[]'::jsonb);
end $$;

revoke all on function public.get_route_intelligence_memory(uuid) from public,anon,authenticated;
grant execute on function public.get_route_intelligence_memory(uuid) to service_role;
