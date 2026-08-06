-- Genesis G4.6.1: Channel-aware engagement foundation and engagement observability.

alter table public.opportunity_engagements
  add column if not exists primary_channel text,
  add column if not exists secondary_channel text,
  add column if not exists fallback_channel text,
  add column if not exists entry_strategy text,
  add column if not exists recommendation_reason text,
  add column if not exists strategy_confidence integer,
  add column if not exists pipeline_state text not null default 'WAITING',
  add column if not exists current_stage text not null default 'ENGAGEMENT_STRATEGY',
  add column if not exists stage_reason text,
  add column if not exists stage_attempts integer not null default 0,
  add column if not exists stage_last_attempt_at timestamptz,
  add column if not exists stage_next_retry_at timestamptz,
  add column if not exists stage_failure_reason text;

alter table public.opportunity_engagements drop constraint if exists opportunity_engagements_primary_channel_check;
alter table public.opportunity_engagements add constraint opportunity_engagements_primary_channel_check
  check (primary_channel is null or primary_channel in ('EMAIL','LINKEDIN','WEBSITE_FORM','PHONE','REFERRAL','PROCUREMENT','EXECUTIVE_ASSISTANT','EXISTING_CUSTOMER','PARTNER','INTERNAL_CHAMPION','NONE'));
alter table public.opportunity_engagements drop constraint if exists opportunity_engagements_secondary_channel_check;
alter table public.opportunity_engagements add constraint opportunity_engagements_secondary_channel_check
  check (secondary_channel is null or secondary_channel in ('EMAIL','LINKEDIN','WEBSITE_FORM','PHONE','REFERRAL','PROCUREMENT','EXECUTIVE_ASSISTANT','EXISTING_CUSTOMER','PARTNER','INTERNAL_CHAMPION','NONE'));
alter table public.opportunity_engagements drop constraint if exists opportunity_engagements_fallback_channel_check;
alter table public.opportunity_engagements add constraint opportunity_engagements_fallback_channel_check
  check (fallback_channel is null or fallback_channel in ('EMAIL','LINKEDIN','WEBSITE_FORM','PHONE','REFERRAL','PROCUREMENT','EXECUTIVE_ASSISTANT','EXISTING_CUSTOMER','PARTNER','INTERNAL_CHAMPION','NONE'));
alter table public.opportunity_engagements drop constraint if exists opportunity_engagements_strategy_confidence_check;
alter table public.opportunity_engagements add constraint opportunity_engagements_strategy_confidence_check check (strategy_confidence is null or strategy_confidence between 0 and 100);
alter table public.opportunity_engagements drop constraint if exists opportunity_engagements_pipeline_state_check;
alter table public.opportunity_engagements add constraint opportunity_engagements_pipeline_state_check
  check (pipeline_state in ('WAITING','READY','RUNNING','COMPLETE','FAILED','RETRYING','NEEDS_ATTENTION'));

create table if not exists public.engagement_pipeline_events (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  engagement_id uuid not null references public.opportunity_engagements(id) on delete cascade,
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  scheduler_run_id uuid references public.pipeline_scheduler_runs(id) on delete set null,
  stage text not null,
  state text not null check (state in ('WAITING','READY','RUNNING','COMPLETE','FAILED','RETRYING','NEEDS_ATTENTION')),
  reason text,
  attempt_count integer not null default 0,
  worker text,
  metadata_json jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);
