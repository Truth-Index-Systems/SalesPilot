-- MarketRoute Genesis G5 — Release 6: Mandatory AI Self Review + Automatic Rewrite
-- G4 truth remains immutable. R6 owns review of R4 outreach only.

alter table public.engagement_strategies
  add column if not exists self_review_json jsonb,
  add column if not exists self_review_schema_version text,
  add column if not exists self_review_prompt_version text,
  add column if not exists self_review_model text,
  add column if not exists self_review_outcome text check (self_review_outcome in ('PASS','REWRITE','BLOCK')),
  add column if not exists self_review_confidence integer check (self_review_confidence between 0 and 100),
  add column if not exists self_review_source_fingerprint text,
  add column if not exists self_reviewed_at timestamptz,
  add column if not exists rewrite_count integer not null default 0 check (rewrite_count >= 0),
  add column if not exists outreach_rewrite_instruction_json jsonb;

create table if not exists public.engagement_strategy_reviews (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  strategy_id uuid not null references public.engagement_strategies(id) on delete cascade,
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  scheduler_run_id uuid references public.pipeline_scheduler_runs(id) on delete set null,
  rewrite_number integer not null default 0,
  outcome text not null check (outcome in ('PASS','REWRITE','BLOCK')),
  review_json jsonb not null,
  schema_version text not null,
  prompt_version text not null,
  model text,
  confidence integer check (confidence between 0 and 100),
  source_fingerprint text,
  created_at timestamptz not null default now()
);
create index if not exists engagement_strategy_reviews_strategy_idx on public.engagement_strategy_reviews(strategy_id,created_at desc);
alter table public.engagement_strategy_reviews enable row level security;
drop policy if exists engagement_strategy_reviews_member_read on public.engagement_strategy_reviews;
create policy engagement_strategy_reviews_member_read on public.engagement_strategy_reviews for select to authenticated using (public.is_active_org_member(organisation_id));
revoke all on table public.engagement_strategy_reviews from public,anon,authenticated;
grant select on table public.engagement_strategy_reviews to authenticated;
grant select,insert,update on table public.engagement_strategy_reviews to service_role;

alter table public.engagement_strategy_events drop constraint if exists engagement_strategy_events_event_type_check;
alter table public.engagement_strategy_events add constraint engagement_strategy_events_event_type_check check (event_type in (
  'CREATED','CLAIMED','TRANSITIONED','RETRY_SCHEDULED','FAILED_TERMINAL','LEASE_RELEASED',
  'CHANNEL_STRATEGY_READY','PERSONALISATION_SAFETY_READY','SELF_REVIEW_PASS','SELF_REVIEW_REWRITE','SELF_REVIEW_BLOCK'
));

create or replace function public.claim_g5_self_review(p_scheduler_run_id uuid,p_lease_seconds integer default 300)
returns table(strategy_id uuid,lease_token uuid,opportunity_id uuid)
language plpgsql security definer set search_path=public as $$
declare v_id uuid; v_token uuid:=gen_random_uuid(); v_previous text;
begin
  perform public.assert_active_pipeline_scheduler_run(p_scheduler_run_id);
  select s.id,s.state into v_id,v_previous
  from public.engagement_strategies s
  join public.opportunities o on o.id=s.opportunity_id and o.status='APPROVED'
  join public.campaigns c on c.id=s.campaign_id and c.status not in ('PAUSED','ARCHIVED')
  where ((s.state='SELF_REVIEW') or (s.state='FAILED_RETRYABLE' and s.failure_stage='SELF_REVIEW' and coalesce(s.next_retry_at,now())<=now()))
    and s.outreach_generation_json is not null
    and s.personalisation_safety_json is not null
    and (s.lease_expires_at is null or s.lease_expires_at<now())
  order by s.created_at
  for update of s skip locked limit 1;
  if v_id is null then return; end if;
  update public.engagement_strategies s set previous_state=v_previous,state='SELF_REVIEW',scheduler_run_id=p_scheduler_run_id,lease_token=v_token,claimed_at=now(),lease_expires_at=now()+make_interval(secs=>greatest(30,p_lease_seconds)),attempt_count=s.attempt_count+1,failure_stage=null,failure_reason=null,next_retry_at=null,updated_at=now() where s.id=v_id;
  insert into public.engagement_strategy_events(organisation_id,campaign_id,strategy_id,opportunity_id,scheduler_run_id,event_type,previous_state,next_state,lease_token,metadata_json)
  select organisation_id,campaign_id,id,opportunity_id,p_scheduler_run_id,'CLAIMED',v_previous,'SELF_REVIEW',v_token,jsonb_build_object('release','G5_R6','worker','SELF_REVIEW','rewriteCount',rewrite_count,'immutableG4',true) from public.engagement_strategies where id=v_id;
  return query select s.id,s.lease_token,s.opportunity_id from public.engagement_strategies s where s.id=v_id;
