-- Genesis G4.6.5 post-freeze reliability hardening.
-- 1. Never represent a normal homepage as a verified website contact form.
-- 2. Prevent commercial outcome histories from moving backwards.

create or replace function public.is_supported_contact_form_url(p_url text)
returns boolean
language sql
immutable
parallel safe
as $$
  select case
    when nullif(trim(coalesce(p_url,'')),'') is null then false
    when lower(p_url) !~ '^https?://' then false
    else lower(split_part(p_url,'?',1)) ~ '(^|/|[-_])(contact|contact-us|get-in-touch|enquiry|inquiry|request-a-quote|request-quote|book-a-demo|request-a-demo|consultation)(/|$|[-_])'
  end
$$;

revoke all on function public.is_supported_contact_form_url(text) from public,anon,authenticated;
grant execute on function public.is_supported_contact_form_url(text) to service_role;

create or replace function public.sync_engagement_strategies(p_scheduler_run_id uuid)
returns table(updated integer, ready integer, needs_attention integer)
language plpgsql security definer set search_path=public as $$
declare v_updated integer:=0; v_ready integer:=0; v_attention integer:=0;
begin
  if not exists(select 1 from public.pipeline_scheduler_runs where id=p_scheduler_run_id) then raise exception 'scheduler run required'; end if;

  update public.opportunity_engagements e set
    primary_channel = case
      when nullif(trim(coalesce(e.recipient_email,'')),'') is not null then 'EMAIL'
      when nullif(trim(coalesce(e.linkedin_profile_url,'')),'') is not null then 'LINKEDIN'
      when public.is_supported_contact_form_url(e.route_source_url) or public.is_supported_contact_form_url(c.website_url) then 'WEBSITE_FORM'
      else 'NONE' end,
    secondary_channel = case
      when nullif(trim(coalesce(e.recipient_email,'')),'') is not null and nullif(trim(coalesce(e.linkedin_profile_url,'')),'') is not null then 'LINKEDIN'
      when nullif(trim(coalesce(e.recipient_email,'')),'') is not null and (public.is_supported_contact_form_url(e.route_source_url) or public.is_supported_contact_form_url(c.website_url)) then 'WEBSITE_FORM'
      when nullif(trim(coalesce(e.linkedin_profile_url,'')),'') is not null and (public.is_supported_contact_form_url(e.route_source_url) or public.is_supported_contact_form_url(c.website_url)) then 'WEBSITE_FORM'
      else null end,
    fallback_channel = case when public.is_supported_contact_form_url(e.route_source_url) or public.is_supported_contact_form_url(c.website_url) then 'WEBSITE_FORM' else 'NONE' end,
    entry_strategy = case
      when nullif(trim(coalesce(e.recipient_email,'')),'') is not null then 'Use the verified email route with a concise, evidence-led opening tailored to the recommended buyer.'
      when nullif(trim(coalesce(e.linkedin_profile_url,'')),'') is not null then 'Approach the recommended buyer on LinkedIn with a short, conversational message designed to earn a reply.'
      when public.is_supported_contact_form_url(e.route_source_url) or public.is_supported_contact_form_url(c.website_url) then 'Use the verified organisation contact form and ask for the message to be directed to the recommended commercial owner.'
      else 'Continue route research before attempting engagement.' end,
    recommendation_reason = case
      when nullif(trim(coalesce(e.recipient_email,'')),'') is not null then 'A direct email route is available and offers the clearest controlled path into the organisation.'
      when nullif(trim(coalesce(e.linkedin_profile_url,'')),'') is not null then 'A public LinkedIn route is available when no supported direct email can be used.'
      when public.is_supported_contact_form_url(e.route_source_url) or public.is_supported_contact_form_url(c.website_url) then 'A specific contact-form route is available and is the strongest currently supported path.'
      else 'No sufficiently supported execution route is available yet.' end,
    strategy_confidence = greatest(0,least(100,coalesce(o.route_confidence,0))),
    pipeline_state = case
      when e.status='NEEDS_ROUTE' and nullif(trim(coalesce(e.recipient_email,'')),'') is null and nullif(trim(coalesce(e.linkedin_profile_url,'')),'') is null and not (public.is_supported_contact_form_url(e.route_source_url) or public.is_supported_contact_form_url(c.website_url)) then 'NEEDS_ATTENTION'
      when e.status in ('DRAFT_REVIEW','APPROVED_TO_SEND','QUEUED_FOR_SEND','SENT') then 'COMPLETE'
      else 'READY' end,
    current_stage = case
      when e.status='NEEDS_ROUTE' and nullif(trim(coalesce(e.recipient_email,'')),'') is null and nullif(trim(coalesce(e.linkedin_profile_url,'')),'') is null and not (public.is_supported_contact_form_url(e.route_source_url) or public.is_supported_contact_form_url(c.website_url)) then 'ROUTE_RESEARCH'
      when e.status='READY_FOR_DRAFT' then 'COMMERCIAL_REASONING'
      when e.status='DRAFT_REVIEW' then 'HUMAN_REVIEW'
      when e.status in ('APPROVED_TO_SEND','QUEUED_FOR_SEND','SENT') then 'EXECUTION'
      else e.current_stage end,
    stage_reason = case
      when e.status='NEEDS_ROUTE' and nullif(trim(coalesce(e.recipient_email,'')),'') is null and nullif(trim(coalesce(e.linkedin_profile_url,'')),'') is null and not (public.is_supported_contact_form_url(e.route_source_url) or public.is_supported_contact_form_url(c.website_url)) then 'No verified email, LinkedIn profile or specific contact-form route is available.'
      else 'Engagement strategy synchronised from the best supported access route.' end,
    updated_at=now()
  from public.companies c join public.opportunities o on o.company_id=c.id
  where e.company_id=c.id and e.opportunity_id=o.id and o.status='APPROVED';
  get diagnostics v_updated=row_count;

  insert into public.engagement_pipeline_events(organisation_id,campaign_id,engagement_id,opportunity_id,scheduler_run_id,stage,state,reason,attempt_count,worker)
  select e.organisation_id,e.campaign_id,e.id,e.opportunity_id,p_scheduler_run_id,e.current_stage,e.pipeline_state,e.stage_reason,e.stage_attempts,'engagement-strategy'
  from public.opportunity_engagements e join public.opportunities o on o.id=e.opportunity_id and o.status='APPROVED'
  where not exists(select 1 from public.engagement_pipeline_events x where x.engagement_id=e.id and x.scheduler_run_id=p_scheduler_run_id and x.stage=e.current_stage);

  select count(*) into v_ready from public.opportunity_engagements where pipeline_state='READY';
  select count(*) into v_attention from public.opportunity_engagements where pipeline_state='NEEDS_ATTENTION';
  return query select v_updated,v_ready,v_attention;
