BEGIN;

-- MarketRoute Forensic Build 7 — Authoritative Read Model + Founder Command Centre
-- Read-only presentation architecture. Builds 1–6 remain the sole reasoning authority.
-- No historical opportunity/contact score or verification field may create readiness here.

create or replace view public.cie_current_company_truth_read with (security_invoker=true) as
select distinct on (s.entity_id)
  s.entity_id,
  e.display_name,
  e.canonical_key,
  s.id as truth_snapshot_id,
  s.truth_semantics_version,
  s.truth_index,
  s.coverage,
  s.evidence_sufficiency,
  s.review_state,
  s.probability_state,
  s.calibrated_probability_coverage,
  s.result_json,
  s.calculated_at
from public.genesis_g8_truth_v2_snapshots s
join public.genesis_g8_intelligence_entities e on e.id=s.entity_id
where e.entity_type='company'
  and e.status='ACTIVE'
  and s.truth_semantics_version='MR-TI-2-TFR1'
order by s.entity_id,s.calculated_at desc,s.id desc;

revoke all on public.cie_current_company_truth_read from public,anon,authenticated;
grant select on public.cie_current_company_truth_read to service_role;

comment on view public.cie_current_company_truth_read is
'Build 7 current-company Truth read model. Only MR-TI-2-TFR1 snapshots are exposed; evidence_sufficiency is not probability/confidence.';

