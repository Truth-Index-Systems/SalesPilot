-- SalesPilot Genesis G4 Phase 5: independent AI self-review and quality gating.
-- No human review actions, sending, scheduling or automatic regeneration are introduced.

alter table public.opportunity_engagement_history drop constraint if exists opportunity_engagement_history_event_type_check;
alter table public.opportunity_engagement_history add constraint opportunity_engagement_history_event_type_check check (event_type in (
  'PREPARED','ROUTE_UPDATED','POLICY_UPDATED','STATUS_CHANGED','UPDATED','PAUSED','CANCELLED',
  'COMMERCIAL_ANALYSIS_COMPLETED','COMMERCIAL_ANALYSIS_FAILED',
  'DRAFT_GENERATION_STARTED','DRAFT_CREATED','DRAFT_GENERATION_FAILED',
  'SELF_REVIEW_STARTED','SELF_REVIEW_COMPLETED','SELF_REVIEW_FAILED',
  'APPROVED_TO_SEND','QUEUED','SENT'
));

create table if not exists public.engagement_draft_reviews (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  engagement_id uuid not null references public.opportunity_engagements(id) on delete cascade,
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  draft_id uuid not null references public.engagement_drafts(id) on delete cascade,
  status text not null default 'PENDING' check (status in ('PENDING','RUNNING','COMPLETE','FAILED_RETRYABLE','FAILED_FINAL','CANCELLED')),
  outcome text check (outcome in ('APPROVED','REGENERATE_REQUESTED')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  scheduler_run_id uuid references public.pipeline_scheduler_runs(id) on delete set null,
  personalisation_score integer check (personalisation_score between 0 and 100),
  relevance_score integer check (relevance_score between 0 and 100),
  professionalism_score integer check (professionalism_score between 0 and 100),
  factual_accuracy_score integer check (factual_accuracy_score between 0 and 100),
  evidence_use_score integer check (evidence_use_score between 0 and 100),
  likelihood_of_response_score integer check (likelihood_of_response_score between 0 and 100),
  engagement_score integer check (engagement_score between 0 and 100),
  confidence integer check (confidence between 0 and 100),
  approved_by_ai boolean,
  review_notes text,
  strengths_json jsonb not null default '[]'::jsonb,
  weaknesses_json jsonb not null default '[]'::jsonb,
  recommended_changes_json jsonb not null default '[]'::jsonb,
  unsupported_claims_json jsonb not null default '[]'::jsonb,
  prompt_version text,
  schema_version text,
  model text,
  input_tokens integer,
  output_tokens integer,
  duration_ms integer,
  response_id text,
  output_json jsonb,
  last_error text,
  next_attempt_at timestamptz,
  claimed_at timestamptz,
  lease_expires_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(draft_id)
);

create index if not exists engagement_draft_reviews_claim_idx
  on public.engagement_draft_reviews(status,next_attempt_at,created_at)
  where status in ('PENDING','FAILED_RETRYABLE','RUNNING');
create index if not exists engagement_draft_reviews_org_idx
  on public.engagement_draft_reviews(organisation_id,campaign_id,updated_at desc);
alter table public.engagement_draft_reviews enable row level security;
drop policy if exists engagement_draft_reviews_member_read on public.engagement_draft_reviews;
create policy engagement_draft_reviews_member_read on public.engagement_draft_reviews for select to authenticated
using (public.is_active_org_member(organisation_id));

insert into public.engagement_prompt_versions(version,purpose,system_prompt,template_json,schema_version,model,active)
values(
  'engagement-self-review/v1','AI_SELF_REVIEW',
  'Independent quality review of first outreach. Factual accuracy and evidence use are hard gates before human review.',
  jsonb_build_object('scores',jsonb_build_array('personalisation','relevance','professionalism','factualAccuracy','evidenceUse','likelihoodOfResponse','combinedScore')),
  'engagement-self-review/v1',null,true
)
on conflict(version) do update set system_prompt=excluded.system_prompt,template_json=excluded.template_json,schema_version=excluded.schema_version;

create or replace function public.claim_engagement_self_review(p_scheduler_run_id uuid)
returns table(review_id uuid,draft_id uuid,organisation_id uuid,campaign_id uuid,engagement_id uuid,context_json jsonb)
language plpgsql security definer set search_path=public as $$
declare v_id uuid; v_row public.engagement_draft_reviews%rowtype;
begin
  if not exists(select 1 from public.pipeline_scheduler_runs where id=p_scheduler_run_id) then raise exception 'scheduler run required'; end if;

  insert into public.engagement_draft_reviews(organisation_id,campaign_id,engagement_id,opportunity_id,draft_id)
  select d.organisation_id,d.campaign_id,d.engagement_id,d.opportunity_id,d.id
  from public.engagement_drafts d
  join public.opportunity_engagements e on e.id=d.engagement_id and e.status='DRAFT_READY'
  join public.ai_governance_policies g on g.organisation_id=d.organisation_id and g.autonomy_enabled=true
  where d.status='COMPLETE'
  on conflict(draft_id) do nothing;

  select r.id into v_id
  from public.engagement_draft_reviews r
  join public.engagement_drafts d on d.id=r.draft_id and d.status='COMPLETE'
  join public.opportunity_engagements e on e.id=r.engagement_id and e.status='DRAFT_READY'
  where r.attempt_count<5 and (
    (r.status='PENDING' and coalesce(r.next_attempt_at,now())<=now()) or
    (r.status='FAILED_RETRYABLE' and coalesce(r.next_attempt_at,now())<=now()) or
    (r.status='RUNNING' and r.lease_expires_at<now())
  )
  order by case r.status when 'PENDING' then 0 when 'FAILED_RETRYABLE' then 1 else 2 end,r.created_at
  for update of r skip locked limit 1;
  if v_id is null then return; end if;

  update public.engagement_draft_reviews
  set status='RUNNING',attempt_count=attempt_count+1,scheduler_run_id=p_scheduler_run_id,
      claimed_at=now(),lease_expires_at=now()+interval '5 minutes',last_error=null,updated_at=now()
  where id=v_id returning * into v_row;

  insert into public.opportunity_engagement_history(organisation_id,campaign_id,engagement_id,opportunity_id,event_type,previous_status,next_status,metadata_json)
  values(v_row.organisation_id,v_row.campaign_id,v_row.engagement_id,v_row.opportunity_id,'SELF_REVIEW_STARTED','DRAFT_READY','DRAFT_READY',
    jsonb_build_object('reviewId',v_row.id,'draftId',v_row.draft_id,'schedulerRunId',p_scheduler_run_id,'attempt',v_row.attempt_count));

  return query
  select v_row.id,v_row.draft_id,v_row.organisation_id,v_row.campaign_id,v_row.engagement_id,
    jsonb_build_object(
      'draft',d.output_json,
      'commercialAnalysis',a.output_json,
      'opportunity',jsonb_build_object('id',o.id,'score',o.opportunity_score,'buyingReason',o.buying_reason,'operationalPain',o.operational_pain,'recommendedAction',o.recommended_action,'scoreExplanation',o.score_explanation_json),
      'companyEvidence',coalesce((select jsonb_agg(jsonb_build_object('id',ce.id,'claim',ce.claim,'sourceUrl',ce.source_url,'sourceTitle',ce.source_title,'excerpt',ce.excerpt)) from public.company_evidence ce where ce.company_id=e.company_id),'[]'::jsonb),
      'contactEvidence',coalesce((select jsonb_agg(jsonb_build_object('id',cne.id,'type',cne.evidence_type,'claim',cne.claim,'sourceUrl',cne.source_url,'sourceTitle',cne.source_title,'excerpt',cne.excerpt,'verified',cne.verified,'qualityScore',cne.quality_score)) from public.contact_evidence cne where cne.contact_id=e.contact_id),'[]'::jsonb)
    )
  from public.engagement_draft_reviews r
  join public.engagement_drafts d on d.id=r.draft_id
  join public.engagement_commercial_analyses a on a.id=d.commercial_analysis_id
  join public.opportunity_engagements e on e.id=r.engagement_id
  join public.opportunities o on o.id=r.opportunity_id
  where r.id=v_id;
end $$;

create or replace function public.complete_engagement_self_review(
  p_review_id uuid,p_output_json jsonb,p_prompt_version text,p_schema_version text,p_score integer,p_confidence integer,
  p_approved_by_ai boolean,p_model text,p_input_tokens integer,p_output_tokens integer,p_duration_ms integer,p_response_id text
) returns void language plpgsql security definer set search_path=public as $$
declare v public.engagement_draft_reviews%rowtype; v_pass boolean; v_next_status text; v_event_id uuid;
begin
  select * into v from public.engagement_draft_reviews where id=p_review_id for update;
  if v.id is null then raise exception 'engagement review missing'; end if;
  if v.status='COMPLETE' then return; end if;
  if v.status<>'RUNNING' then raise exception 'engagement review not running'; end if;

  v_pass:=coalesce(p_approved_by_ai,false)
    and p_score>=75
    and coalesce((p_output_json->>'factualAccuracy')::integer,0)>=80
    and coalesce((p_output_json->>'evidenceUse')::integer,0)>=75
    and jsonb_array_length(coalesce(p_output_json->'unsupportedClaims','[]'::jsonb))=0;
  v_next_status:=case when v_pass then 'DRAFT_REVIEW' else 'DRAFT_READY' end;

  update public.engagement_draft_reviews set
    status='COMPLETE',outcome=case when v_pass then 'APPROVED' else 'REGENERATE_REQUESTED' end,
    personalisation_score=(p_output_json->>'personalisation')::integer,
    relevance_score=(p_output_json->>'relevance')::integer,
    professionalism_score=(p_output_json->>'professionalism')::integer,
    factual_accuracy_score=(p_output_json->>'factualAccuracy')::integer,
    evidence_use_score=(p_output_json->>'evidenceUse')::integer,
    likelihood_of_response_score=(p_output_json->>'likelihoodOfResponse')::integer,
    engagement_score=least(100,greatest(0,p_score)),confidence=least(100,greatest(0,p_confidence)),approved_by_ai=v_pass,
    review_notes=p_output_json->>'reviewNotes',strengths_json=coalesce(p_output_json->'strengths','[]'::jsonb),
    weaknesses_json=coalesce(p_output_json->'weaknesses','[]'::jsonb),recommended_changes_json=coalesce(p_output_json->'recommendedChanges','[]'::jsonb),
    unsupported_claims_json=coalesce(p_output_json->'unsupportedClaims','[]'::jsonb),prompt_version=p_prompt_version,schema_version=p_schema_version,
    model=p_model,input_tokens=p_input_tokens,output_tokens=p_output_tokens,duration_ms=p_duration_ms,response_id=p_response_id,output_json=p_output_json,
    completed_at=now(),lease_expires_at=null,updated_at=now()
  where id=v.id;

  update public.opportunity_engagements set status=v_next_status,engagement_score=least(100,greatest(0,p_score)),
    confidence=least(100,greatest(0,p_confidence)),updated_at=now()
  where id=v.engagement_id and status='DRAFT_READY';

  insert into public.engagement_review_history(organisation_id,campaign_id,engagement_id,opportunity_id,review_type,outcome,score,confidence,review_json)
  values(v.organisation_id,v.campaign_id,v.engagement_id,v.opportunity_id,'AI_SELF_REVIEW',case when v_pass then 'APPROVED' else 'REGENERATE_REQUESTED' end,
    p_score,p_confidence,p_output_json);

  insert into public.opportunity_engagement_history(organisation_id,campaign_id,engagement_id,opportunity_id,event_type,previous_status,next_status,metadata_json)
  values(v.organisation_id,v.campaign_id,v.engagement_id,v.opportunity_id,'SELF_REVIEW_COMPLETED','DRAFT_READY',v_next_status,
    jsonb_build_object('reviewId',v.id,'draftId',v.draft_id,'approvedByAI',v_pass,'engagementScore',p_score,'confidence',p_confidence,'promptVersion',p_prompt_version));

  insert into public.campaign_timeline(organisation_id,campaign_id,event_type,title,description,visibility,metadata_json)
  values(v.organisation_id,v.campaign_id,'DRAFT_REVIEWED',case when v_pass then 'Outreach quality review complete' else 'Outreach needs refinement' end,
    case when v_pass then 'SalesPilot has quality-checked this outreach and prepared it for review.' else 'SalesPilot identified improvements required before this outreach should be reviewed.' end,
    'CUSTOMER',jsonb_build_object('engagementId',v.engagement_id,'opportunityId',v.opportunity_id,'draftId',v.draft_id,'reviewId',v.id,'approvedByAI',v_pass,'engagementScore',p_score));

  v_event_id:=gen_random_uuid();
  insert into public.domain_outbox(organisation_id,event_id,event_type,aggregate_type,aggregate_id,payload_json,occurred_at)
  values(v.organisation_id,v_event_id,'EngagementDraftReviewed','OpportunityEngagement',v.engagement_id,
    jsonb_build_object('campaignId',v.campaign_id,'opportunityId',v.opportunity_id,'draftId',v.draft_id,'reviewId',v.id,'status',v_next_status,'approvedByAI',v_pass,'engagementScore',p_score,'confidence',p_confidence),now());
end $$;

create or replace function public.fail_engagement_self_review(p_review_id uuid,p_error text)
returns void language plpgsql security definer set search_path=public as $$
declare v public.engagement_draft_reviews%rowtype; v_final boolean;
begin
  select * into v from public.engagement_draft_reviews where id=p_review_id for update;
  if v.id is null then return; end if;
  v_final:=v.attempt_count>=5;
  update public.engagement_draft_reviews set status=case when v_final then 'FAILED_FINAL' else 'FAILED_RETRYABLE' end,
    last_error=left(p_error,1000),next_attempt_at=case when v_final then null else now()+make_interval(mins=>least(60,power(2,greatest(v.attempt_count,1))::integer)) end,
    lease_expires_at=null,updated_at=now() where id=v.id;
  insert into public.opportunity_engagement_history(organisation_id,campaign_id,engagement_id,opportunity_id,event_type,previous_status,next_status,metadata_json)
  values(v.organisation_id,v.campaign_id,v.engagement_id,v.opportunity_id,'SELF_REVIEW_FAILED','DRAFT_READY','DRAFT_READY',
    jsonb_build_object('reviewId',v.id,'draftId',v.draft_id,'attempt',v.attempt_count,'final',v_final,'error',left(p_error,500)));
end $$;

revoke all on function public.claim_engagement_self_review(uuid) from public,anon,authenticated;
revoke all on function public.complete_engagement_self_review(uuid,jsonb,text,text,integer,integer,boolean,text,integer,integer,integer,text) from public,anon,authenticated;
revoke all on function public.fail_engagement_self_review(uuid,text) from public,anon,authenticated;
grant execute on function public.claim_engagement_self_review(uuid) to service_role;
grant execute on function public.complete_engagement_self_review(uuid,jsonb,text,text,integer,integer,boolean,text,integer,integer,integer,text) to service_role;
grant execute on function public.fail_engagement_self_review(uuid,text) to service_role;