create index if not exists engagement_pipeline_events_lookup_idx on public.engagement_pipeline_events(organisation_id,engagement_id,occurred_at desc);
alter table public.engagement_pipeline_events enable row level security;
drop policy if exists engagement_pipeline_events_member_read on public.engagement_pipeline_events;
create policy engagement_pipeline_events_member_read on public.engagement_pipeline_events for select to authenticated using (public.is_active_org_member(organisation_id));
grant select on public.engagement_pipeline_events to authenticated;
grant select,insert,update,delete on public.engagement_pipeline_events to service_role;

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
      when nullif(trim(coalesce(c.website_url,'')),'') is not null then 'WEBSITE_FORM'
      else 'NONE' end,
    secondary_channel = case
      when nullif(trim(coalesce(e.recipient_email,'')),'') is not null and nullif(trim(coalesce(e.linkedin_profile_url,'')),'') is not null then 'LINKEDIN'
      when nullif(trim(coalesce(e.recipient_email,'')),'') is not null and nullif(trim(coalesce(c.website_url,'')),'') is not null then 'WEBSITE_FORM'
      when nullif(trim(coalesce(e.linkedin_profile_url,'')),'') is not null and nullif(trim(coalesce(c.website_url,'')),'') is not null then 'WEBSITE_FORM'
      else null end,
    fallback_channel = case when nullif(trim(coalesce(c.website_url,'')),'') is not null then 'WEBSITE_FORM' else 'NONE' end,
    entry_strategy = case
      when nullif(trim(coalesce(e.recipient_email,'')),'') is not null then 'Use the verified email route with a concise, evidence-led opening tailored to the recommended buyer.'
      when nullif(trim(coalesce(e.linkedin_profile_url,'')),'') is not null then 'Approach the recommended buyer on LinkedIn with a short, conversational message designed to earn a reply.'
      when nullif(trim(coalesce(c.website_url,'')),'') is not null then 'Use the organisation website contact route and ask for the message to be directed to the recommended commercial owner.'
      else 'Continue route research before attempting engagement.' end,
    recommendation_reason = case
      when nullif(trim(coalesce(e.recipient_email,'')),'') is not null then 'A direct email route is available and offers the clearest controlled path into the organisation.'
      when nullif(trim(coalesce(e.linkedin_profile_url,'')),'') is not null then 'A public LinkedIn route is available when no supported direct email can be used.'
      when nullif(trim(coalesce(c.website_url,'')),'') is not null then 'The company website is the strongest currently supported route.'
      else 'No sufficiently supported execution route is available yet.' end,
    strategy_confidence = greatest(0,least(100,coalesce(o.route_confidence,0))),
    pipeline_state = case when e.status='NEEDS_ROUTE' and nullif(trim(coalesce(c.website_url,'')),'') is null then 'NEEDS_ATTENTION' when e.status in ('DRAFT_REVIEW','APPROVED_TO_SEND','QUEUED_FOR_SEND','SENT') then 'COMPLETE' else 'READY' end,
    current_stage = case when e.status='NEEDS_ROUTE' and nullif(trim(coalesce(c.website_url,'')),'') is null then 'ROUTE_RESEARCH' when e.status='READY_FOR_DRAFT' then 'COMMERCIAL_REASONING' when e.status='DRAFT_REVIEW' then 'HUMAN_REVIEW' when e.status in ('APPROVED_TO_SEND','QUEUED_FOR_SEND','SENT') then 'EXECUTION' else e.current_stage end,
    stage_reason = case when e.status='NEEDS_ROUTE' and nullif(trim(coalesce(c.website_url,'')),'') is null then 'No supported email, LinkedIn or website route is available.' else 'Engagement strategy synchronised from the best supported access route.' end,
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

create or replace function public.record_engagement_pipeline_stage(p_engagement_id uuid,p_scheduler_run_id uuid,p_stage text,p_state text,p_reason text default null,p_worker text default null,p_metadata jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path=public as $$
declare v public.opportunity_engagements%rowtype;
begin
 select * into v from public.opportunity_engagements where id=p_engagement_id for update;
 if v.id is null then return; end if;
 update public.opportunity_engagements set pipeline_state=p_state,current_stage=p_stage,stage_reason=p_reason,
   stage_attempts=case when p_state='RUNNING' then stage_attempts+1 else stage_attempts end,
   stage_last_attempt_at=case when p_state in ('RUNNING','FAILED','RETRYING','NEEDS_ATTENTION') then now() else stage_last_attempt_at end,
   stage_failure_reason=case when p_state in ('FAILED','NEEDS_ATTENTION') then p_reason when p_state='COMPLETE' then null else stage_failure_reason end,
   updated_at=now() where id=p_engagement_id;
 insert into public.engagement_pipeline_events(organisation_id,campaign_id,engagement_id,opportunity_id,scheduler_run_id,stage,state,reason,attempt_count,worker,metadata_json)
 values(v.organisation_id,v.campaign_id,v.id,v.opportunity_id,p_scheduler_run_id,p_stage,p_state,p_reason,v.stage_attempts+case when p_state='RUNNING' then 1 else 0 end,p_worker,coalesce(p_metadata,'{}'::jsonb));
end $$;
revoke all on function public.record_engagement_pipeline_stage(uuid,uuid,text,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.record_engagement_pipeline_stage(uuid,uuid,text,text,text,text,jsonb) to service_role;

create or replace function public.reconcile_engagement_pipeline_failures(p_scheduler_run_id uuid)
returns integer language plpgsql security definer set search_path=public as $$
declare v_count integer:=0;
begin
 update public.opportunity_engagements e set
   pipeline_state='NEEDS_ATTENTION',
   stage_failure_reason=coalesce(
     (select a.last_error from public.engagement_commercial_analyses a where a.engagement_id=e.id and a.status='FAILED_FINAL' order by a.updated_at desc limit 1),
     (select d.last_error from public.engagement_drafts d where d.engagement_id=e.id and d.status='FAILED_FINAL' order by d.updated_at desc limit 1),
     (select r.last_error from public.engagement_draft_reviews r where r.engagement_id=e.id and r.status='FAILED_FINAL' order by r.updated_at desc limit 1),
     'Engagement processing exhausted its retry limit.'),
   stage_reason='Automatic retries exhausted. Review the failure before resuming.',stage_next_retry_at=null,updated_at=now()
 where e.pipeline_state<>'NEEDS_ATTENTION' and (
   exists(select 1 from public.engagement_commercial_analyses a where a.engagement_id=e.id and a.status='FAILED_FINAL') or
   exists(select 1 from public.engagement_drafts d where d.engagement_id=e.id and d.status='FAILED_FINAL') or
   exists(select 1 from public.engagement_draft_reviews r where r.engagement_id=e.id and r.status='FAILED_FINAL')
 );
 get diagnostics v_count=row_count;
 return v_count;
end $$;
revoke all on function public.reconcile_engagement_pipeline_failures(uuid) from public,anon,authenticated;
grant execute on function public.reconcile_engagement_pipeline_failures(uuid) to service_role;

create or replace view public.engagement_pipeline_timeline with (security_invoker=true) as
select e.id engagement_id,e.organisation_id,e.campaign_id,e.opportunity_id,e.pipeline_state,e.current_stage,e.stage_reason,e.stage_attempts,e.stage_last_attempt_at,e.stage_next_retry_at,e.stage_failure_reason,
 coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'stage',x.stage,'state',x.state,'reason',x.reason,'attemptCount',x.attempt_count,'worker',x.worker,'metadata',x.metadata_json,'occurredAt',x.occurred_at) order by x.occurred_at desc) from public.engagement_pipeline_events x where x.engagement_id=e.id),'[]'::jsonb) events