end $$;
revoke all on function public.sync_engagement_strategies(uuid) from public,anon,authenticated;
grant execute on function public.sync_engagement_strategies(uuid) to service_role;

create or replace function public.record_engagement_outcome(
  p_organisation_id uuid,
  p_engagement_id uuid,
  p_user_id uuid,
  p_outcome text,
  p_note text default null,
  p_outcome_value numeric default null
) returns public.engagement_outcomes
language plpgsql security definer set search_path=public as $$
declare
  v_eng public.opportunity_engagements%rowtype;
  v_opp public.opportunities%rowtype;
  v_result public.engagement_outcomes%rowtype;
  v_latest text;
  v_latest_rank integer;
  v_new_rank integer;
begin
  if not exists(select 1 from public.organisation_memberships where organisation_id=p_organisation_id and user_id=p_user_id and status='ACTIVE' and role in ('OWNER','ADMIN','MEMBER')) then raise exception 'outcome forbidden'; end if;
  if p_outcome not in ('NO_RESPONSE','REPLIED','MEETING_BOOKED','QUALIFIED','WON','LOST') then raise exception 'invalid outcome'; end if;
  if p_outcome <> 'WON' and p_outcome_value is not null then raise exception 'outcome value is only valid for won opportunities'; end if;
  select * into v_eng from public.opportunity_engagements where id=p_engagement_id and organisation_id=p_organisation_id for update;
  if v_eng.id is null then raise exception 'engagement missing'; end if;
  if v_eng.execution_state <> 'COMPLETED' and v_eng.status <> 'SENT' then raise exception 'engagement must be completed before recording an outcome'; end if;

  select outcome into v_latest from public.engagement_outcomes where engagement_id=p_engagement_id order by occurred_at desc,id desc limit 1;
  if v_latest=p_outcome then raise exception 'outcome already recorded'; end if;
  if v_latest in ('WON','LOST') then raise exception 'terminal outcome already recorded'; end if;

  v_latest_rank := case v_latest when 'NO_RESPONSE' then 0 when 'REPLIED' then 1 when 'MEETING_BOOKED' then 2 when 'QUALIFIED' then 3 else -1 end;
  v_new_rank := case p_outcome when 'NO_RESPONSE' then 0 when 'REPLIED' then 1 when 'MEETING_BOOKED' then 2 when 'QUALIFIED' then 3 when 'WON' then 4 when 'LOST' then 4 else -1 end;
  if v_latest is not null and p_outcome <> 'LOST' and v_new_rank <= v_latest_rank then raise exception 'outcome cannot move backwards'; end if;

  select * into v_opp from public.opportunities where id=v_eng.opportunity_id and organisation_id=p_organisation_id;
  if v_opp.id is null then raise exception 'opportunity missing'; end if;
  insert into public.engagement_outcomes(organisation_id,campaign_id,opportunity_id,engagement_id,actor_user_id,channel,route_quality,route_confidence,outcome,outcome_value,note)
  values(v_eng.organisation_id,v_eng.campaign_id,v_eng.opportunity_id,v_eng.id,p_user_id,coalesce(v_eng.primary_channel,v_eng.channel_type),v_opp.route_quality,v_opp.route_confidence,p_outcome,p_outcome_value,nullif(trim(coalesce(p_note,'')),'')) returning * into v_result;
  if p_outcome in ('REPLIED','MEETING_BOOKED','QUALIFIED','WON') then update public.opportunities set status='ENGAGED',updated_at=now() where id=v_eng.opportunity_id and status='APPROVED'; end if;
  insert into public.campaign_timeline(organisation_id,campaign_id,event_type,title,description,visibility,metadata_json)
  values(v_eng.organisation_id,v_eng.campaign_id,'ENGAGEMENT_OUTCOME_RECORDED','Engagement outcome recorded',
    case p_outcome when 'REPLIED' then 'A response was received through the recommended engagement.' when 'MEETING_BOOKED' then 'The engagement produced a meeting.' when 'WON' then 'The opportunity was marked won.' when 'LOST' then 'The opportunity was marked lost.' when 'NO_RESPONSE' then 'No response was recorded for the engagement.' else 'A commercial outcome was recorded.' end,
    'CUSTOMER',jsonb_build_object('engagementId',v_eng.id,'opportunityId',v_eng.opportunity_id,'channel',coalesce(v_eng.primary_channel,v_eng.channel_type),'outcome',p_outcome));
  return v_result;
end $$;
revoke all on function public.record_engagement_outcome(uuid,uuid,uuid,text,text,numeric) from public,anon;
grant execute on function public.record_engagement_outcome(uuid,uuid,uuid,text,text,numeric) to authenticated,service_role;
