-- Genesis G4: make the minimum-result expansion policy universal.
-- Every active Company Discovery cycle, regardless of campaign age or whether it
-- is the first run, continues until three supported companies are retained or
-- four evidence-preserving search passes are exhausted.

update public.discovery_sessions
set minimum_supported_companies = 3,
    max_expansion_passes = 4,
    updated_at = now()
where minimum_supported_companies is distinct from 3
   or max_expansion_passes is distinct from 4;

-- Resume any active historical campaign that stopped below the universal target
-- before exhausting its available expansion passes. Deliberately no recency
-- condition is used: this policy applies to all active campaigns, not only the
-- onboarding run or campaigns created in the last 24 hours.
update public.discovery_sessions s
set status = 'QUEUED',
    job_state = 'QUEUED',
    stage = 'PREPARING',
    progress = 15,
    attempt_count = 0,
    result_summary_json = coalesce(s.result_summary_json, '{}'::jsonb) || jsonb_build_object(
      'expansionPending', true,
      'expansionReason', 'MINIMUM_SUPPORTED_COMPANIES_NOT_REACHED',
      'universalExpansionPolicy', true
    ),
    next_attempt_at = now() + interval '15 seconds',
    next_retry_at = null,
    completed_at = null,
    last_error = null,
    last_error_code = null,
    last_error_message = null,
    updated_at = now()
from public.campaigns c
where c.id = s.campaign_id
  and c.status not in ('PAUSED', 'CANCELLED', 'ARCHIVED')
  and coalesce(s.expansion_pass_count, 0) < coalesce(s.max_expansion_passes, 4)
  and coalesce(s.job_state, '') in ('NO_RESULTS', 'EXHAUSTED', 'COMPLETED')
  and (
    select count(*)
    from public.companies co
    where co.organisation_id = s.organisation_id
      and co.campaign_id = s.campaign_id
  ) < coalesce(s.minimum_supported_companies, 3);
