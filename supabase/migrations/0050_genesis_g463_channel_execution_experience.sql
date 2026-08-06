-- SalesPilot Genesis G4.6.3: channel-native execution experience.

alter table public.opportunity_engagements
  add column if not exists execution_state text not null default 'PREPARED',
  add column if not exists execution_last_action text,
  add column if not exists execution_last_action_at timestamptz,
  add column if not exists execution_completed_at timestamptz,
  add column if not exists execution_completed_by uuid references auth.users(id) on delete set null;

alter table public.opportunity_engagements drop constraint if exists opportunity_engagements_execution_state_check;
alter table public.opportunity_engagements add constraint opportunity_engagements_execution_state_check
  check (execution_state in ('PREPARED','READY','IN_PROGRESS','SCHEDULED','COMPLETED','CANCELLED'));

create table if not exists public.engagement_execution_history (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  engagement_id uuid not null references public.opportunity_engagements(id) on delete cascade,
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  channel text not null,
  action text not null check (action in ('APPROVED','COPIED','OPENED','STARTED','COMPLETED','RESET')),
  previous_state text,
  next_state text not null,
  metadata_json jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);
create index if not exists engagement_execution_history_engagement_idx on public.engagement_execution_history(engagement_id,occurred_at desc);
alter table public.engagement_execution_history enable row level security;
drop policy if exists engagement_execution_history_select on public.engagement_execution_history;
create policy engagement_execution_history_select on public.engagement_execution_history for select to authenticated
using (public.is_active_org_member(organisation_id));

create or replace function public.record_engagement_execution(
  p_organisation_id uuid,
  p_engagement_id uuid,
  p_user_id uuid,
  p_action text,
  p_metadata jsonb default '{}'::jsonb
) returns public.opportunity_engagements
language plpgsql security definer set search_path=public as $$
declare v public.opportunity_engagements%rowtype; v_previous text; v_next text;
begin
  if not exists(select 1 from public.organisation_memberships where organisation_id=p_organisation_id and user_id=p_user_id and status='ACTIVE' and role in ('OWNER','ADMIN','MEMBER')) then
    raise exception 'execution forbidden';
  end if;
  if p_action not in ('COPIED','OPENED','STARTED','COMPLETED','RESET') then raise exception 'invalid execution action'; end if;
  select * into v from public.opportunity_engagements where id=p_engagement_id and organisation_id=p_organisation_id for update;
  if v.id is null then raise exception 'engagement missing'; end if;
  if v.status not in ('APPROVED_TO_SEND','QUEUED_FOR_SEND','SENT') then raise exception 'engagement must be approved before execution'; end if;
  if coalesce(v.primary_channel,v.channel_type)='EMAIL' and p_action in ('COPIED','OPENED','STARTED','COMPLETED') then
    raise exception 'email execution is controlled by the sending queue';
  end if;
  v_previous:=v.execution_state;
  v_next:=case p_action when 'COMPLETED' then 'COMPLETED' when 'RESET' then 'READY' else 'IN_PROGRESS' end;
  update public.opportunity_engagements set
    execution_state=v_next,
    execution_last_action=p_action,
    execution_last_action_at=now(),
    execution_completed_at=case when p_action='COMPLETED' then now() when p_action='RESET' then null else execution_completed_at end,
    execution_completed_by=case when p_action='COMPLETED' then p_user_id when p_action='RESET' then null else execution_completed_by end,
    updated_at=now()
  where id=v.id returning * into v;
  insert into public.engagement_execution_history(organisation_id,campaign_id,engagement_id,opportunity_id,actor_user_id,channel,action,previous_state,next_state,metadata_json)
  values(v.organisation_id,v.campaign_id,v.id,v.opportunity_id,p_user_id,coalesce(v.primary_channel,v.channel_type),p_action,v_previous,v_next,coalesce(p_metadata,'{}'::jsonb));
  if p_action='COMPLETED' then
    insert into public.campaign_timeline(organisation_id,campaign_id,event_type,title,description,visibility,metadata_json)
    values(v.organisation_id,v.campaign_id,'ENGAGEMENT_COMPLETED','Engagement completed','The recommended engagement was completed through the selected channel.','CUSTOMER',jsonb_build_object('engagementId',v.id,'opportunityId',v.opportunity_id,'channel',coalesce(v.primary_channel,v.channel_type)));
  end if;
  return v;
end $$;
revoke all on function public.record_engagement_execution(uuid,uuid,uuid,text,jsonb) from public,anon;
grant execute on function public.record_engagement_execution(uuid,uuid,uuid,text,jsonb) to authenticated,service_role;

