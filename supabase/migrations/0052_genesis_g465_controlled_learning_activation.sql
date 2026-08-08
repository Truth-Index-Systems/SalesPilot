-- MarketRoute Genesis G4.6.5: controlled learning activation and G4.6 freeze.

alter table public.opportunity_engagements
  add column if not exists learned_channel text,
  add column if not exists learned_channel_sample integer,
  add column if not exists learned_response_rate numeric(6,2),
  add column if not exists learned_meeting_rate numeric(6,2),
  add column if not exists learning_signal_strength text,
  add column if not exists learning_guidance text,
  add column if not exists learning_applied_at timestamptz;

alter table public.opportunity_engagements drop constraint if exists opportunity_engagements_learning_signal_strength_check;
alter table public.opportunity_engagements add constraint opportunity_engagements_learning_signal_strength_check
  check (learning_signal_strength is null or learning_signal_strength in ('COLLECTING','EMERGING','MATURE'));

create or replace function public.sync_engagement_learning_guidance(p_scheduler_run_id uuid)
returns table(updated integer, mature integer)
language plpgsql security definer set search_path=public as $$
declare v_updated integer:=0; v_mature integer:=0;
begin
  if not exists(select 1 from public.pipeline_scheduler_runs where id=p_scheduler_run_id) then
    raise exception 'scheduler run missing';
  end if;

  with ranked as (
    select l.organisation_id,l.channel,l.engagements,l.response_rate,l.meeting_rate,
      row_number() over(partition by l.organisation_id order by l.meeting_rate desc nulls last,l.response_rate desc nulls last,l.engagements desc) rn
    from public.engagement_channel_learning l
    where l.engagements >= 5
  )
  update public.opportunity_engagements e set
    learned_channel=r.channel,
    learned_channel_sample=r.engagements,
    learned_response_rate=r.response_rate,
    learned_meeting_rate=r.meeting_rate,
    learning_signal_strength=case when r.engagements>=15 then 'MATURE' when r.engagements>=5 then 'EMERGING' else 'COLLECTING' end,
    learning_guidance=case
      when r.channel=coalesce(e.primary_channel,e.channel_type) then
        'Observed market evidence supports the selected primary channel.'
      when r.channel=coalesce(e.secondary_channel,'NONE') then
        'Observed market evidence supports the selected secondary channel if the primary route does not respond.'
      when r.channel=coalesce(e.fallback_channel,'NONE') then
        'Observed market evidence supports the selected fallback channel after the primary sequence is exhausted.'
      else
        'Observed market evidence favours '||replace(initcap(lower(r.channel)),'_',' ')||', but MarketRoute has not overridden the verified access route.'
      end,
    learning_applied_at=now(),updated_at=now()
  from ranked r
  where r.rn=1 and r.organisation_id=e.organisation_id
    and e.status not in ('CANCELLED','SENT');
  get diagnostics v_updated=row_count;

  select count(*) into v_mature from public.opportunity_engagements
  where learning_signal_strength='MATURE';
  return query select v_updated,v_mature;
end $$;
revoke all on function public.sync_engagement_learning_guidance(uuid) from public,anon,authenticated;
grant execute on function public.sync_engagement_learning_guidance(uuid) to service_role;

-- Prevent duplicate and contradictory terminal outcomes while preserving normal progression.
create or replace function public.record_engagement_outcome(
  p_organisation_id uuid,
  p_engagement_id uuid,
  p_user_id uuid,
  p_outcome text,
  p_note text default null,
  p_outcome_value numeric default null
) returns public.engagement_outcomes
language plpgsql security definer set search_path=public as $$
declare v_eng public.opportunity_engagements%rowtype; v_opp public.opportunities%rowtype; v_result public.engagement_outcomes%rowtype; v_latest text;
begin
  if not exists(select 1 from public.organisation_memberships where organisation_id=p_organisation_id and user_id=p_user_id and status='ACTIVE' and role in ('OWNER','ADMIN','MEMBER')) then raise exception 'outcome forbidden'; end if;
  if p_outcome not in ('NO_RESPONSE','REPLIED','MEETING_BOOKED','QUALIFIED','WON','LOST') then raise exception 'invalid outcome'; end if;
  select * into v_eng from public.opportunity_engagements where id=p_engagement_id and organisation_id=p_organisation_id;
  if v_eng.id is null then raise exception 'engagement missing'; end if;
  if v_eng.execution_state <> 'COMPLETED' and v_eng.status <> 'SENT' then raise exception 'engagement must be completed before recording an outcome'; end if;
  select outcome into v_latest from public.engagement_outcomes where engagement_id=p_engagement_id order by occurred_at desc limit 1;
  if v_latest=p_outcome then raise exception 'outcome already recorded'; end if;
  if v_latest in ('WON','LOST') then raise exception 'terminal outcome already recorded'; end if;
  select * into v_opp from public.opportunities where id=v_eng.opportunity_id and organisation_id=p_organisation_id;
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