end $$;

create or replace function public.get_g5_self_review_context_owned(p_strategy_id uuid,p_scheduler_run_id uuid,p_lease_token uuid)
returns table(organisation_id uuid,campaign_id uuid,commercial_reasoning_json jsonb,channel_strategy_json jsonb,source_snapshot_json jsonb,personalisation_safety_json jsonb,outreach_generation_json jsonb,rewrite_count integer)
language plpgsql security definer set search_path=public as $$
declare v public.engagement_strategies%rowtype;
begin
  perform public.assert_active_pipeline_scheduler_run(p_scheduler_run_id);
  select * into v from public.engagement_strategies where id=p_strategy_id;
  if v.id is null then raise exception 'G5_ENGAGEMENT_MISSING'; end if;
  if v.state<>'SELF_REVIEW' then raise exception 'G5_ENGAGEMENT_STATE_CHANGED'; end if;
  if v.scheduler_run_id is distinct from p_scheduler_run_id or v.lease_token is distinct from p_lease_token or v.lease_expires_at is null or v.lease_expires_at<now() then raise exception 'G5_ENGAGEMENT_OWNERSHIP_LOST'; end if;
  if v.outreach_generation_json is null then raise exception 'G5_SELF_REVIEW_OUTREACH_MISSING'; end if;
  if v.personalisation_safety_json is null then raise exception 'G5_SELF_REVIEW_SAFETY_MISSING'; end if;
  return query select v.organisation_id,v.campaign_id,v.commercial_reasoning_json,v.channel_strategy_json,v.commercial_reasoning_source_snapshot_json,v.personalisation_safety_json,v.outreach_generation_json,v.rewrite_count;
end $$;

create or replace function public.complete_g5_self_review_owned(
 p_strategy_id uuid,p_scheduler_run_id uuid,p_lease_token uuid,p_review_json jsonb,p_schema_version text,p_prompt_version text,p_model text,p_outcome text,p_confidence integer,p_source_fingerprint text)