-- Approved non-email engagements become ready for assisted execution.
create or replace function public.sync_engagement_execution_state() returns trigger
language plpgsql set search_path=public as $$
begin
  if new.status='APPROVED_TO_SEND' and old.status is distinct from new.status then
    new.execution_state:=case when coalesce(new.primary_channel,new.channel_type)='EMAIL' then 'READY' else 'READY' end;
    new.execution_last_action:='APPROVED';
    new.execution_last_action_at:=now();
  elsif new.status='QUEUED_FOR_SEND' then
    new.execution_state:='SCHEDULED';
  elsif new.status='SENT' then
    new.execution_state:='COMPLETED';
    new.execution_completed_at:=coalesce(new.execution_completed_at,now());
  elsif new.status='CANCELLED' then
    new.execution_state:='CANCELLED';
  end if;
  return new;
end $$;
drop trigger if exists sync_engagement_execution_state_trigger on public.opportunity_engagements;
create trigger sync_engagement_execution_state_trigger before update of status on public.opportunity_engagements
for each row execute function public.sync_engagement_execution_state();

-- Refresh review surface with execution fields and action targets.
drop view if exists public.engagement_review_overview;
create view public.engagement_review_overview with (security_invoker=true) as
select
  e.id,e.organisation_id,e.campaign_id,e.opportunity_id,e.company_id,e.contact_id,e.status,e.outreach_policy,e.reply_policy,
  e.channel_type,e.recipient_name,e.recipient_role,e.recipient_email,e.linkedin_profile_url,e.route_source_url,e.source_opportunity_score,e.source_opportunity_rank,
  e.engagement_score,e.confidence,e.prepared_at,e.created_at,e.updated_at,
  e.primary_channel,e.secondary_channel,e.fallback_channel,e.entry_strategy,e.recommendation_reason,e.strategy_confidence,e.pipeline_state,e.current_stage,e.stage_reason,e.stage_attempts,e.stage_last_attempt_at,e.stage_next_retry_at,e.stage_failure_reason,
  e.execution_state,e.execution_last_action,e.execution_last_action_at,e.execution_completed_at,e.execution_completed_by,
  ca.name campaign_name,co.company_name company_name,co.website_url company_website_url,o.buying_reason,o.operational_pain,o.recommended_action,o.opportunity_score,o.route_quality,o.route_confidence,o.recommended_entry_strategy,
  d.id draft_id,d.subject,d.opening,d.personalisation,d.buying_angle,d.primary_pain,d.value_proposition,d.supporting_evidence_json,d.call_to_action,d.tone,d.reasoning,d.limitations_json,d.output_json draft_output_json,d.channel_content_json,d.execution_instruction,d.prompt_version,d.schema_version,d.model,d.completed_at draft_completed_at,d.output_json->'routeAlignment' route_alignment_json,
  r.id ai_review_id,r.personalisation_score,r.relevance_score,r.professionalism_score,r.factual_accuracy_score,r.evidence_use_score,r.likelihood_of_response_score,r.engagement_score ai_engagement_score,r.confidence ai_confidence,r.review_notes,r.strengths_json,r.weaknesses_json,r.recommended_changes_json,r.unsupported_claims_json,r.outcome ai_review_outcome,r.completed_at ai_review_completed_at,
  a.output_json->>'commercialObjective' commercial_objective,a.output_json->>'buyingAngle' commercial_buying_angle,a.output_json->>'primaryPain' commercial_primary_pain,a.output_json->>'valueTheme' value_theme,coalesce(a.output_json->'buyerPriorities','[]'::jsonb) buyer_priorities_json,coalesce(a.output_json->'likelyObjections','[]'::jsonb) likely_objections_json,a.output_json->>'recommendedTone' recommended_tone,a.output_json->>'ctaStrategy' cta_strategy,a.output_json->>'reasoning' commercial_reasoning,coalesce(a.output_json->'limitations','[]'::jsonb) commercial_limitations_json,a.output_json->'routeStrategy' route_strategy_json
from public.opportunity_engagements e
join public.campaigns ca on ca.id=e.campaign_id join public.companies co on co.id=e.company_id join public.opportunities o on o.id=e.opportunity_id
left join public.engagement_drafts d on d.engagement_id=e.id and d.status='COMPLETE'
left join public.engagement_draft_reviews r on r.draft_id=d.id and r.status='COMPLETE'
left join public.engagement_commercial_analyses a on a.id=d.commercial_analysis_id;
grant select on public.engagement_review_overview to authenticated;