-- Recreate review view with learning guidance appended.
drop view if exists public.engagement_review_overview;
create view public.engagement_review_overview with (security_invoker=true) as
select
  e.id,e.organisation_id,e.campaign_id,e.opportunity_id,e.company_id,e.contact_id,e.status,e.outreach_policy,e.reply_policy,
  e.channel_type,e.recipient_name,e.recipient_role,e.recipient_email,e.linkedin_profile_url,e.route_source_url,e.source_opportunity_score,e.source_opportunity_rank,
  e.engagement_score,e.confidence,e.prepared_at,e.created_at,e.updated_at,
  e.primary_channel,e.secondary_channel,e.fallback_channel,e.entry_strategy,e.recommendation_reason,e.strategy_confidence,e.pipeline_state,e.current_stage,e.stage_reason,e.stage_attempts,e.stage_last_attempt_at,e.stage_next_retry_at,e.stage_failure_reason,
  e.execution_state,e.execution_last_action,e.execution_last_action_at,e.execution_completed_at,e.execution_completed_by,
  e.learned_channel,e.learned_channel_sample,e.learned_response_rate,e.learned_meeting_rate,e.learning_signal_strength,e.learning_guidance,e.learning_applied_at,
  ca.name campaign_name,co.company_name company_name,co.website_url company_website_url,o.buying_reason,o.operational_pain,o.recommended_action,o.opportunity_score,o.route_quality,o.route_confidence,o.recommended_entry_strategy,
  d.id draft_id,d.subject,d.opening,d.personalisation,d.buying_angle,d.primary_pain,d.value_proposition,d.supporting_evidence_json,d.call_to_action,d.tone,d.reasoning,d.limitations_json,d.output_json draft_output_json,d.channel_content_json,d.execution_instruction,d.prompt_version,d.schema_version,d.model,d.completed_at draft_completed_at,d.output_json->'routeAlignment' route_alignment_json,
  r.id ai_review_id,r.personalisation_score,r.relevance_score,r.professionalism_score,r.factual_accuracy_score,r.evidence_use_score,r.likelihood_of_response_score,r.engagement_score ai_engagement_score,r.confidence ai_confidence,r.review_notes,r.strengths_json,r.weaknesses_json,r.recommended_changes_json,r.unsupported_claims_json,r.outcome ai_review_outcome,r.completed_at ai_review_completed_at,
  a.output_json->>'commercialObjective' commercial_objective,a.output_json->>'buyingAngle' commercial_buying_angle,a.output_json->>'primaryPain' commercial_primary_pain,a.output_json->>'valueTheme' value_theme,coalesce(a.output_json->'buyerPriorities','[]'::jsonb) buyer_priorities_json,coalesce(a.output_json->'likelyObjections','[]'::jsonb) likely_objections_json,a.output_json->>'recommendedTone' recommended_tone,a.output_json->>'ctaStrategy' cta_strategy,a.output_json->>'reasoning' commercial_reasoning,coalesce(a.output_json->'limitations','[]'::jsonb) commercial_limitations_json,a.output_json->'routeStrategy' route_strategy_json,
  latest.outcome latest_outcome,latest.note latest_outcome_note,latest.occurred_at latest_outcome_at
from public.opportunity_engagements e
join public.campaigns ca on ca.id=e.campaign_id join public.companies co on co.id=e.company_id join public.opportunities o on o.id=e.opportunity_id
left join public.engagement_drafts d on d.engagement_id=e.id and d.status='COMPLETE'
left join public.engagement_draft_reviews r on r.draft_id=d.id and r.status='COMPLETE'
left join public.engagement_commercial_analyses a on a.id=d.commercial_analysis_id
left join lateral (select x.outcome,x.note,x.occurred_at from public.engagement_outcomes x where x.engagement_id=e.id order by x.occurred_at desc limit 1) latest on true;
grant select on public.engagement_review_overview to authenticated;