returns public.engagement_strategies
language plpgsql security definer set search_path=public as $$
declare v public.engagement_strategies%rowtype; v_next text; v_event text;
begin
  perform public.assert_active_pipeline_scheduler_run(p_scheduler_run_id);
  select * into v from public.engagement_strategies where id=p_strategy_id for update;
  if v.id is null then raise exception 'G5_ENGAGEMENT_MISSING'; end if;
  if v.state<>'SELF_REVIEW' then raise exception 'G5_ENGAGEMENT_STATE_CHANGED'; end if;
  if v.scheduler_run_id is distinct from p_scheduler_run_id or v.lease_token is distinct from p_lease_token or v.lease_expires_at is null or v.lease_expires_at<now() then raise exception 'G5_ENGAGEMENT_OWNERSHIP_LOST'; end if;
  if p_outcome not in ('PASS','REWRITE','BLOCK') then raise exception 'G5_SELF_REVIEW_INVALID_OUTCOME'; end if;
  insert into public.engagement_strategy_reviews(organisation_id,campaign_id,strategy_id,opportunity_id,scheduler_run_id,rewrite_number,outcome,review_json,schema_version,prompt_version,model,confidence,source_fingerprint)
  values(v.organisation_id,v.campaign_id,v.id,v.opportunity_id,p_scheduler_run_id,v.rewrite_count,p_outcome,p_review_json,p_schema_version,p_prompt_version,p_model,p_confidence,p_source_fingerprint);

  if p_outcome='PASS' then
    v_next:='READY_FOR_APPROVAL'; v_event:='SELF_REVIEW_PASS';
    update public.engagement_strategies set previous_state='SELF_REVIEW',state=v_next,self_review_json=p_review_json,self_review_schema_version=p_schema_version,self_review_prompt_version=p_prompt_version,self_review_model=p_model,self_review_outcome=p_outcome,self_review_confidence=p_confidence,self_review_source_fingerprint=p_source_fingerprint,self_reviewed_at=now(),outreach_rewrite_instruction_json=null,lease_token=null,lease_expires_at=null,claimed_at=null,scheduler_run_id=null,updated_at=now() where id=v.id returning * into v;
  elsif p_outcome='REWRITE' then
    if v.rewrite_count>=2 then raise exception 'G5_SELF_REVIEW_REWRITE_LIMIT_REQUIRES_BLOCK'; end if;
    v_next:='FAILED_RETRYABLE'; v_event:='SELF_REVIEW_REWRITE';
    update public.engagement_strategies set previous_state='SELF_REVIEW',state=v_next,failure_stage='OUTREACH_GENERATION',failure_reason='AI self review requested rewrite',next_retry_at=now(),rewrite_count=v.rewrite_count+1,self_review_json=p_review_json,self_review_schema_version=p_schema_version,self_review_prompt_version=p_prompt_version,self_review_model=p_model,self_review_outcome=p_outcome,self_review_confidence=p_confidence,self_review_source_fingerprint=p_source_fingerprint,self_reviewed_at=now(),outreach_rewrite_instruction_json=jsonb_build_object('review',p_review_json,'rewriteNumber',v.rewrite_count+1),outreach_generation_json=null,outreach_generation_schema_version=null,outreach_generation_prompt_version=null,outreach_generation_model=null,outreach_generation_confidence=null,outreach_generation_source_fingerprint=null,outreach_generated_at=null,lease_token=null,lease_expires_at=null,claimed_at=null,scheduler_run_id=null,updated_at=now() where id=v.id returning * into v;
  else
    v_next:='FAILED_TERMINAL'; v_event:='SELF_REVIEW_BLOCK';
    update public.engagement_strategies set previous_state='SELF_REVIEW',state=v_next,failure_stage='SELF_REVIEW',failure_reason='AI self review blocked outreach',next_retry_at=null,self_review_json=p_review_json,self_review_schema_version=p_schema_version,self_review_prompt_version=p_prompt_version,self_review_model=p_model,self_review_outcome=p_outcome,self_review_confidence=p_confidence,self_review_source_fingerprint=p_source_fingerprint,self_reviewed_at=now(),lease_token=null,lease_expires_at=null,claimed_at=null,scheduler_run_id=null,updated_at=now() where id=v.id returning * into v;
  end if;

  insert into public.engagement_strategy_events(organisation_id,campaign_id,strategy_id,opportunity_id,scheduler_run_id,event_type,previous_state,next_state,lease_token,metadata_json)
  values(v.organisation_id,v.campaign_id,v.id,v.opportunity_id,p_scheduler_run_id,v_event,'SELF_REVIEW',v_next,p_lease_token,jsonb_build_object('release','G5_R6','outcome',p_outcome,'confidence',p_confidence,'rewriteCount',v.rewrite_count,'immutableG4',true));
  insert into public.campaign_timeline(organisation_id,campaign_id,event_type,title,description,visibility,metadata_json)
  values(v.organisation_id,v.campaign_id,'G5_SELF_REVIEW_'||p_outcome,
    case p_outcome when 'PASS' then 'Outreach passed independent review' when 'REWRITE' then 'Outreach is being improved' else 'Outreach blocked by safety review' end,
    case p_outcome when 'PASS' then 'MarketRoute checked factual accuracy, evidence, route alignment and message quality. The outreach is ready for approval.' when 'REWRITE' then 'MarketRoute found issues in the draft and is automatically rewriting it before showing it for approval.' else 'MarketRoute found issues that should not progress to approval.' end,
    'CUSTOMER',jsonb_build_object('strategyId',v.id,'opportunityId',v.opportunity_id,'outcome',p_outcome,'rewriteCount',v.rewrite_count));
  return v;
end $$;