from public.opportunity_engagements e;
grant select on public.engagement_pipeline_timeline to authenticated;

-- Append strategy fields to the review surface. Drop/recreate avoids positional view replacement errors.
drop view if exists public.engagement_review_overview;
create view public.engagement_review_overview with (security_invoker=true) as
select
  e.id,e.organisation_id,e.campaign_id,e.opportunity_id,e.company_id,e.contact_id,e.status,e.outreach_policy,e.reply_policy,
  e.channel_type,e.recipient_name,e.recipient_role,e.recipient_email,e.linkedin_profile_url,e.source_opportunity_score,e.source_opportunity_rank,
  e.engagement_score,e.confidence,e.prepared_at,e.created_at,e.updated_at,
  e.primary_channel,e.secondary_channel,e.fallback_channel,e.entry_strategy,e.recommendation_reason,e.strategy_confidence,e.pipeline_state,e.current_stage,e.stage_reason,e.stage_attempts,e.stage_last_attempt_at,e.stage_next_retry_at,e.stage_failure_reason,
  ca.name campaign_name,co.company_name company_name,o.buying_reason,o.operational_pain,o.recommended_action,o.opportunity_score,o.route_quality,o.route_confidence,o.recommended_entry_strategy,
  d.id draft_id,d.subject,d.opening,d.personalisation,d.buying_angle,d.primary_pain,d.value_proposition,d.supporting_evidence_json,d.call_to_action,d.tone,d.reasoning,d.limitations_json,d.output_json draft_output_json,d.prompt_version,d.schema_version,d.model,d.completed_at draft_completed_at,d.output_json->'routeAlignment' route_alignment_json,
  r.id ai_review_id,r.personalisation_score,r.relevance_score,r.professionalism_score,r.factual_accuracy_score,r.evidence_use_score,r.likelihood_of_response_score,r.engagement_score ai_engagement_score,r.confidence ai_confidence,r.review_notes,r.strengths_json,r.weaknesses_json,r.recommended_changes_json,r.unsupported_claims_json,r.outcome ai_review_outcome,r.completed_at ai_review_completed_at,
  a.output_json->>'commercialObjective' commercial_objective,a.output_json->>'buyingAngle' commercial_buying_angle,a.output_json->>'primaryPain' commercial_primary_pain,a.output_json->>'valueTheme' value_theme,coalesce(a.output_json->'buyerPriorities','[]'::jsonb) buyer_priorities_json,coalesce(a.output_json->'likelyObjections','[]'::jsonb) likely_objections_json,a.output_json->>'recommendedTone' recommended_tone,a.output_json->>'ctaStrategy' cta_strategy,a.output_json->>'reasoning' commercial_reasoning,coalesce(a.output_json->'limitations','[]'::jsonb) commercial_limitations_json,a.output_json->'routeStrategy' route_strategy_json
from public.opportunity_engagements e
join public.campaigns ca on ca.id=e.campaign_id join public.companies co on co.id=e.company_id join public.opportunities o on o.id=e.opportunity_id
left join public.engagement_drafts d on d.engagement_id=e.id and d.status='COMPLETE'
left join public.engagement_draft_reviews r on r.draft_id=d.id and r.status='COMPLETE'
left join public.engagement_commercial_analyses a on a.id=d.commercial_analysis_id;
grant select on public.engagement_review_overview to authenticated;
