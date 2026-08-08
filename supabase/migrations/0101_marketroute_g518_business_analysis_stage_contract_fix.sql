-- MarketRoute G5.1.8 — Business Analysis stage contract compatibility fix.
-- G5.1.6/G5.1.7 decomposed Business Analysis into truthful persisted stages,
-- but the original S6 table constraint still allowed only the legacy vocabulary.
-- Expand the database contract without removing legacy values so existing jobs
-- remain valid during rolling deploys and retries.

alter table public.business_analysis_jobs
  drop constraint if exists business_analysis_jobs_stage_check;

alter table public.business_analysis_jobs
  add constraint business_analysis_jobs_stage_check check (
    stage in (
      -- Legacy stages retained for persisted/in-flight jobs.
      'QUEUED',
      'READING_WEBSITE',
      'ANALYSING_BUSINESS',
      'PREPARING_RECOMMENDATIONS',
      'COMPLETE',
      'FAILED',

      -- MarketRoute decomposed Business Analysis stages.
      'WEBSITE_CONNECTED',
      'BUILDING_BUSINESS_DNA',
      'BUSINESS_DNA_READY',
      'GROWTH_STRATEGY_RUNNING'
    )
  );
