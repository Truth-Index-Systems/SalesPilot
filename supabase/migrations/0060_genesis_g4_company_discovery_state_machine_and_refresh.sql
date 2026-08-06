-- Genesis G4: explicit Company Discovery state machine.
-- Business outcomes (too few companies) use EXPANDING; only technical exceptions use TECHNICAL_RETRY.

create or replace function public.record_company_discovery_failure_v2(
  p_session_id uuid,
  p_error_code text,
  p_error_message text,
  p_retryable boolean,
  p_failure_phase text
) returns void language plpgsql security definer set search_path=public as $$
declare
  v_attempt integer;
  v_delay interval;
  v_phase text:=upper(coalesce(nullif(trim(p_failure_phase),''),'PREPARING'));
begin
  select attempt_count into v_attempt from public.discovery_sessions where id=p_session_id for update;
  v_delay:=case
    when not p_retryable then null
    when v_attempt<=1 then interval '30 seconds'
    when v_attempt=2 then interval '2 minutes'
    else null
  end;

  update public.discovery_sessions set
    status='FAILED',
    job_state=case when v_delay is null then 'FAILED_TERMINAL' else 'FAILED_RETRYABLE' end,
    stage=case when v_delay is null then 'NEEDS_ATTENTION' else 'TECHNICAL_RETRY' end,
    progress=case when v_phase in ('PREPARING','PLANNING') then 15 else greatest(coalesce(progress,0),25) end,
    last_error=left(p_error_code,1000),
    last_error_code=left(p_error_code,100),
    last_error_message=left(p_error_message,1000),
    result_summary_json=coalesce(result_summary_json,'{}'::jsonb) || jsonb_build_object(
      'technicalFailure',true,
      'failurePhase',v_phase,
      'expansionPending',false
    ),
    next_retry_at=case when v_delay is null then null else now()+v_delay end,
    next_attempt_at=case when v_delay is null then null else now()+v_delay end,
    lease_expires_at=null,
    claimed_at=null,
    updated_at=now()
  where id=p_session_id;
end $$;

-- Compatibility wrapper retained for older callers.
create or replace function public.record_company_discovery_failure(
  p_session_id uuid,
  p_error_code text,
  p_error_message text,
  p_retryable boolean
) returns void language sql security definer set search_path=public as $$
  select public.record_company_discovery_failure_v2(p_session_id,p_error_code,p_error_message,p_retryable,'PREPARING')
$$;

revoke all on function public.record_company_discovery_failure_v2(uuid,text,text,boolean,text) from public,anon,authenticated;
grant execute on function public.record_company_discovery_failure_v2(uuid,text,text,boolean,text) to service_role;
revoke all on function public.record_company_discovery_failure(uuid,text,text,boolean) from public,anon,authenticated;
grant execute on function public.record_company_discovery_failure(uuid,text,text,boolean) to service_role;

-- Ensure queued expansion is visibly a business continuation, never a retry.
update public.discovery_sessions
set stage='EXPANDING',
    next_retry_at=null,
    result_summary_json=coalesce(result_summary_json,'{}'::jsonb) || jsonb_build_object('technicalFailure',false)
where job_state='QUEUED'
  and coalesce(result_summary_json->>'expansionPending','false')='true';

-- Repair active retry rows created by older functions so the UI can explain the phase truthfully.
update public.discovery_sessions
set stage='TECHNICAL_RETRY',
    result_summary_json=coalesce(result_summary_json,'{}'::jsonb) || jsonb_build_object(
      'technicalFailure',true,
      'failurePhase',coalesce(result_summary_json->>'failurePhase','PREPARING')
    )
where job_state='FAILED_RETRYABLE';


-- Recreate finalisation with explicit business states.
create or replace function public.finalize_company_discovery(
  p_session_id uuid,
  p_result_summary jsonb
) returns integer
language plpgsql
security definer
set search_path=public
as $$
declare
  s public.discovery_sessions%rowtype;
  v_total integer;
  v_new integer;
  v_next_pass integer;
  v_target integer;
  v_max_passes integer;
  v_summary jsonb;