create or replace view public.cie_authoritative_opportunity_read with (security_invoker=true) as
with base as (
  select
    o.id,o.organisation_id,o.campaign_id,o.company_id,o.status as workflow_status,o.rank,
    o.review_note,o.reviewed_at,o.reviewed_by,o.created_at,o.updated_at,
    ca.name as campaign_name,
    co.company_name,co.website_url as company_website_url,co.industry as company_industry,co.country as company_country,co.summary as company_summary,
    (select count(*) from public.company_evidence ce where ce.company_id=o.company_id) as company_evidence_count,
    r4.reality_id as r4_reality_id,r4.reality_state as r4_reality_state,r4.disposition as r4_disposition,
    r4.input_fingerprint as r4_input_fingerprint,r4.authority_fingerprint as r4_authority_fingerprint,
    r4.seller_context_fingerprint as r4_seller_context_fingerprint,r4.constraint_fingerprint as r4_constraint_fingerprint,
    r4.target_truth_entity_id,r4.target_truth_snapshot_id,r4.target_truth_semantics_version,
    r4.producer_version as r4_producer_version,r4.production_id as r4_production_id,
    r4.decision_json as r4_decision_json,r4.applied_at as r4_applied_at,r4.updated_at as r4_updated_at,
    r4.last_validated_at as r4_last_validated_at,r4.next_validation_at as r4_next_validation_at,r4.last_invalidation_reason as r4_last_invalidation_reason,
    r5.authority_status as r5_authority_status,r5.source_fingerprint as r5_source_fingerprint,r5.authority_fingerprint as r5_authority_fingerprint,
    r5.parent_r4_authority_fingerprint as r5_parent_r4_authority_fingerprint,r5.producer_version as r5_producer_version,
    r5.selected_route_ids as r5_selected_route_ids,r5.route_states_json as r5_route_states_json,r5.strategy_json as r5_strategy_json,r5.graph_assessment_json as r5_graph_assessment_json,
    r5.invalidation_reason as r5_invalidation_reason,r5.invalidated_at as r5_invalidated_at,r5.applied_at as r5_applied_at,r5.updated_at as r5_updated_at,
    r6.authority_status as r6_authority_status,r6.source_fingerprint as r6_source_fingerprint,r6.contact_truth_fingerprint as r6_contact_truth_fingerprint,
    r6.parent_r4_authority_fingerprint as r6_parent_r4_authority_fingerprint,r6.parent_r5_authority_fingerprint as r6_parent_r5_authority_fingerprint,
    r6.producer_version as r6_producer_version,r6.primary_contact_id as r6_primary_contact_id,r6.contact_frontier_json as r6_contact_frontier_json,
    r6.bindings_json as r6_bindings_json,r6.decision_json as r6_decision_json,r6.contact_truth_json as r6_contact_truth_json,
    r6.next_revalidation_at as r6_next_revalidation_at,r6.invalidation_reason as r6_invalidation_reason,r6.invalidated_at as r6_invalidated_at,
    r6.applied_at as r6_applied_at,r6.updated_at as r6_updated_at,
    ts.truth_index as authority_truth_index,ts.coverage as authority_truth_coverage,ts.evidence_sufficiency as authority_evidence_sufficiency,
    ts.review_state as authority_truth_review_state,ts.probability_state as authority_probability_state,ts.calculated_at as authority_truth_calculated_at,
    rr.commercial_route_id,rr.commercial_route_type,rr.commercial_route_label,rr.commercial_route_entry_role,rr.commercial_route_target_role,
    rr.commercial_route_department,rr.commercial_route_contact_name,rr.commercial_route_contact_role,rr.commercial_route_channel_type,
    rr.commercial_route_channel_value,rr.commercial_route_rationale,rr.commercial_route_next_step,rr.commercial_route_count,
    rr.commercial_route_evidence_count,rr.commercial_routes,rr.commercial_route_evidence,
    ct.full_name as r6_contact_name,ct.role_title as r6_contact_role,ct.department as r6_contact_department,ct.location as r6_contact_location,
    ct.email_address as r6_contact_email,ct.linkedin_profile_url as r6_contact_linkedin_url,
    coalesce((select count(*) from public.contact_evidence cte where cte.contact_id=r6.primary_contact_id),0) as current_contact_evidence_count,
    coalesce((select count(*) from public.cie_r7_research_directives rd where rd.opportunity_id=o.id and rd.status='ACTIVE'),0) as active_research_count,
    coalesce((select jsonb_agg(jsonb_build_object('claimKey',rd.claim_key,'impactClass',rd.impact_class,'orderIndex',rd.order_index) order by rd.impact_precedence desc,rd.order_index,rd.claim_key)
      from public.cie_r7_research_directives rd where rd.opportunity_id=o.id and rd.status='ACTIVE'),'[]'::jsonb) as active_research_json,
    inv.authority_layer as latest_invalidation_layer,inv.reason as latest_invalidation_reason,inv.created_at as latest_invalidation_at
  from public.opportunities o
  join public.campaigns ca on ca.id=o.campaign_id and ca.organisation_id=o.organisation_id
  join public.companies co on co.id=o.company_id and co.campaign_id=o.campaign_id and co.organisation_id=o.organisation_id
  left join public.cie_r4_commercial_decisions r4 on r4.opportunity_id=o.id
  left join public.cie_r5_route_decisions r5 on r5.opportunity_id=o.id
  left join public.cie_r6_contact_decisions r6 on r6.opportunity_id=o.id
  left join public.genesis_g8_truth_v2_snapshots ts on ts.id=r4.target_truth_snapshot_id and ts.entity_id=r4.target_truth_entity_id and ts.truth_semantics_version='MR-TI-2-TFR1'
  left join public.cie_r5_route_authority_read rr on rr.opportunity_id=o.id
  left join public.contacts ct on ct.id=r6.primary_contact_id and ct.organisation_id=o.organisation_id and ct.campaign_id=o.campaign_id and ct.company_id=o.company_id
  left join lateral (
    select ev.authority_layer,ev.reason,ev.created_at
    from public.cie_authority_invalidation_events ev
    where ev.opportunity_id=o.id
    order by ev.created_at desc,ev.id desc
    limit 1
  ) inv on true
), flags as (
  select b.*,
    (b.r4_authority_fingerprint ~ '^[0-9a-f]{64}$'
      and b.target_truth_semantics_version='MR-TI-2-TFR1'
      and b.r4_applied_at is not null
      and b.r4_updated_at is not null
      and b.authority_truth_calculated_at is not null
      and b.r4_producer_version='MR-T8-FB3-1.0.0'
      and b.r4_production_id is not null
    ) as r4_current,
    (b.r5_authority_status='ACTIVE'
      and b.r5_producer_version='MR-T8-FB5-R5-1.0.0'
      and b.r5_authority_fingerprint ~ '^[0-9a-f]{64}$'
      and b.r5_parent_r4_authority_fingerprint=b.r4_authority_fingerprint
      and b.r5_applied_at is not null
    ) as r5_current,
    (b.r6_authority_status='ACTIVE'
      and b.r6_producer_version='MR-T8-FB6-R6-1.0.0'
      and b.r6_contact_truth_fingerprint ~ '^[0-9a-f]{64}$'
      and b.r6_parent_r4_authority_fingerprint=b.r4_authority_fingerprint
      and b.r6_parent_r5_authority_fingerprint=b.r5_authority_fingerprint
      and b.r6_applied_at is not null
      and (b.r6_primary_contact_id is null or (b.r6_next_revalidation_at is not null and b.r6_next_revalidation_at>now()))
    ) as r6_current
  from base b
), classified as (
  select f.*,
    case
      when f.r4_reality_id is null then 'AWAITING_COMMERCIAL_REALITY'
      when not f.r4_current then 'COMMERCIAL_AUTHORITY_STALE'
      when f.r4_disposition='REJECT' then 'REJECTED'
      when f.r4_disposition='HOLD_TEMPORAL' then 'TEMPORAL_HOLD'
      when f.r4_disposition='RESEARCH_REQUIRED' then 'RESEARCH_REQUIRED'
      when f.r4_disposition='COMMERCIAL_CANDIDATE' and f.r5_authority_status='STALE' then 'ROUTE_STALE'
      when f.r4_disposition='COMMERCIAL_CANDIDATE' and not f.r5_current then 'ROUTE_UNRESOLVED'
      when f.r4_disposition='COMMERCIAL_CANDIDATE' and f.r6_authority_status='STALE' then 'CONTACT_STALE'
      when f.r4_disposition='COMMERCIAL_CANDIDATE' and not f.r6_current then 'CONTACT_UNRESOLVED'
      when f.r4_disposition='COMMERCIAL_CANDIDATE' and f.r6_current then 'READY'
      else 'COMMERCIAL_AUTHORITY_STALE'
    end as authority_state
  from flags f
)
select
  c.id,c.organisation_id,c.campaign_id,c.company_id,
  case when c.r6_current then c.r6_primary_contact_id else null end as primary_contact_id,
  c.workflow_status as status,
  null::integer as opportunity_score,null::integer as company_fit,null::integer as operational_fit,null::integer as buying_authority,
  null::integer as contactability,null::integer as route_quality,null::integer as route_confidence,null::text as recommended_entry_strategy,
  null::integer as commercial_value,null::integer as evidence_quality,null::integer as urgency,
  null::text as buying_reason,null::text as operational_pain,
  case c.authority_state
    when 'READY' then 'Review the current CIE-authorised commercial case and execution path.'
    when 'RESEARCH_REQUIRED' then 'Continue decision-critical research before review.'
    when 'TEMPORAL_HOLD' then 'Wait for the temporal constraint to resolve, then revalidate.'
    when 'REJECTED' then 'Do not prioritise this commercial reality under current evidence.'
    when 'ROUTE_STALE' then 'Revalidate the commercial route before engagement.'
    when 'CONTACT_STALE' then 'Revalidate current contact authority before engagement.'
    when 'ROUTE_UNRESOLVED' then 'Continue relationship and route research.'
    when 'CONTACT_UNRESOLVED' then 'Resolve a Truth-qualified contact or organisational binding.'
    else 'Continue evidence-led commercial reasoning.' end as recommended_action,
  null::jsonb as score_explanation_json,'cie-fb7-authoritative-read-model'::text as scoring_version,null::timestamptz as scored_at,
  c.review_note,c.reviewed_at,c.reviewed_by,c.rank,c.created_at,c.updated_at,
  c.campaign_name,c.company_name,c.company_website_url,c.company_industry,c.company_country,c.company_summary,
  null::integer as company_confidence,
  case when c.r6_current then c.r6_contact_name else null end as primary_contact_name,
  case when c.r6_current then c.r6_contact_role else null end as primary_contact_role,
  case when c.r6_current then c.r6_contact_department else null end as primary_contact_department,
  case when c.r6_current then c.r6_contact_location else null end as primary_contact_location,
  null::text as contact_reason_selected,null::integer as primary_contact_confidence,null::text as primary_contact_review_status,
  case when c.r6_current then c.r6_contact_email else null end as primary_contact_email,
  null::text as primary_contact_email_status,
  case when c.r6_current then c.r6_contact_linkedin_url else null end as primary_contact_linkedin_url,
  c.company_evidence_count,
  case when c.r6_current then c.current_contact_evidence_count else 0 end as contact_evidence_count,
  null::uuid as primary_route_id,null::text as primary_route_email,null::text as primary_route_verification_status,null::integer as primary_route_score,
  null::integer as primary_route_confidence,null::integer as primary_route_response_likelihood,null::integer as primary_route_campaign_relevance,
  null::text as primary_route_channel_type,0::bigint as available_route_count,null::text as primary_route_likely_reader,null::text as primary_route_reason,null::text as primary_route_source_url,
  case when c.r5_current then c.commercial_route_id else null end as commercial_route_id,
  case when c.r5_current then c.commercial_route_type else null end as commercial_route_type,
  case when c.r5_current then c.commercial_route_label else null end as commercial_route_label,
  case when c.r5_current then c.commercial_route_entry_role else null end as commercial_route_entry_role,
  case when c.r5_current then c.commercial_route_target_role else null end as commercial_route_target_role,
  case when c.r5_current then c.commercial_route_department else null end as commercial_route_department,
  case when c.r5_current then c.commercial_route_contact_name else null end as commercial_route_contact_name,
  case when c.r5_current then c.commercial_route_contact_role else null end as commercial_route_contact_role,
  case when c.r5_current then c.commercial_route_channel_type else null end as commercial_route_channel_type,
  case when c.r5_current then c.commercial_route_channel_value else null end as commercial_route_channel_value,
  null::integer as commercial_route_quality,null::integer as commercial_route_confidence,null::integer as commercial_route_authority,
  null::integer as commercial_route_accessibility,null::integer as commercial_route_evidence_quality,null::integer as commercial_route_resilience,
  null::text as commercial_route_difficulty,
  case when c.r5_current then c.commercial_route_rationale else null end as commercial_route_rationale,
  case when c.r5_current then c.commercial_route_next_step else null end as commercial_route_next_step,
  case when c.r5_current then c.commercial_route_count else 0::bigint end as commercial_route_count,
  case when c.r5_current then c.commercial_route_evidence_count else 0::bigint end as commercial_route_evidence_count,
  null::jsonb as organisation_map,null::jsonb as buying_paths,
  c.authority_state,
  (c.authority_state='READY') as authority_ready,
  (c.r4_current and (c.r4_disposition<>'COMMERCIAL_CANDIDATE' or (c.r5_current and c.r6_current))) as authority_current,
  ((c.authority_state='READY' and c.workflow_status not in ('READY','APPROVED','REJECTED','ENGAGED')) or
   (c.authority_state<>'READY' and c.workflow_status in ('READY','APPROVED'))) as workflow_authority_mismatch,
  c.r4_current,c.r5_current,c.r6_current,
  c.r4_reality_id,c.r4_reality_state,c.r4_disposition,c.r4_input_fingerprint,c.r4_authority_fingerprint,
  c.r4_seller_context_fingerprint,c.r4_constraint_fingerprint,c.target_truth_entity_id,c.target_truth_snapshot_id,c.target_truth_semantics_version,
  c.r4_producer_version,c.r4_production_id,c.r4_decision_json,c.r4_last_validated_at,c.r4_next_validation_at,c.r4_last_invalidation_reason,c.r4_updated_at,
  c.r5_authority_status,c.r5_producer_version,c.r5_source_fingerprint,c.r5_authority_fingerprint,c.r5_selected_route_ids,c.r5_route_states_json,c.r5_strategy_json,c.r5_graph_assessment_json,
  c.r5_invalidation_reason,c.r5_invalidated_at,c.r5_updated_at,
  c.r6_authority_status,c.r6_producer_version,c.r6_source_fingerprint,c.r6_contact_truth_fingerprint,c.r6_contact_truth_json,c.r6_contact_frontier_json,c.r6_bindings_json,c.r6_decision_json,
  c.r6_next_revalidation_at,c.r6_invalidation_reason,c.r6_invalidated_at,c.r6_updated_at,
  c.authority_truth_index,c.authority_truth_coverage,c.authority_evidence_sufficiency,c.authority_truth_review_state,c.authority_probability_state,c.authority_truth_calculated_at,
  c.active_research_count,c.active_research_json,c.latest_invalidation_layer,c.latest_invalidation_reason,c.latest_invalidation_at,
  case when c.r5_current then c.commercial_routes else '[]'::jsonb end as commercial_routes,
  case when c.r5_current then c.commercial_route_evidence else '[]'::jsonb end as commercial_route_evidence
