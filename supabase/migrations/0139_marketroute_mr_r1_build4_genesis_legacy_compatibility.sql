-- MarketRoute MR-R1 Build 4 — Genesis legacy compatibility projection.
--
-- IMPORTANT COMPATIBILITY CONTRACT:
-- public.campaign_detail keeps the exact pre-Build-4 column names and ordering.
-- No columns are added, removed, renamed, or repositioned by this migration.
-- Only the backing expressions for seller-facing identity fields change:
-- GenesisSellerContext is authoritative when present, and legacy
-- business_profiles are a historical fallback for campaigns predating Genesis
-- seller-context persistence.
--
-- Richer legacy projections (ICP, industries, buyer roles, pains, geographies,
-- offers, unknowns) are exposed through the application compatibility layer / API
-- and are intentionally NOT appended to this long-lived database view.
--
-- Frozen CKR / UDOSIB constitutional kernels are not modified.

create or replace view public.campaign_detail with (security_invoker = true) as
select
  overview.*,
  cfg.buyer_roles_json as buyer_roles,
  cfg.message_angle,
  cfg.why_json as why,
  coalesce(
    nullif(gctx.context_json #>> '{sellerUnderstanding,legacyBusinessDna,company,name}', ''),
    bp.company_name
  ) as business_name,
  coalesce(
    nullif(gctx.context_json #>> '{sellerUnderstanding,legacyBusinessDna,company,summary}', ''),
    bp.summary
  ) as business_summary,
  coalesce(
    nullif(gctx.context_json #>> '{sellerUnderstanding,legacyBusinessDna,company,website}', ''),
    bp.canonical_url
  ) as website_url,
  coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',t.id,
      'title',t.title,
      'description',t.description,
      'occurred_at',t.occurred_at
    ) order by t.occurred_at asc, t.id asc)
    from public.campaign_timeline t
    where t.campaign_id=overview.id and t.visibility='CUSTOMER'
  ),'[]'::jsonb) as timeline
from public.campaign_overview overview
join public.campaigns c on c.id=overview.id
join public.campaign_config_versions cfg on cfg.campaign_id=c.id and cfg.version_number=c.current_config_version
left join public.campaign_genesis_t8_seller_contexts gctx on gctx.campaign_id=c.id and gctx.organisation_id=c.organisation_id
left join public.business_profiles bp on bp.id=c.business_profile_id;

comment on view public.campaign_detail is 'MR-R1 Build 4 compatibility read model. Column contract is unchanged. Seller display facts prefer immutable GenesisSellerContext; legacy business_profiles are historical fallback only for campaigns predating Genesis context persistence.';
