-- MarketRoute Genesis G4 Phase 6: human engagement review.
-- Adds auditable approve, edit, reject, regenerate and bulk-review actions. No sending is introduced.

alter table public.opportunity_engagement_history drop constraint if exists opportunity_engagement_history_event_type_check;
alter table public.opportunity_engagement_history add constraint opportunity_engagement_history_event_type_check check (event_type in (
  'PREPARED','ROUTE_UPDATED','POLICY_UPDATED','STATUS_CHANGED','UPDATED','PAUSED','CANCELLED',
  'COMMERCIAL_ANALYSIS_COMPLETED','COMMERCIAL_ANALYSIS_FAILED',
  'DRAFT_GENERATION_STARTED','DRAFT_CREATED','DRAFT_GENERATION_FAILED',
  'SELF_REVIEW_STARTED','SELF_REVIEW_COMPLETED','SELF_REVIEW_FAILED',
  'DRAFT_APPROVED','DRAFT_EDITED','DRAFT_REJECTED','DRAFT_REGENERATION_REQUESTED',
  'APPROVED_TO_SEND','QUEUED','SENT'
));

create table if not exists public.engagement_human_reviews (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  engagement_id uuid not null references public.opportunity_engagements(id) on delete cascade,
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  draft_id uuid not null references public.engagement_drafts(id) on delete cascade,
  reviewer_user_id uuid not null references auth.users(id) on delete restrict,
  action text not null check (action in ('APPROVED','EDITED','REJECTED','REGENERATE_REQUESTED')),
  note text,
  previous_subject text,
  previous_body_json jsonb,
  resulting_subject text,
  resulting_body_json jsonb,
  edit_distance integer,
  created_at timestamptz not null default now()
);
create index if not exists engagement_human_reviews_engagement_idx on public.engagement_human_reviews(engagement_id,created_at desc);
create index if not exists engagement_human_reviews_org_idx on public.engagement_human_reviews(organisation_id,campaign_id,created_at desc);
alter table public.engagement_human_reviews enable row level security;
drop policy if exists engagement_human_reviews_member_read on public.engagement_human_reviews;
create policy engagement_human_reviews_member_read on public.engagement_human_reviews for select to authenticated
using (public.is_active_org_member(organisation_id));

create or replace view public.engagement_review_overview with (security_invoker=true) as
select
  e.id,e.organisation_id,e.campaign_id,e.opportunity_id,e.company_id,e.contact_id,e.status,e.outreach_policy,e.reply_policy,
  e.channel_type,e.recipient_name,e.recipient_role,e.recipient_email,e.linkedin_profile_url,e.source_opportunity_score,e.source_opportunity_rank,
  e.engagement_score,e.confidence,e.prepared_at,e.created_at,e.updated_at,
  ca.name campaign_name,co.company_name company_name,o.buying_reason,o.operational_pain,o.recommended_action,o.opportunity_score,
  d.id draft_id,d.subject,d.opening,d.personalisation,d.buying_angle,d.primary_pain,d.value_proposition,d.supporting_evidence_json,
  d.call_to_action,d.tone,d.reasoning,d.limitations_json,d.output_json draft_output_json,d.prompt_version,d.schema_version,d.model,d.completed_at draft_completed_at,
  r.id ai_review_id,r.personalisation_score,r.relevance_score,r.professionalism_score,r.factual_accuracy_score,r.evidence_use_score,
  r.likelihood_of_response_score,r.engagement_score ai_engagement_score,r.confidence ai_confidence,r.review_notes,r.strengths_json,
  r.weaknesses_json,r.recommended_changes_json,r.unsupported_claims_json,r.outcome ai_review_outcome,r.completed_at ai_review_completed_at,
  a.output_json->>'commercialObjective' commercial_objective,a.output_json->>'buyingAngle' commercial_buying_angle,a.output_json->>'primaryPain' commercial_primary_pain,a.output_json->>'valueTheme' value_theme,
  coalesce(a.output_json->'buyerPriorities','[]'::jsonb) buyer_priorities_json,coalesce(a.output_json->'likelyObjections','[]'::jsonb) likely_objections_json,
  a.output_json->>'recommendedTone' recommended_tone,a.output_json->>'ctaStrategy' cta_strategy,a.output_json->>'reasoning' commercial_reasoning,coalesce(a.output_json->'limitations','[]'::jsonb) commercial_limitations_json