from classified c;

revoke all on public.cie_authoritative_opportunity_read from public,anon,authenticated;
grant select on public.cie_authoritative_opportunity_read to service_role;

comment on view public.cie_authoritative_opportunity_read is
'Build 7 canonical opportunity presentation model. READY requires current fingerprint-linked R4 (FB3), R5 (FB5), and R6 Contact Truth (FB6). Legacy opportunity/contact/route scores are emitted NULL and have no presentation authority.';

create or replace view public.cie_authoritative_opportunity_detail_read with (security_invoker=true) as
select
  ar.*,
  coalesce((select jsonb_agg(jsonb_build_object(
    'id',ce.id,'claim',ce.claim,'sourceUrl',ce.source_url,'sourceTitle',ce.source_title,'excerpt',ce.excerpt,'createdAt',ce.created_at
  ) order by ce.created_at,ce.id) from public.company_evidence ce where ce.company_id=ar.company_id),'[]'::jsonb) as company_evidence,
  coalesce((select jsonb_agg(jsonb_build_object(
    'id',cte.id,'evidenceType',cte.evidence_type,'claim',cte.claim,'sourceUrl',cte.source_url,'sourceTitle',cte.source_title,'excerpt',cte.excerpt,
    'sourceKind',cte.source_kind,'sourceDomain',cte.source_domain,'retrievedAt',cte.retrieved_at,'sourcePublishedAt',cte.source_published_at,'truthPolarity',cte.truth_polarity,'createdAt',cte.created_at
  ) order by cte.created_at,cte.id) from public.contact_evidence cte where cte.contact_id=ar.primary_contact_id),'[]'::jsonb) as contact_evidence,
  coalesce((select jsonb_agg(jsonb_build_object(
    'id',h.id,'eventType',h.event_type,'previousStatus',h.previous_status,'nextStatus',h.next_status,'previousRank',h.previous_rank,'nextRank',h.next_rank,
    'metadata',h.metadata_json,'occurredAt',h.occurred_at
  ) order by h.occurred_at desc,h.id desc) from public.opportunity_history h where h.opportunity_id=ar.id),'[]'::jsonb) as history,
  coalesce((select jsonb_agg(jsonb_build_object(
    'id',ev.id,'authorityLayer',ev.authority_layer,'previousFingerprint',ev.previous_fingerprint,'nextFingerprint',ev.next_fingerprint,
    'reason',ev.reason,'metadata',ev.metadata_json,'invalidatedAt',ev.created_at
  ) order by ev.created_at desc,ev.id desc) from public.cie_authority_invalidation_events ev where ev.opportunity_id=ar.id),'[]'::jsonb) as authority_history
from public.cie_authoritative_opportunity_read ar;

revoke all on public.cie_authoritative_opportunity_detail_read from public,anon,authenticated;
grant select on public.cie_authoritative_opportunity_detail_read to service_role;

comment on view public.cie_authoritative_opportunity_detail_read is
'Build 7 detail read model. Evidence and invalidation history are attached to the same current R4/R5/R6 authority lineage; historical scoring views are not consulted.';

notify pgrst, 'reload schema';
COMMIT;
