-- Genesis G4: valid low-result searches continue automatically until at least
-- three evidence-backed companies are retained or four safe search passes are exhausted.
alter table public.discovery_sessions
  add column if not exists minimum_supported_companies integer not null default 3 check (minimum_supported_companies between 1 and 20),
  add column if not exists expansion_pass_count integer not null default 0 check (expansion_pass_count >= 0),
  add column if not exists max_expansion_passes integer not null default 4 check (max_expansion_passes between 1 and 10);

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
      stage='PREPARING',
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
    stage='COMPLETE',
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

create or replace function public.finalize_company_discovery(p_session_id uuid)
returns integer
language sql
security definer
set search_path=public
as $$
  select public.finalize_company_discovery(p_session_id,'{}'::jsonb)
$$;

revoke all on function public.finalize_company_discovery(uuid,jsonb) from public,anon,authenticated;
revoke all on function public.finalize_company_discovery(uuid) from public,anon,authenticated;
grant execute on function public.finalize_company_discovery(uuid,jsonb) to service_role;
grant execute on function public.finalize_company_discovery(uuid) to service_role;

-- Resume recent valid zero/low-result test campaigns so the new expansion loop
-- takes effect without requiring a destructive reset.
update public.discovery_sessions s
set status='QUEUED',
    job_state='QUEUED',
    stage='PREPARING',
    progress=15,
    attempt_count=0,
    expansion_pass_count=greatest(coalesce(s.expansion_pass_count,0),1),
    result_summary_json=coalesce(s.result_summary_json,'{}'::jsonb) || jsonb_build_object(
      'expansionPending',true,
      'expansionReason','MINIMUM_SUPPORTED_COMPANIES_NOT_REACHED'
    ),
    next_attempt_at=now()+interval '15 seconds',
    next_retry_at=null,
    completed_at=null,
    last_error=null,
    last_error_code=null,
    last_error_message=null,
    updated_at=now()
from public.campaigns c
where c.id=s.campaign_id
  and c.status not in ('PAUSED','CANCELLED','ARCHIVED')
  and s.updated_at>=now()-interval '24 hours'
  and coalesce(s.job_state,'') in ('NO_RESULTS','EXHAUSTED')
  and (
    select count(*) from public.companies co
    where co.organisation_id=s.organisation_id and co.campaign_id=s.campaign_id
  ) < coalesce(s.minimum_supported_companies,3);