from public.opportunity_engagements e
join public.campaigns ca on ca.id=e.campaign_id
join public.companies co on co.id=e.company_id
join public.opportunities o on o.id=e.opportunity_id
left join public.engagement_drafts d on d.engagement_id=e.id and d.status='COMPLETE'
left join public.engagement_draft_reviews r on r.draft_id=d.id and r.status='COMPLETE'
left join public.engagement_commercial_analyses a on a.id=d.commercial_analysis_id;

create or replace function public.review_engagement_draft(
  p_organisation_id uuid,p_engagement_id uuid,p_user_id uuid,p_action text,p_note text default null,
  p_subject text default null,p_opening text default null,p_personalisation text default null,p_value_proposition text default null,
  p_call_to_action text default null
) returns public.opportunity_engagements
language plpgsql security definer set search_path=public as $$
declare v_eng public.opportunity_engagements%rowtype; v_draft public.engagement_drafts%rowtype; v_next text; v_event text; v_body jsonb; v_previous jsonb; v_previous_subject text; v_previous_status text;
begin
  if not public.is_active_org_member(p_organisation_id) then raise exception 'organisation membership required'; end if;
  if not exists(select 1 from public.organisation_memberships where organisation_id=p_organisation_id and user_id=p_user_id and status='ACTIVE' and role in ('OWNER','ADMIN','MEMBER')) then raise exception 'review forbidden'; end if;
  if p_action not in ('APPROVED','EDITED','REJECTED','REGENERATE_REQUESTED') then raise exception 'invalid review action'; end if;
  select * into v_eng from public.opportunity_engagements where id=p_engagement_id and organisation_id=p_organisation_id for update;
  if v_eng.id is null then raise exception 'engagement missing'; end if;
  select * into v_draft from public.engagement_drafts where engagement_id=v_eng.id and status='COMPLETE' order by completed_at desc limit 1 for update;
  if v_draft.id is null then raise exception 'completed draft missing'; end if;
  if p_action in ('APPROVED','EDITED','REJECTED') and v_eng.status not in ('DRAFT_REVIEW','APPROVED_TO_SEND') then raise exception 'draft is not ready for human review'; end if;

  v_previous_status:=v_eng.status;
  v_previous_subject:=v_draft.subject;
  v_previous:=jsonb_build_object('opening',v_draft.opening,'personalisation',v_draft.personalisation,'valueProposition',v_draft.value_proposition,'callToAction',v_draft.call_to_action);
  if p_action='EDITED' then
    if nullif(trim(coalesce(p_subject,'')),'') is null or nullif(trim(coalesce(p_opening,'')),'') is null or nullif(trim(coalesce(p_value_proposition,'')),'') is null or nullif(trim(coalesce(p_call_to_action,'')),'') is null then raise exception 'edited draft fields required'; end if;
    update public.engagement_drafts set subject=trim(p_subject),opening=trim(p_opening),personalisation=nullif(trim(coalesce(p_personalisation,'')),''),
      value_proposition=trim(p_value_proposition),call_to_action=trim(p_call_to_action),updated_at=now(),
      output_json=coalesce(output_json,'{}'::jsonb)||jsonb_build_object('subject',trim(p_subject),'opening',trim(p_opening),'personalisation',nullif(trim(coalesce(p_personalisation,'')),''),'valueProposition',trim(p_value_proposition),'callToAction',trim(p_call_to_action),'humanEdited',true)
    where id=v_draft.id returning * into v_draft;
  end if;

  v_body:=jsonb_build_object('opening',v_draft.opening,'personalisation',v_draft.personalisation,'valueProposition',v_draft.value_proposition,'callToAction',v_draft.call_to_action);
  v_next:=case when p_action in ('APPROVED','EDITED') then 'APPROVED_TO_SEND' when p_action='REJECTED' then 'CANCELLED' else 'READY_FOR_DRAFT' end;
  v_event:=case p_action when 'APPROVED' then 'DRAFT_APPROVED' when 'EDITED' then 'DRAFT_EDITED' when 'REJECTED' then 'DRAFT_REJECTED' else 'DRAFT_REGENERATION_REQUESTED' end;

  if p_action='REGENERATE_REQUESTED' then
    delete from public.engagement_draft_reviews where draft_id=v_draft.id;
    update public.engagement_drafts set status='PENDING',attempt_count=0,scheduler_run_id=null,subject=null,opening=null,personalisation=null,buying_angle=null,primary_pain=null,value_proposition=null,supporting_evidence_json='[]'::jsonb,call_to_action=null,tone=null,reasoning=null,limitations_json='[]'::jsonb,confidence=null,prompt_version=null,schema_version=null,model=null,input_tokens=null,output_tokens=null,duration_ms=null,response_id=null,output_json=null,last_error=null,next_attempt_at=now(),claimed_at=null,lease_expires_at=null,completed_at=null,updated_at=now() where id=v_draft.id;
  end if;
  update public.opportunity_engagements set status=v_next,updated_at=now() where id=v_eng.id returning * into v_eng;

  insert into public.engagement_human_reviews(organisation_id,campaign_id,engagement_id,opportunity_id,draft_id,reviewer_user_id,action,note,previous_subject,previous_body_json,resulting_subject,resulting_body_json,edit_distance)
  values(v_eng.organisation_id,v_eng.campaign_id,v_eng.id,v_eng.opportunity_id,v_draft.id,p_user_id,p_action,nullif(trim(coalesce(p_note,'')),''),v_previous_subject,v_previous,v_draft.subject,v_body,
    case when p_action='EDITED' then abs(length(coalesce(v_previous::text,''))-length(coalesce(v_body::text,''))) else 0 end);
  insert into public.engagement_review_history(organisation_id,campaign_id,engagement_id,opportunity_id,review_type,outcome,reviewed_by,review_json,created_at)
  values(v_eng.organisation_id,v_eng.campaign_id,v_eng.id,v_eng.opportunity_id,'HUMAN_REVIEW',p_action,p_user_id,jsonb_build_object('draftId',v_draft.id,'note',p_note,'resultingStatus',v_next),now());
  insert into public.opportunity_engagement_history(organisation_id,campaign_id,engagement_id,opportunity_id,event_type,previous_status,next_status,metadata_json)
  values(v_eng.organisation_id,v_eng.campaign_id,v_eng.id,v_eng.opportunity_id,v_event,v_previous_status,v_next,jsonb_build_object('draftId',v_draft.id,'reviewerUserId',p_user_id,'note',p_note));
  insert into public.campaign_timeline(organisation_id,campaign_id,event_type,title,description,visibility,metadata_json)
  values(v_eng.organisation_id,v_eng.campaign_id,v_event,
    case p_action when 'APPROVED' then 'Outreach approved' when 'EDITED' then 'Outreach edited and approved' when 'REJECTED' then 'Outreach rejected' else 'New outreach requested' end,
    case p_action when 'APPROVED' then 'The personalised outreach is approved and ready for the sending queue.' when 'EDITED' then 'The outreach was refined by a reviewer and approved.' when 'REJECTED' then 'The outreach was rejected and will not progress.' else 'A new version of the outreach has been requested.' end,
    'CUSTOMER',jsonb_build_object('engagementId',v_eng.id,'opportunityId',v_eng.opportunity_id,'draftId',v_draft.id));
  return v_eng;
end $$;

create or replace function public.bulk_review_engagement_drafts(p_organisation_id uuid,p_engagement_ids uuid[],p_user_id uuid,p_action text,p_note text default null)
returns integer language plpgsql security definer set search_path=public as $$
declare v_id uuid; v_count integer:=0;
begin
  if p_action not in ('APPROVED','REJECTED') then raise exception 'bulk action not supported'; end if;
  foreach v_id in array p_engagement_ids loop
    perform public.review_engagement_draft(p_organisation_id,v_id,p_user_id,p_action,p_note,null,null,null,null,null);
    v_count:=v_count+1;
  end loop;
  return v_count;
end $$;

revoke all on function public.review_engagement_draft(uuid,uuid,uuid,text,text,text,text,text,text,text) from public,anon;
revoke all on function public.bulk_review_engagement_drafts(uuid,uuid[],uuid,text,text) from public,anon;
grant execute on function public.review_engagement_draft(uuid,uuid,uuid,text,text,text,text,text,text,text) to authenticated,service_role;
grant execute on function public.bulk_review_engagement_drafts(uuid,uuid[],uuid,text,text) to authenticated,service_role;
