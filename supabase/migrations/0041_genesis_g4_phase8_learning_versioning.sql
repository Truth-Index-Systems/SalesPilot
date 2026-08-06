-- Genesis G4 Phase 8: immutable learning snapshots and version registry.
-- No new AI execution, customer workflow, dispatch or sending behaviour.

alter table public.engagement_prompt_versions
  add column if not exists checksum text,
  add column if not exists responses_api_version text,
  add column if not exists temperature numeric,
  add column if not exists top_p numeric,
  add column if not exists reasoning_effort text;

update public.engagement_prompt_versions
set checksum=encode(digest(system_prompt || template_json::text || schema_version,'sha256'),'hex')
where checksum is null;

create table if not exists public.engagement_model_versions (
  id uuid primary key default gen_random_uuid(),
  model text not null,
  responses_api_version text not null default 'responses/v1',
  temperature numeric,
  top_p numeric,
  reasoning_effort text,
  schema_version text not null,
  configuration_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  retired_at timestamptz,
  unique(model,responses_api_version,schema_version,temperature,top_p,reasoning_effort)
);

create table if not exists public.engagement_learning_records (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  engagement_id uuid not null references public.opportunity_engagements(id) on delete cascade,
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  queue_id uuid not null references public.engagement_send_queue(id) on delete cascade,
  commercial_analysis_id uuid references public.engagement_commercial_analyses(id) on delete set null,
  draft_id uuid references public.engagement_drafts(id) on delete set null,
  ai_review_id uuid references public.engagement_draft_reviews(id) on delete set null,
  scheduler_run_id uuid references public.pipeline_scheduler_runs(id) on delete set null,
  commercial_reasoning_version text,
  generation_version text,
  review_version text,
  commercial_prompt_version text,
  generation_prompt_version text,
  review_prompt_version text,
  commercial_model text,
  generation_model text,
  review_model text,
  total_input_tokens integer not null default 0,
  total_output_tokens integer not null default 0,
  total_latency_ms integer not null default 0,
  estimated_cost_usd numeric(12,6) not null default 0,
  actual_cost_usd numeric(12,6) not null default 0,
  engagement_score integer check (engagement_score between 0 and 100),
  confidence integer check (confidence between 0 and 100),
  human_action text,
  edit_distance integer check (edit_distance is null or edit_distance >= 0),
  approval_outcome text,
  queue_outcome text not null,
  governance_json jsonb not null default '{}'::jsonb,
  snapshot_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(engagement_id),
  unique(queue_id)
);

create index if not exists engagement_learning_records_org_idx on public.engagement_learning_records(organisation_id,campaign_id,created_at desc);
create index if not exists engagement_learning_records_prompt_idx on public.engagement_learning_records(generation_prompt_version,review_prompt_version,created_at desc);

alter table public.engagement_learning_records enable row level security;
alter table public.engagement_model_versions enable row level security;
drop policy if exists engagement_learning_records_member_read on public.engagement_learning_records;
create policy engagement_learning_records_member_read on public.engagement_learning_records for select to authenticated using (public.is_active_org_member(organisation_id));
drop policy if exists engagement_model_versions_authenticated_read on public.engagement_model_versions;
create policy engagement_model_versions_authenticated_read on public.engagement_model_versions for select to authenticated using (true);

alter table public.opportunity_engagement_history drop constraint if exists opportunity_engagement_history_event_type_check;
alter table public.opportunity_engagement_history add constraint opportunity_engagement_history_event_type_check check (event_type in (
  'PREPARED','ROUTE_UPDATED','POLICY_UPDATED','STATUS_CHANGED','UPDATED','PAUSED','CANCELLED',
  'COMMERCIAL_ANALYSIS_COMPLETED','COMMERCIAL_ANALYSIS_FAILED','DRAFT_GENERATION_STARTED','DRAFT_CREATED','DRAFT_GENERATION_FAILED',
  'SELF_REVIEW_STARTED','SELF_REVIEW_COMPLETED','SELF_REVIEW_FAILED','DRAFT_APPROVED','DRAFT_EDITED','DRAFT_REJECTED','DRAFT_REGENERATION_REQUESTED',
  'APPROVED_TO_SEND','QUEUED','LEARNING_SNAPSHOT_CREATED','SENT'
));