create or replace function public.fail_g5_self_review_owned(p_strategy_id uuid,p_scheduler_run_id uuid,p_lease_token uuid,p_reason text,p_retry_after_seconds integer default 60)
returns public.engagement_strategies language plpgsql security definer set search_path=public as $$
declare v public.engagement_strategies%rowtype;
begin
 perform public.assert_active_pipeline_scheduler_run(p_scheduler_run_id);
 select * into v from public.engagement_strategies where id=p_strategy_id for update;
 if v.id is null then raise exception 'G5_ENGAGEMENT_MISSING'; end if;
 if v.state<>'SELF_REVIEW' then raise exception 'G5_ENGAGEMENT_STATE_CHANGED'; end if;
 if v.scheduler_run_id is distinct from p_scheduler_run_id or v.lease_token is distinct from p_lease_token or v.lease_expires_at is null or v.lease_expires_at<now() then raise exception 'G5_ENGAGEMENT_OWNERSHIP_LOST'; end if;
 update public.engagement_strategies set previous_state='SELF_REVIEW',state='FAILED_RETRYABLE',failure_stage='SELF_REVIEW',failure_reason=left(coalesce(p_reason,'G5 self review failed'),1000),next_retry_at=now()+make_interval(secs=>greatest(30,p_retry_after_seconds)),lease_token=null,lease_expires_at=null,claimed_at=null,scheduler_run_id=null,updated_at=now() where id=p_strategy_id returning * into v;
 insert into public.engagement_strategy_events(organisation_id,campaign_id,strategy_id,opportunity_id,scheduler_run_id,event_type,previous_state,next_state,lease_token,metadata_json) values(v.organisation_id,v.campaign_id,v.id,v.opportunity_id,p_scheduler_run_id,'RETRY_SCHEDULED','SELF_REVIEW','FAILED_RETRYABLE',p_lease_token,jsonb_build_object('release','G5_R6','worker','SELF_REVIEW','reason',left(coalesce(p_reason,''),500),'retryable',true));
 return v;
end $$;

-- R4 rewrite context: when R6 asks for a rewrite, feed its exact criticism back into generation.
drop function if exists public.get_g5_outreach_generation_context_owned(uuid,uuid,uuid);
create or replace function public.get_g5_outreach_generation_context_owned(p_strategy_id uuid,p_scheduler_run_id uuid,p_lease_token uuid)
returns table(organisation_id uuid,campaign_id uuid,commercial_reasoning_json jsonb,channel_strategy_json jsonb,source_snapshot_json jsonb,personalisation_safety_json jsonb,rewrite_instruction_json jsonb)
language plpgsql security definer set search_path=public as $$
declare v public.engagement_strategies%rowtype;
begin
 perform public.assert_active_pipeline_scheduler_run(p_scheduler_run_id); select * into v from public.engagement_strategies where id=p_strategy_id;
 if v.id is null then raise exception 'G5_ENGAGEMENT_MISSING'; end if; if v.state<>'GENERATING' then raise exception 'G5_ENGAGEMENT_STATE_CHANGED'; end if;
 if v.scheduler_run_id is distinct from p_scheduler_run_id or v.lease_token is distinct from p_lease_token or v.lease_expires_at is null or v.lease_expires_at<now() then raise exception 'G5_ENGAGEMENT_OWNERSHIP_LOST'; end if;
 if v.commercial_reasoning_json is null or v.channel_strategy_json is null or v.personalisation_safety_json is null then raise exception 'G5_OUTREACH_CONTEXT_MISSING'; end if;
 if v.outreach_generation_json is not null then raise exception 'G5_OUTREACH_ALREADY_GENERATED'; end if;
 return query select v.organisation_id,v.campaign_id,v.commercial_reasoning_json,v.channel_strategy_json,v.commercial_reasoning_source_snapshot_json,v.personalisation_safety_json,v.outreach_rewrite_instruction_json;
end $$;

revoke all on function public.claim_g5_self_review(uuid,integer) from public,anon,authenticated;
revoke all on function public.get_g5_self_review_context_owned(uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function public.complete_g5_self_review_owned(uuid,uuid,uuid,jsonb,text,text,text,text,integer,text) from public,anon,authenticated;
revoke all on function public.fail_g5_self_review_owned(uuid,uuid,uuid,text,integer) from public,anon,authenticated;
grant execute on function public.claim_g5_self_review(uuid,integer) to service_role;
grant execute on function public.get_g5_self_review_context_owned(uuid,uuid,uuid) to service_role;
grant execute on function public.complete_g5_self_review_owned(uuid,uuid,uuid,jsonb,text,text,text,text,integer,text) to service_role;
grant execute on function public.fail_g5_self_review_owned(uuid,uuid,uuid,text,integer) to service_role;
grant execute on function public.get_g5_outreach_generation_context_owned(uuid,uuid,uuid) to service_role;