begin
  select * into s
  from public.discovery_sessions
  where id=p_session_id
  for update;

  if s.id is null then raise exception 'discovery session missing'; end if;

  select count(*) into v_total
  from public.companies
  where organisation_id=s.organisation_id
    and campaign_id=s.campaign_id;

  v_new:=greatest(v_total-coalesce(s.cycle_baseline_company_count,0),0);
  v_next_pass:=coalesce(s.expansion_pass_count,0)+1;
  v_target:=greatest(coalesce(s.minimum_supported_companies,3),1);
  v_max_passes:=greatest(coalesce(s.max_expansion_passes,4),1);
  v_summary:=coalesce(p_result_summary,'{}'::jsonb)
    || jsonb_build_object(
      'companyCount',v_total,
      'newCompanyCount',v_new,
      'searchPass',v_next_pass,
      'minimumSupportedCompanies',v_target,
      'maxExpansionPasses',v_max_passes
    );

  if v_total < v_target and v_next_pass < v_max_passes then
    update public.discovery_sessions set
      status='QUEUED',
      job_state='QUEUED',
      stage='EXPANDING',
      progress=15,
      candidates_found=0,
      recommendations_saved=v_total,
      attempt_count=0,
      expansion_pass_count=v_next_pass,
      last_cycle_new_companies=v_new,
      consecutive_empty_cycles=case when v_new>0 then 0 else coalesce(consecutive_empty_cycles,0)+1 end,
      last_error=null,
      last_error_code=null,
      last_error_message=null,
      result_summary_json=v_summary || jsonb_build_object(
        'expansionPending',true,
        'expansionReason','MINIMUM_SUPPORTED_COMPANIES_NOT_REACHED'
      ),
      next_attempt_at=now()+interval '15 seconds',
      next_retry_at=null,
      completed_at=null,
      claimed_at=null,
      heartbeat_at=now(),
      last_heartbeat_at=now(),
      lease_expires_at=null,
      updated_at=now()
    where id=s.id;

    perform public.record_discovery_activity(
      s.id,
      'DISCOVERY_EXPANDING',
      'SalesPilot is expanding the search',
      'This search pass retained fewer than three supported companies, so SalesPilot is automatically exploring another commercial angle without weakening the evidence standard.',
      jsonb_build_object(
        'companyCount',v_total,
        'targetCompanyCount',v_target,
        'completedPass',v_next_pass,
        'nextPass',v_next_pass+1,
        'maxPasses',v_max_passes,
        'nextAttemptAt',now()+interval '15 seconds'
      )
    );

    insert into public.campaign_timeline(
      organisation_id,campaign_id,event_type,title,description,visibility,metadata_json
    ) values(
      s.organisation_id,
      s.campaign_id,
      'COMPANY_DISCOVERY_EXPANDING',
      'Company search expanding',
      'SalesPilot retained too few supported matches from this pass and is automatically widening the research.',
      'CUSTOMER',
      jsonb_build_object('companyCount',v_total,'targetCompanyCount',v_target,'nextPass',v_next_pass+1)
    );

    return v_total;
  end if;

  update public.discovery_sessions set
    status='COMPLETED',
    job_state=case when v_total>=v_target then 'COMPLETED' else 'EXHAUSTED' end,
    stage='READY',
    progress=100,
    recommendations_saved=v_total,
    expansion_pass_count=v_next_pass,
    last_cycle_new_companies=v_new,
    consecutive_empty_cycles=case when v_new>0 then 0 else coalesce(consecutive_empty_cycles,0)+1 end,
    top_up_not_before=case when v_total>=v_target then null else now()+interval '12 hours' end,
    result_summary_json=v_summary || jsonb_build_object(
      'expansionPending',false,
      'searchExhausted',v_total<v_target,
      'minimumReached',v_total>=v_target
    ),
    completed_at=now(),
    heartbeat_at=now(),
    last_heartbeat_at=now(),
    claimed_at=null,
    lease_expires_at=null,
    next_attempt_at=null,
    next_retry_at=null,
    updated_at=now()
  where id=s.id;

  update public.campaigns
  set status='READY',updated_at=now()
  where id=s.campaign_id;

  if v_total>=v_target then
    perform public.record_discovery_activity(
      s.id,
      'DISCOVERY_COMPLETE',
      v_total||' companies ready for review',
      'SalesPilot retained enough evidence-backed commercial matches to continue the campaign.',
      jsonb_build_object('companyCount',v_total,'searchPasses',v_next_pass,'targetCompanyCount',v_target)
    );
  else
    perform public.record_discovery_activity(
      s.id,
      'DISCOVERY_EXHAUSTED',
      'Extended search completed',
      'SalesPilot completed every safe search pass without finding three supported matches. No weak recommendations were added.',
      jsonb_build_object('companyCount',v_total,'searchPasses',v_next_pass,'targetCompanyCount',v_target)
    );
  end if;

  return v_total;
end $$;