create or replace function public.run_engagement_learning_builder(p_scheduler_run_id uuid)
returns table(inspected integer,created integer,existing integer,skipped integer)
language plpgsql security definer set search_path=public as $$
declare v record; v_inspected integer:=0; v_created integer:=0; v_existing integer:=0; v_skipped integer:=0; v_learning_id uuid; v_event_id uuid;
begin
  if not exists(select 1 from public.pipeline_scheduler_runs where id=p_scheduler_run_id) then raise exception 'scheduler run required'; end if;
  for v in
    select q.*,e.company_id,e.contact_id,e.engagement_score as current_engagement_score,e.confidence as current_confidence,
      a.id analysis_id,a.prompt_version analysis_prompt,a.schema_version analysis_schema,a.model analysis_model,
      d.prompt_version draft_prompt,d.schema_version draft_schema,d.model draft_model,d.input_tokens draft_input,d.output_tokens draft_output,d.duration_ms draft_duration,
      r.id ai_review_id,r.prompt_version review_prompt,r.schema_version review_schema,r.model review_model,r.input_tokens review_input,r.output_tokens review_output,r.duration_ms review_duration,r.engagement_score ai_score,r.confidence ai_confidence,
      h.action human_action,h.edit_distance,h.created_at human_reviewed_at
    from public.engagement_send_queue q
    join public.opportunity_engagements e on e.id=q.engagement_id
    join public.engagement_drafts d on d.id=q.draft_id
    left join public.engagement_commercial_analyses a on a.id=d.commercial_analysis_id
    left join public.engagement_draft_reviews r on r.draft_id=d.id and r.status='COMPLETE'
    left join lateral (select hr.action,hr.edit_distance,hr.created_at from public.engagement_human_reviews hr where hr.engagement_id=e.id order by hr.created_at desc limit 1) h on true
    where q.status in ('READY','PAUSED','SENT','FAILED')
    order by q.queued_at
  loop
    v_inspected:=v_inspected+1;
    if exists(select 1 from public.engagement_learning_records l where l.engagement_id=v.engagement_id) then v_existing:=v_existing+1; continue; end if;
    if v.draft_id is null then v_skipped:=v_skipped+1; continue; end if;

    insert into public.engagement_model_versions(model,schema_version)
    select x.model,x.schema_version from (values (v.analysis_model,v.analysis_schema),(v.draft_model,v.draft_schema),(v.review_model,v.review_schema)) x(model,schema_version)
    where x.model is not null and x.schema_version is not null on conflict do nothing;

    insert into public.engagement_learning_records(
      organisation_id,campaign_id,engagement_id,opportunity_id,company_id,contact_id,queue_id,commercial_analysis_id,draft_id,ai_review_id,scheduler_run_id,
      commercial_reasoning_version,generation_version,review_version,commercial_prompt_version,generation_prompt_version,review_prompt_version,
      commercial_model,generation_model,review_model,total_input_tokens,total_output_tokens,total_latency_ms,estimated_cost_usd,actual_cost_usd,
      engagement_score,confidence,human_action,edit_distance,approval_outcome,queue_outcome,governance_json,snapshot_json)
    values(
      v.organisation_id,v.campaign_id,v.engagement_id,v.opportunity_id,v.company_id,v.contact_id,v.id,v.analysis_id,v.draft_id,v.ai_review_id,p_scheduler_run_id,
      v.analysis_schema,v.draft_schema,v.review_schema,v.analysis_prompt,v.draft_prompt,v.review_prompt,v.analysis_model,v.draft_model,v.review_model,
      coalesce(v.draft_input,0)+coalesce(v.review_input,0),coalesce(v.draft_output,0)+coalesce(v.review_output,0),coalesce(v.draft_duration,0)+coalesce(v.review_duration,0),
      coalesce((select sum(u.estimated_cost_usd) from public.ai_usage_ledger u where u.job_id in (v.analysis_id,v.draft_id,v.ai_review_id)),0),
      coalesce((select sum(u.actual_cost_usd) from public.ai_usage_ledger u where u.job_id in (v.analysis_id,v.draft_id,v.ai_review_id)),0),
      coalesce(v.ai_score,v.current_engagement_score),coalesce(v.ai_confidence,v.current_confidence),v.human_action,v.edit_distance,
      coalesce(v.human_action,'APPROVED'),v.status,
      jsonb_build_object('usage',(select coalesce(jsonb_agg(jsonb_build_object('jobType',u.job_type,'status',u.status,'blockedReason',u.error_code,'estimatedCostUsd',u.estimated_cost_usd,'actualCostUsd',u.actual_cost_usd)), '[]'::jsonb) from public.ai_usage_ledger u where u.job_id in (v.analysis_id,v.draft_id,v.ai_review_id))),
      jsonb_build_object('scheduledFor',v.scheduled_for,'recipientTimezone',v.recipient_timezone,'timezoneSource',v.timezone_source,'timezoneConfidence',v.timezone_confidence,'humanReviewedAt',v.human_reviewed_at)
    ) returning id into v_learning_id;

    insert into public.opportunity_engagement_history(organisation_id,campaign_id,engagement_id,opportunity_id,event_type,previous_status,next_status,metadata_json)
    select v.organisation_id,v.campaign_id,v.engagement_id,v.opportunity_id,'LEARNING_SNAPSHOT_CREATED',e.status,e.status,jsonb_build_object('learningRecordId',v_learning_id,'schedulerRunId',p_scheduler_run_id) from public.opportunity_engagements e where e.id=v.engagement_id;
    insert into public.campaign_timeline(organisation_id,campaign_id,event_type,title,description,visibility,metadata_json)
    values(v.organisation_id,v.campaign_id,'LEARNING_SNAPSHOT_CREATED','Engagement learning recorded','SalesPilot recorded the complete decision and generation trail for future improvement.','INTERNAL',jsonb_build_object('engagementId',v.engagement_id,'learningRecordId',v_learning_id));
    v_event_id:=gen_random_uuid();
    insert into public.domain_outbox(organisation_id,event_id,event_type,aggregate_type,aggregate_id,payload_json,occurred_at)
    values(v.organisation_id,v_event_id,'EngagementLearningRecorded','Engagement',v.engagement_id,jsonb_build_object('campaignId',v.campaign_id,'opportunityId',v.opportunity_id,'learningRecordId',v_learning_id),now());
    v_created:=v_created+1;
  end loop;
  return query select v_inspected,v_created,v_existing,v_skipped;
end $$;

create or replace view public.engagement_learning_metrics with (security_invoker=true) as
select organisation_id,campaign_id,generation_prompt_version,review_prompt_version,generation_model,review_model,
  count(*) engagement_count,round(avg(engagement_score),2) average_engagement_score,round(avg(confidence),2) average_confidence,
  round(100.0*count(*) filter(where approval_outcome in ('APPROVED','EDITED'))/nullif(count(*),0),2) approval_rate,
  round(100.0*count(*) filter(where human_action='EDITED')/nullif(count(*),0),2) edit_rate,
  round(100.0*count(*) filter(where human_action='REJECTED')/nullif(count(*),0),2) reject_rate,
  round(avg(edit_distance),2) average_edit_distance,round(avg(total_input_tokens+total_output_tokens),2) average_tokens,
  round(avg(actual_cost_usd),6) average_cost_usd,round(avg(total_latency_ms),2) average_latency_ms
from public.engagement_learning_records
group by organisation_id,campaign_id,generation_prompt_version,review_prompt_version,generation_model,review_model;

revoke all on function public.run_engagement_learning_builder(uuid) from public,anon,authenticated;
grant execute on function public.run_engagement_learning_builder(uuid) to service_role;
