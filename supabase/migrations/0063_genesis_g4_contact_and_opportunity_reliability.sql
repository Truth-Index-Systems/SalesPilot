-- Genesis G4: Contact + Opportunity reliability pass.
-- Company Discovery is frozen; this migration does not alter company discovery.
--
-- Root cause fixed here:
-- G4.3 rebuilt opportunity_detail without the evidence arrays consumed by the
-- opportunity detail page. Restore those arrays at the end of the existing view
-- contract so the server component can render evidence safely.

create or replace view public.opportunity_detail with (security_invoker=true) as
select
  ov.*,
  co.summary as company_summary,
  ct.reason_selected as contact_reason_selected,
  ct.department as primary_contact_department,
  ct.location as primary_contact_location,
  coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',h.id,'eventType',h.event_type,'previousStatus',h.previous_status,
      'nextStatus',h.next_status,'previousRank',h.previous_rank,'nextRank',h.next_rank,
      'metadata',h.metadata_json,'occurredAt',h.occurred_at
    ) order by h.occurred_at desc)
    from public.opportunity_history h where h.opportunity_id=ov.id
  ),'[]'::jsonb) as history,
  coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',ce.id,'claim',ce.claim,'sourceUrl',ce.source_url,'sourceTitle',ce.source_title,
      'excerpt',ce.excerpt,'sourceDomain',ce.source_domain,'verified',ce.verified,
      'excerptMatched',ce.excerpt_matched,
      'qualityScore',case when ce.excerpt_matched then 100 when ce.verified then 80 else 40 end,
      'createdAt',ce.created_at
    ) order by
      case when ce.excerpt_matched then 100 when ce.verified then 80 else 40 end desc,
      ce.created_at)
    from public.company_evidence ce where ce.company_id=ov.company_id
  ),'[]'::jsonb) as company_evidence,
  coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',cte.id,'evidenceType',cte.evidence_type,'claim',cte.claim,'sourceUrl',cte.source_url,
      'sourceTitle',cte.source_title,'excerpt',cte.excerpt,'sourceKind',cte.source_kind,
      'verified',cte.verified,'excerptMatched',cte.excerpt_matched,'qualityScore',cte.quality_score,
      'createdAt',cte.created_at
    ) order by cte.quality_score desc,cte.created_at)
    from public.contact_evidence cte where cte.contact_id=ov.primary_contact_id
  ),'[]'::jsonb) as contact_evidence
from public.opportunity_overview ov
join public.companies co on co.id=ov.company_id
left join public.contacts ct on ct.id=ov.primary_contact_id;

-- Contact Discovery was executing, but sessions affected by the v3 parser-contract
-- mismatch may already have consumed several retry attempts or reached the claim cap.
-- Requeue only schema-output failures for still-approved/live companies. Preserve
-- route expansion progress and previously persisted route/contact evidence.
update public.contact_discovery_sessions cs set
  status='QUEUED',
  job_state='QUEUED',
  stage=case when coalesce(cs.route_expansion_pass,0)>0 then 'EXPANDING' else 'PREPARING' end,
  progress=case when coalesce(cs.route_expansion_pass,0)>0 then 45 else 0 end,
  attempt_count=0,
  next_attempt_at=now(),
  next_retry_at=now(),
  lease_expires_at=null,
  claimed_at=null,
  scheduler_run_id=null,
  result_status=null,
  last_error=null,
  last_error_code=null,
  last_error_message=null,
  updated_at=now()
from public.companies co
join public.campaigns ca on ca.id=co.campaign_id and ca.organisation_id=co.organisation_id
where cs.company_id=co.id
  and cs.campaign_id=co.campaign_id
  and cs.organisation_id=co.organisation_id
  and co.review_status='APPROVED'
  and ca.status not in ('PAUSED','CANCELLED','ARCHIVED','FAILED')
  and cs.status='FAILED'
  and cs.last_error_code='INVALID_AI_OUTPUT';
