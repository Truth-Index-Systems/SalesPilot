-- Genesis G4.7.10: full pipeline legacy/leak hardening.
-- Consolidates ownership and active-scheduler contracts across every autonomous stage.

create or replace function public.assert_active_pipeline_scheduler_run(p_run_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not exists(select 1 from public.pipeline_scheduler_lease where singleton=true and run_id=p_run_id and lease_expires_at>now()) then
    raise exception 'PIPELINE_SCHEDULER_OWNERSHIP_LOST';
  end if;
end $$;
revoke all on function public.assert_active_pipeline_scheduler_run(uuid) from public,anon,authenticated;
grant execute on function public.assert_active_pipeline_scheduler_run(uuid) to service_role;

-- Business Analysis: per-claim fencing. Access token authenticates the job;
-- worker_token identifies the current execution attempt.
alter table public.business_analysis_jobs add column if not exists worker_token uuid;

create or replace function public.claim_business_analysis_job(
  p_job_id uuid,p_access_token_hash text,p_lease_seconds integer default 290
) returns public.business_analysis_jobs
language plpgsql security definer set search_path=public as $$
declare v_job public.business_analysis_jobs%rowtype; v_token uuid:=gen_random_uuid();
begin
  update public.business_analysis_jobs baj set
    status='RUNNING',stage='READING_WEBSITE',progress=8,attempt_count=baj.attempt_count+1,
    claimed_at=now(),lease_expires_at=now()+make_interval(secs=>greatest(60,least(p_lease_seconds,600))),
    worker_token=v_token,next_retry_at=null,last_error_code=null,last_error_message=null,
    started_at=coalesce(baj.started_at,now()),updated_at=now()
  where baj.id=p_job_id and baj.access_token_hash=p_access_token_hash and (
    baj.status='QUEUED' or
    (baj.status='FAILED_RETRYABLE' and coalesce(baj.next_retry_at,now())<=now()) or
    (baj.status='RUNNING' and baj.lease_expires_at<now())
  ) returning * into v_job;
  return v_job;
end $$;

create or replace function public.update_business_analysis_progress_owned(
 p_job_id uuid,p_access_token_hash text,p_worker_token uuid,p_stage text,p_progress integer,p_canonical_url text default null,p_pages_read integer default null
) returns boolean language plpgsql security definer set search_path=public as $$
begin
 update public.business_analysis_jobs baj set stage=p_stage,progress=greatest(0,least(p_progress,99)),canonical_url=coalesce(p_canonical_url,baj.canonical_url),pages_read=coalesce(p_pages_read,baj.pages_read),lease_expires_at=now()+interval '5 minutes',updated_at=now()
 where baj.id=p_job_id and baj.access_token_hash=p_access_token_hash and baj.worker_token=p_worker_token and baj.status='RUNNING';
 if not found then raise exception 'BUSINESS_ANALYSIS_OWNERSHIP_LOST'; end if; return true;
end $$;

create or replace function public.complete_business_analysis_job_owned(
 p_job_id uuid,p_access_token_hash text,p_worker_token uuid,p_canonical_url text,p_pages_read integer,p_analysis jsonb,p_result_summary jsonb default '{}'::jsonb
) returns boolean language plpgsql security definer set search_path=public as $$
begin
 update public.business_analysis_jobs baj set status='COMPLETED',stage='COMPLETE',progress=100,canonical_url=p_canonical_url,pages_read=p_pages_read,analysis_json=p_analysis,result_summary_json=coalesce(p_result_summary,'{}'::jsonb),claimed_at=null,lease_expires_at=null,next_retry_at=null,completed_at=now(),updated_at=now()
 where baj.id=p_job_id and baj.access_token_hash=p_access_token_hash and baj.worker_token=p_worker_token and baj.status='RUNNING';
 if not found then raise exception 'BUSINESS_ANALYSIS_OWNERSHIP_LOST'; end if; return true;
end $$;

create or replace function public.fail_business_analysis_job_owned(
 p_job_id uuid,p_access_token_hash text,p_worker_token uuid,p_error_code text,p_error_message text,p_retryable boolean
) returns boolean language plpgsql security definer set search_path=public as $$
declare v_attempt integer;
begin
 select attempt_count into v_attempt from public.business_analysis_jobs where id=p_job_id and access_token_hash=p_access_token_hash and worker_token=p_worker_token and status='RUNNING' for update;
 if not found then raise exception 'BUSINESS_ANALYSIS_OWNERSHIP_LOST'; end if;
 update public.business_analysis_jobs set status=case when p_retryable and v_attempt<5 then 'FAILED_RETRYABLE' else 'FAILED_TERMINAL' end,stage='FAILED',progress=0,last_error_code=p_error_code,last_error_message=left(p_error_message,1000),next_retry_at=case when not p_retryable or v_attempt>=5 then null when v_attempt<=1 then now()+interval '1 minute' when v_attempt=2 then now()+interval '5 minutes' when v_attempt=3 then now()+interval '30 minutes' else now()+interval '2 hours' end,claimed_at=null,lease_expires_at=null,updated_at=now()
 where id=p_job_id and worker_token=p_worker_token and status='RUNNING'; return true;
end $$;


-- Scheduler helper entry points that historically accepted a run id without
-- proving it still owns the global lease are wrapped too.
create or replace function public.plan_contact_discovery_dispatch_owned(
  p_scheduler_run_id uuid,p_estimated_cost_usd numeric default 0.35
) returns table(dispatch_count integer,campaign_id uuid,mode text)
language plpgsql security definer set search_path=public as $$
begin
  perform public.assert_active_pipeline_scheduler_run(p_scheduler_run_id);
  return query select * from public.plan_contact_discovery_dispatch(p_scheduler_run_id,p_estimated_cost_usd);
end $$;

create or replace function public.record_pipeline_scheduler_outcome_owned(
  p_run_id uuid,p_company_result jsonb,p_contact_result jsonb,p_opportunity_result jsonb default null
) returns void language plpgsql security definer set search_path=public as $$
begin
  perform public.assert_active_pipeline_scheduler_run(p_run_id);
  perform public.record_pipeline_scheduler_outcome(p_run_id,p_company_result,p_contact_result,p_opportunity_result);
end $$;

-- Claims are also fenced by the live scheduler lease. Historical claim RPCs
-- accepted any scheduler_run_id and therefore trusted callers more than the
-- global lease contract.
create or replace function public.claim_company_discovery_owned(p_scheduler_run_id uuid)
returns table(session_id uuid,organisation_id uuid,campaign_id uuid)
language plpgsql security definer set search_path=public as $$
begin
  perform public.assert_active_pipeline_scheduler_run(p_scheduler_run_id);
  return query select * from public.claim_company_discovery(p_scheduler_run_id);
end $$;

create or replace function public.claim_contact_discovery_owned(
  p_scheduler_run_id uuid,p_campaign_id uuid default null,p_fresh_only boolean default false
) returns table(session_id uuid,organisation_id uuid,campaign_id uuid,company_id uuid,route_expansion_pass integer)
language plpgsql security definer set search_path=public as $$
begin
  perform public.assert_active_pipeline_scheduler_run(p_scheduler_run_id);
  return query select * from public.claim_contact_discovery(p_scheduler_run_id,p_campaign_id,p_fresh_only);
end $$;

-- Company Discovery: scheduler-run fencing around all mutable worker RPCs.
create or replace function public.assert_company_discovery_owner(p_session_id uuid,p_scheduler_run_id uuid,p_require_running boolean default true)
returns void language plpgsql security definer set search_path=public as $$
declare s public.discovery_sessions%rowtype;
begin
 perform public.assert_active_pipeline_scheduler_run(p_scheduler_run_id);
 select * into s from public.discovery_sessions where id=p_session_id for update;
 if s.id is null or s.scheduler_run_id is distinct from p_scheduler_run_id or (p_require_running and (s.status<>'RUNNING' or coalesce(s.job_state,'RUNNING')<>'RUNNING')) then raise exception 'COMPANY_DISCOVERY_OWNERSHIP_LOST'; end if;
end $$;

create or replace function public.update_company_discovery_progress_owned(p_session_id uuid,p_scheduler_run_id uuid,p_stage text,p_progress integer,p_candidates integer default null)
returns void language plpgsql security definer set search_path=public as $$ begin perform public.assert_company_discovery_owner(p_session_id,p_scheduler_run_id,true); perform public.update_company_discovery_progress(p_session_id,p_stage,p_progress,p_candidates); end $$;
create or replace function public.record_discovery_activity_owned(p_session_id uuid,p_scheduler_run_id uuid,p_activity_type text,p_title text,p_description text default null,p_metadata jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path=public as $$ begin perform public.assert_company_discovery_owner(p_session_id,p_scheduler_run_id,false); perform public.record_discovery_activity(p_session_id,p_activity_type,p_title,p_description,p_metadata); end $$;
create or replace function public.save_company_discovery_batch_owned(p_session_id uuid,p_scheduler_run_id uuid,p_companies jsonb)
returns integer language plpgsql security definer set search_path=public as $$ begin perform public.assert_company_discovery_owner(p_session_id,p_scheduler_run_id,true); return public.save_company_discovery_batch(p_session_id,p_companies); end $$;
create or replace function public.finalize_company_discovery_owned(p_session_id uuid,p_scheduler_run_id uuid,p_result_summary jsonb)
returns integer language plpgsql security definer set search_path=public as $$ begin perform public.assert_company_discovery_owner(p_session_id,p_scheduler_run_id,true); return public.finalize_company_discovery(p_session_id,p_result_summary); end $$;
create or replace function public.record_company_discovery_failure_owned(p_session_id uuid,p_scheduler_run_id uuid,p_error_code text,p_error_message text,p_retryable boolean,p_failure_phase text)
returns void language plpgsql security definer set search_path=public as $$ begin perform public.assert_company_discovery_owner(p_session_id,p_scheduler_run_id,true); perform public.record_company_discovery_failure_v2(p_session_id,p_error_code,p_error_message,p_retryable,p_failure_phase); end $$;

-- Route Intelligence: upgrade the G4.7.5 fence so ownership also depends on
-- the live global scheduler lease, not only a matching historical run id.
create or replace function public.assert_contact_discovery_owner(p_session_id uuid,p_scheduler_run_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare s public.contact_discovery_sessions%rowtype;
begin
  perform public.assert_active_pipeline_scheduler_run(p_scheduler_run_id);
  select * into s from public.contact_discovery_sessions where id=p_session_id for update;
  if s.id is null or s.scheduler_run_id is distinct from p_scheduler_run_id
     or s.status<>'RUNNING' or coalesce(s.job_state,'RUNNING')<>'RUNNING' then
    raise exception 'CONTACT_DISCOVERY_OWNERSHIP_LOST';
  end if;
end $$;

create or replace function public.record_contact_discovery_failure_owned(
  p_session_id uuid,p_scheduler_run_id uuid,p_error_code text,p_error_message text,p_retryable boolean
) returns boolean language plpgsql security definer set search_path=public as $$
begin
  perform public.assert_contact_discovery_owner(p_session_id,p_scheduler_run_id);
  perform public.record_contact_discovery_failure(p_session_id,p_error_code,p_error_message,p_retryable);
  return true;
end $$;

-- Route recovery uses the G4.7 attempt budget, not the old G3 limit of five.
create or replace function public.recover_pipeline_jobs(p_run_id uuid)
returns integer language plpgsql security definer set search_path=public as $$
declare v_count integer:=0; v_changed integer:=0;
begin
 perform public.assert_active_pipeline_scheduler_run(p_run_id);
 update public.discovery_sessions set status='FAILED',job_state=case when attempt_count>=5 then 'FAILED_TERMINAL' else 'FAILED_RETRYABLE' end,stage='TECHNICAL_RETRY',last_error='WORKER_LEASE_EXPIRED',last_error_code='WORKER_LEASE_EXPIRED',last_error_message='The worker lease expired before completion.',next_retry_at=case when attempt_count>=5 then null else now()+public.pipeline_retry_delay(attempt_count,'WORKER_LEASE_EXPIRED') end,next_attempt_at=case when attempt_count>=5 then null else now()+public.pipeline_retry_delay(attempt_count,'WORKER_LEASE_EXPIRED') end,claimed_at=null,scheduler_run_id=null,lease_expires_at=null,last_heartbeat_at=now(),heartbeat_at=now(),updated_at=now() where status='RUNNING' and (lease_expires_at is null or lease_expires_at<=now());
 get diagnostics v_changed=row_count; v_count:=v_count+v_changed;
 update public.contact_discovery_sessions set status='FAILED',job_state=case when attempt_count>=8 then 'FAILED_TERMINAL' else 'FAILED_RETRYABLE' end,result_status='FAILED',stage='PREPARING',last_error='WORKER_LEASE_EXPIRED',last_error_code='WORKER_LEASE_EXPIRED',last_error_message='The worker lease expired before completion.',next_retry_at=case when attempt_count>=8 then null else now()+public.pipeline_retry_delay(attempt_count,'WORKER_LEASE_EXPIRED') end,next_attempt_at=case when attempt_count>=8 then null else now()+public.pipeline_retry_delay(attempt_count,'WORKER_LEASE_EXPIRED') end,claimed_at=null,scheduler_run_id=null,lease_expires_at=null,last_heartbeat_at=now(),heartbeat_at=now(),updated_at=now() where status='RUNNING' and (lease_expires_at is null or lease_expires_at<=now());
 get diagnostics v_changed=row_count; v_count:=v_count+v_changed;
 update public.pipeline_scheduler_runs set recovered_jobs=v_count where id=p_run_id; return v_count;
end $$;

-- G4.7 readiness is based only on persisted commercial routes. Legacy contact
-- rows/channels remain evidence inputs but cannot independently satisfy readiness.
create or replace function public.evaluate_contact_discovery_route_readiness(p_session_id uuid,p_research_summary text default null,p_uncertainties jsonb default '[]'::jsonb,p_unresolved_roles jsonb default '[]'::jsonb)
returns table(action text,primary_ready boolean,fallback_ready boolean,route_count integer,expansion_pass integer)
language plpgsql security definer set search_path=public as $$
declare s public.contact_discovery_sessions%rowtype; v_route_count integer:=0; v_primary boolean:=false; v_fallback boolean:=false; v_next_pass integer; v_company_name text;
begin
 select * into s from public.contact_discovery_sessions where id=p_session_id for update;
 if s.id is null then raise exception 'contact discovery session missing'; end if; if s.status<>'RUNNING' then raise exception 'contact discovery session is not running'; end if;
 select count(distinct coalesce(cr.route_type,'')||'|'||coalesce(cr.channel_type,'')||'|'||coalesce(cr.channel_value,'')) into v_route_count from public.commercial_routes cr where cr.organisation_id=s.organisation_id and cr.campaign_id=s.campaign_id and cr.company_id=s.company_id and cr.is_viable=true;
 v_primary:=v_route_count>=1; v_fallback:=v_route_count>=2; v_next_pass:=least(4,coalesce(s.route_expansion_pass,0)+1);
 update public.contact_discovery_sessions set route_expansion_pass=v_next_pass,primary_route_ready=v_primary,fallback_route_ready=v_fallback,research_summary=left(coalesce(p_research_summary,research_summary,'Route intelligence completed.'),1500),uncertainties_json=coalesce(p_uncertainties,'[]'::jsonb),unresolved_roles_json=coalesce(p_unresolved_roles,'[]'::jsonb),heartbeat_at=now(),updated_at=now() where id=s.id;
 if v_primary and v_fallback then update public.contact_discovery_sessions set route_research_state='READY',stage='VALIDATING',progress=88 where id=s.id; return query select 'READY',v_primary,v_fallback,v_route_count,v_next_pass; return; end if;
 if v_next_pass<4 then update public.contact_discovery_sessions set status='QUEUED',job_state='QUEUED',stage='EXPANDING',progress=45,route_research_state='EXPANDING',next_attempt_at=now()+interval '15 seconds',next_retry_at=now()+interval '15 seconds',lease_expires_at=null,claimed_at=null,last_error=null,last_error_code=null,last_error_message=null,updated_at=now() where id=s.id; select company_name into v_company_name from public.companies where id=s.company_id; insert into public.campaign_timeline(organisation_id,campaign_id,event_type,title,description,visibility,metadata_json) values(s.organisation_id,s.campaign_id,'ROUTE_RESEARCH_EXPANDING','MarketRoute is strengthening the access strategy','MarketRoute found '||v_route_count||' viable commercial route'||case when v_route_count=1 then '' else 's' end||' and is researching another independent way into '||coalesce(v_company_name,'the organisation')||'.','CUSTOMER',jsonb_build_object('companyId',s.company_id,'sessionId',s.id,'pass',v_next_pass,'primaryReady',v_primary,'fallbackReady',v_fallback,'routeCount',v_route_count)); return query select 'EXPAND',v_primary,v_fallback,v_route_count,v_next_pass; return; end if;
 update public.contact_discovery_sessions set route_research_state='EXHAUSTED',route_exhausted_at=now(),stage='VALIDATING',progress=88 where id=s.id; return query select 'EXHAUSTED',v_primary,v_fallback,v_route_count,v_next_pass;
end $$;

-- Opportunity scoring compatibility fence. The historical v2 scorer may still
-- calculate company/commercial components, but it is no longer allowed to make
-- route state authoritative. Any opportunity whose G4.7 Route Intelligence is
-- not READY is forced back to a non-actionable state after scoring.
create or replace function public.enforce_opportunity_route_readiness(p_scheduler_run_id uuid)
returns integer language plpgsql security definer set search_path=public as $$
declare v_changed integer:=0;
begin
  perform public.assert_active_pipeline_scheduler_run(p_scheduler_run_id);
  update public.opportunities o set
    status=case
      when o.status in ('REJECTED','ENGAGED') then o.status
      when cs.route_research_state='EXHAUSTED' then 'NEEDS_CONTACT'
      else 'BUILDING' end,
    route_quality=0,route_confidence=0,
    recommended_action=case when cs.route_research_state='EXHAUSTED'
      then 'Route Intelligence exhausted its supported paths; review the limitations before proceeding.'
      else 'Continue Route Intelligence until the route-readiness gate is complete.' end,
    scoring_version='opportunity-score/v3-route-intelligence-pending',updated_at=now()
  from public.contact_discovery_sessions cs
  where cs.organisation_id=o.organisation_id and cs.campaign_id=o.campaign_id and cs.company_id=o.company_id
    and coalesce(cs.route_research_state,'PLANNING')<>'READY'
    and o.status not in ('REJECTED','ENGAGED')
    and (o.status<>'BUILDING' or coalesce(o.route_quality,0)<>0 or coalesce(o.route_confidence,0)<>0
      or o.scoring_version is distinct from 'opportunity-score/v3-route-intelligence-pending');
  get diagnostics v_changed=row_count;
  return v_changed;
end $$;

-- Engagement ownership wrappers. Claims require the live global scheduler lease;
-- completion/failure additionally require the row to still belong to that run.
create or replace function public.claim_engagement_commercial_reasoning_owned(p_scheduler_run_id uuid)
returns table(analysis_id uuid,organisation_id uuid,campaign_id uuid,engagement_id uuid,context_json jsonb) language plpgsql security definer set search_path=public as $$ begin perform public.assert_active_pipeline_scheduler_run(p_scheduler_run_id); return query select * from public.claim_engagement_commercial_reasoning(p_scheduler_run_id); end $$;
create or replace function public.claim_engagement_outreach_generation_owned(p_scheduler_run_id uuid)
returns table(draft_id uuid,organisation_id uuid,campaign_id uuid,engagement_id uuid,context_json jsonb) language plpgsql security definer set search_path=public as $$ begin perform public.assert_active_pipeline_scheduler_run(p_scheduler_run_id); return query select * from public.claim_engagement_outreach_generation(p_scheduler_run_id); end $$;
create or replace function public.claim_engagement_self_review_owned(p_scheduler_run_id uuid)
returns table(review_id uuid,draft_id uuid,organisation_id uuid,campaign_id uuid,engagement_id uuid,context_json jsonb) language plpgsql security definer set search_path=public as $$ begin perform public.assert_active_pipeline_scheduler_run(p_scheduler_run_id); return query select * from public.claim_engagement_self_review(p_scheduler_run_id); end $$;

create or replace function public.assert_engagement_work_owner(p_table text,p_id uuid,p_scheduler_run_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare ok boolean:=false;
begin
 perform public.assert_active_pipeline_scheduler_run(p_scheduler_run_id);
 if p_table='analysis' then select exists(select 1 from public.engagement_commercial_analyses where id=p_id and status='RUNNING' and scheduler_run_id=p_scheduler_run_id) into ok;
 elsif p_table='draft' then select exists(select 1 from public.engagement_drafts where id=p_id and status='RUNNING' and scheduler_run_id=p_scheduler_run_id) into ok;
 elsif p_table='review' then select exists(select 1 from public.engagement_draft_reviews where id=p_id and status='RUNNING' and scheduler_run_id=p_scheduler_run_id) into ok;
 end if;
 if not ok then raise exception 'ENGAGEMENT_WORK_OWNERSHIP_LOST'; end if;
end $$;

create or replace function public.complete_engagement_commercial_reasoning_owned(p_analysis_id uuid,p_scheduler_run_id uuid,p_output_json jsonb,p_prompt_version text,p_schema_version text,p_confidence integer,p_model text)
returns void language plpgsql security definer set search_path=public as $$ begin perform public.assert_engagement_work_owner('analysis',p_analysis_id,p_scheduler_run_id); perform public.complete_engagement_commercial_reasoning(p_analysis_id,p_output_json,p_prompt_version,p_schema_version,p_confidence,p_model); end $$;
create or replace function public.fail_engagement_commercial_reasoning_owned(p_analysis_id uuid,p_scheduler_run_id uuid,p_error text)
returns void language plpgsql security definer set search_path=public as $$ begin perform public.assert_engagement_work_owner('analysis',p_analysis_id,p_scheduler_run_id); perform public.fail_engagement_commercial_reasoning(p_analysis_id,p_error); end $$;
create or replace function public.complete_engagement_outreach_generation_owned(p_draft_id uuid,p_scheduler_run_id uuid,p_output_json jsonb,p_prompt_version text,p_schema_version text,p_confidence integer,p_model text,p_input_tokens integer,p_output_tokens integer,p_duration_ms integer,p_response_id text)
returns void language plpgsql security definer set search_path=public as $$ begin perform public.assert_engagement_work_owner('draft',p_draft_id,p_scheduler_run_id); perform public.complete_engagement_outreach_generation(p_draft_id,p_output_json,p_prompt_version,p_schema_version,p_confidence,p_model,p_input_tokens,p_output_tokens,p_duration_ms,p_response_id); end $$;
create or replace function public.fail_engagement_outreach_generation_owned(p_draft_id uuid,p_scheduler_run_id uuid,p_error text)
returns void language plpgsql security definer set search_path=public as $$ begin perform public.assert_engagement_work_owner('draft',p_draft_id,p_scheduler_run_id); perform public.fail_engagement_outreach_generation(p_draft_id,p_error); end $$;
create or replace function public.complete_engagement_self_review_owned(p_review_id uuid,p_scheduler_run_id uuid,p_output_json jsonb,p_prompt_version text,p_schema_version text,p_score integer,p_confidence integer,p_approved_by_ai boolean,p_model text,p_input_tokens integer,p_output_tokens integer,p_duration_ms integer,p_response_id text)
returns void language plpgsql security definer set search_path=public as $$ begin perform public.assert_engagement_work_owner('review',p_review_id,p_scheduler_run_id); perform public.complete_engagement_self_review(p_review_id,p_output_json,p_prompt_version,p_schema_version,p_score,p_confidence,p_approved_by_ai,p_model,p_input_tokens,p_output_tokens,p_duration_ms,p_response_id); end $$;
create or replace function public.fail_engagement_self_review_owned(p_review_id uuid,p_scheduler_run_id uuid,p_error text)
returns void language plpgsql security definer set search_path=public as $$ begin perform public.assert_engagement_work_owner('review',p_review_id,p_scheduler_run_id); perform public.fail_engagement_self_review(p_review_id,p_error); end $$;


create or replace function public.record_engagement_pipeline_stage_owned(
  p_engagement_id uuid,p_scheduler_run_id uuid,p_stage text,p_state text,p_reason text default null,p_worker text default null,p_metadata jsonb default '{}'::jsonb
) returns void language plpgsql security definer set search_path=public as $$
begin
  perform public.assert_active_pipeline_scheduler_run(p_scheduler_run_id);
  perform public.record_engagement_pipeline_stage(p_engagement_id,p_scheduler_run_id,p_stage,p_state,p_reason,p_worker,p_metadata);
end $$;

-- Active-lease wrappers for deterministic engagement stages too.
create or replace function public.run_engagement_builder_owned(p_scheduler_run_id uuid) returns table("builderRunId" uuid,"schedulerRunId" uuid,status text,created integer,updated integer,cancelled integer,"readyForDraft" integer,"needsRoute" integer,"startedAt" timestamptz,"completedAt" timestamptz) language plpgsql security definer set search_path=public as $$ begin perform public.assert_active_pipeline_scheduler_run(p_scheduler_run_id); return query select * from public.run_engagement_builder(p_scheduler_run_id); end $$;
create or replace function public.sync_engagement_strategies_owned(p_scheduler_run_id uuid) returns table(updated integer,ready integer,needs_attention integer) language plpgsql security definer set search_path=public as $$ begin perform public.assert_active_pipeline_scheduler_run(p_scheduler_run_id); return query select * from public.sync_engagement_strategies(p_scheduler_run_id); end $$;
create or replace function public.sync_engagement_learning_guidance_owned(p_scheduler_run_id uuid) returns table(updated integer,mature integer) language plpgsql security definer set search_path=public as $$ begin perform public.assert_active_pipeline_scheduler_run(p_scheduler_run_id); return query select * from public.sync_engagement_learning_guidance(p_scheduler_run_id); end $$;
create or replace function public.reconcile_engagement_pipeline_failures_owned(p_scheduler_run_id uuid) returns integer language plpgsql security definer set search_path=public as $$ begin perform public.assert_active_pipeline_scheduler_run(p_scheduler_run_id); return public.reconcile_engagement_pipeline_failures(p_scheduler_run_id); end $$;
create or replace function public.run_engagement_queue_builder_owned(p_scheduler_run_id uuid) returns table(inspected integer,queued integer,held integer,already_queued integer) language plpgsql security definer set search_path=public as $$ begin perform public.assert_active_pipeline_scheduler_run(p_scheduler_run_id); return query select * from public.run_engagement_queue_builder(p_scheduler_run_id); end $$;
create or replace function public.run_engagement_learning_builder_owned(p_scheduler_run_id uuid) returns table(inspected integer,created integer,existing integer,skipped integer) language plpgsql security definer set search_path=public as $$ begin perform public.assert_active_pipeline_scheduler_run(p_scheduler_run_id); return query select * from public.run_engagement_learning_builder(p_scheduler_run_id); end $$;

-- Privilege boundary: application runtime uses only fenced worker mutations.
revoke all on function public.update_business_analysis_progress_owned(uuid,text,uuid,text,integer,text,integer) from public,anon,authenticated;
revoke all on function public.complete_business_analysis_job_owned(uuid,text,uuid,text,integer,jsonb,jsonb) from public,anon,authenticated;
revoke all on function public.fail_business_analysis_job_owned(uuid,text,uuid,text,text,boolean) from public,anon,authenticated;
revoke all on function public.assert_company_discovery_owner(uuid,uuid,boolean) from public,anon,authenticated;
revoke all on function public.update_company_discovery_progress_owned(uuid,uuid,text,integer,integer) from public,anon,authenticated;
revoke all on function public.record_discovery_activity_owned(uuid,uuid,text,text,text,jsonb) from public,anon,authenticated;
revoke all on function public.save_company_discovery_batch_owned(uuid,uuid,jsonb) from public,anon,authenticated;
revoke all on function public.finalize_company_discovery_owned(uuid,uuid,jsonb) from public,anon,authenticated;
revoke all on function public.record_company_discovery_failure_owned(uuid,uuid,text,text,boolean,text) from public,anon,authenticated;
revoke all on function public.assert_engagement_work_owner(text,uuid,uuid) from public,anon,authenticated;

grant execute on function public.update_business_analysis_progress_owned(uuid,text,uuid,text,integer,text,integer),public.complete_business_analysis_job_owned(uuid,text,uuid,text,integer,jsonb,jsonb),public.fail_business_analysis_job_owned(uuid,text,uuid,text,text,boolean) to service_role;
grant execute on function public.update_company_discovery_progress_owned(uuid,uuid,text,integer,integer),public.record_discovery_activity_owned(uuid,uuid,text,text,text,jsonb),public.save_company_discovery_batch_owned(uuid,uuid,jsonb),public.finalize_company_discovery_owned(uuid,uuid,jsonb),public.record_company_discovery_failure_owned(uuid,uuid,text,text,boolean,text) to service_role;
grant execute on function public.claim_engagement_commercial_reasoning_owned(uuid),public.claim_engagement_outreach_generation_owned(uuid),public.claim_engagement_self_review_owned(uuid),public.complete_engagement_commercial_reasoning_owned(uuid,uuid,jsonb,text,text,integer,text),public.fail_engagement_commercial_reasoning_owned(uuid,uuid,text),public.complete_engagement_outreach_generation_owned(uuid,uuid,jsonb,text,text,integer,text,integer,integer,integer,text),public.fail_engagement_outreach_generation_owned(uuid,uuid,text),public.complete_engagement_self_review_owned(uuid,uuid,jsonb,text,text,integer,integer,boolean,text,integer,integer,integer,text),public.fail_engagement_self_review_owned(uuid,uuid,text) to service_role;
grant execute on function public.run_engagement_builder_owned(uuid),public.sync_engagement_strategies_owned(uuid),public.sync_engagement_learning_guidance_owned(uuid),public.reconcile_engagement_pipeline_failures_owned(uuid),public.run_engagement_queue_builder_owned(uuid),public.run_engagement_learning_builder_owned(uuid) to service_role;



revoke all on function public.plan_contact_discovery_dispatch_owned(uuid,numeric) from public,anon,authenticated;
revoke all on function public.record_pipeline_scheduler_outcome_owned(uuid,jsonb,jsonb,jsonb) from public,anon,authenticated;
revoke all on function public.claim_company_discovery_owned(uuid) from public,anon,authenticated;
revoke all on function public.claim_contact_discovery_owned(uuid,uuid,boolean) from public,anon,authenticated;
revoke all on function public.assert_contact_discovery_owner(uuid,uuid) from public,anon,authenticated;
revoke all on function public.record_contact_discovery_failure_owned(uuid,uuid,text,text,boolean) from public,anon,authenticated;
revoke all on function public.enforce_opportunity_route_readiness(uuid) from public,anon,authenticated;
revoke all on function public.record_engagement_pipeline_stage_owned(uuid,uuid,text,text,text,text,jsonb) from public,anon,authenticated;
revoke all on function public.claim_engagement_commercial_reasoning_owned(uuid) from public,anon,authenticated;
revoke all on function public.claim_engagement_outreach_generation_owned(uuid) from public,anon,authenticated;
revoke all on function public.claim_engagement_self_review_owned(uuid) from public,anon,authenticated;
revoke all on function public.complete_engagement_commercial_reasoning_owned(uuid,uuid,jsonb,text,text,integer,text) from public,anon,authenticated;
revoke all on function public.fail_engagement_commercial_reasoning_owned(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.complete_engagement_outreach_generation_owned(uuid,uuid,jsonb,text,text,integer,text,integer,integer,integer,text) from public,anon,authenticated;
revoke all on function public.fail_engagement_outreach_generation_owned(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.complete_engagement_self_review_owned(uuid,uuid,jsonb,text,text,integer,integer,boolean,text,integer,integer,integer,text) from public,anon,authenticated;
revoke all on function public.fail_engagement_self_review_owned(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.run_engagement_builder_owned(uuid) from public,anon,authenticated;
revoke all on function public.sync_engagement_strategies_owned(uuid) from public,anon,authenticated;
revoke all on function public.sync_engagement_learning_guidance_owned(uuid) from public,anon,authenticated;
revoke all on function public.reconcile_engagement_pipeline_failures_owned(uuid) from public,anon,authenticated;
revoke all on function public.run_engagement_queue_builder_owned(uuid) from public,anon,authenticated;
revoke all on function public.run_engagement_learning_builder_owned(uuid) from public,anon,authenticated;

grant execute on function public.enforce_opportunity_route_readiness(uuid) to service_role;
grant execute on function public.plan_contact_discovery_dispatch_owned(uuid,numeric),public.record_pipeline_scheduler_outcome_owned(uuid,jsonb,jsonb,jsonb) to service_role;

-- Runtime privilege hardening. The SECURITY DEFINER wrappers above remain able
-- to call these implementation functions as their owner, while application
-- service-role code cannot accidentally regress to the unfenced entry points.
revoke execute on function public.claim_company_discovery(uuid) from service_role;
revoke execute on function public.claim_contact_discovery(uuid,uuid,boolean) from service_role;
revoke execute on function public.update_company_discovery_progress(uuid,text,integer,integer) from service_role;
revoke execute on function public.record_discovery_activity(uuid,text,text,text,jsonb) from service_role;
revoke execute on function public.save_company_discovery_batch(uuid,jsonb) from service_role;
revoke execute on function public.finalize_company_discovery(uuid,jsonb) from service_role;
revoke execute on function public.record_company_discovery_failure_v2(uuid,text,text,boolean,text) from service_role;
revoke execute on function public.update_business_analysis_progress(uuid,text,text,integer,text,integer) from service_role;
revoke execute on function public.complete_business_analysis_job(uuid,text,text,integer,jsonb,jsonb) from service_role;
revoke execute on function public.fail_business_analysis_job(uuid,text,text,text,boolean) from service_role;
revoke execute on function public.claim_engagement_commercial_reasoning(uuid) from service_role;
revoke execute on function public.claim_engagement_outreach_generation(uuid) from service_role;
revoke execute on function public.claim_engagement_self_review(uuid) from service_role;
revoke execute on function public.record_engagement_pipeline_stage(uuid,uuid,text,text,text,text,jsonb) from service_role;
revoke execute on function public.run_engagement_builder(uuid) from service_role;
revoke execute on function public.sync_engagement_strategies(uuid) from service_role;
revoke execute on function public.sync_engagement_learning_guidance(uuid) from service_role;
revoke execute on function public.reconcile_engagement_pipeline_failures(uuid) from service_role;
revoke execute on function public.run_engagement_queue_builder(uuid) from service_role;
revoke execute on function public.run_engagement_learning_builder(uuid) from service_role;

grant execute on function public.claim_company_discovery_owned(uuid),public.claim_contact_discovery_owned(uuid,uuid,boolean),public.record_engagement_pipeline_stage_owned(uuid,uuid,text,text,text,text,jsonb) to service_role;

revoke execute on function public.update_contact_discovery_progress(uuid,text,integer,integer) from service_role;
revoke execute on function public.save_route_intelligence(uuid,jsonb,jsonb,jsonb,text) from service_role;
revoke execute on function public.save_company_contact_channels(uuid,jsonb) from service_role;
revoke execute on function public.save_contact_discovery_batch(uuid,jsonb,text,jsonb,jsonb) from service_role;
revoke execute on function public.evaluate_contact_discovery_route_readiness(uuid,text,jsonb,jsonb) from service_role;
revoke execute on function public.complete_contact_discovery_without_matches(uuid,text,jsonb,jsonb) from service_role;
revoke execute on function public.finalize_contact_discovery(uuid,jsonb) from service_role;
revoke execute on function public.record_contact_discovery_failure(uuid,text,text,boolean) from service_role;
revoke execute on function public.complete_engagement_commercial_reasoning(uuid,jsonb,text,text,integer,text) from service_role;
revoke execute on function public.fail_engagement_commercial_reasoning(uuid,text) from service_role;
revoke execute on function public.complete_engagement_outreach_generation(uuid,jsonb,text,text,integer,text,integer,integer,integer,text) from service_role;
revoke execute on function public.fail_engagement_outreach_generation(uuid,text) from service_role;
revoke execute on function public.complete_engagement_self_review(uuid,jsonb,text,text,integer,integer,boolean,text,integer,integer,integer,text) from service_role;
revoke execute on function public.fail_engagement_self_review(uuid,text) from service_role;

revoke execute on function public.plan_contact_discovery_dispatch(uuid,numeric) from service_role;
revoke execute on function public.record_pipeline_scheduler_outcome(uuid,jsonb,jsonb,jsonb) from service_role;
