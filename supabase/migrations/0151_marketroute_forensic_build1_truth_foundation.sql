-- MarketRoute Forensic Build 1 — Truth Foundation Repair
-- Additive epistemic metadata. Historical snapshots remain immutable.
-- IMPORTANT DEPLOYMENT ORDER: apply this migration before deploying the Build 1 application code.

alter table public.genesis_g8_truth_v2_snapshots
  add column if not exists truth_semantics_version text not null default 'MR-TI-2-LEGACY',
  add column if not exists evidence_sufficiency double precision check (evidence_sufficiency is null or evidence_sufficiency between 0 and 99.9),
  add column if not exists calibrated_probability_coverage double precision check (calibrated_probability_coverage is null or calibrated_probability_coverage between 0 and 100),
  add column if not exists probability_state text check (probability_state is null or probability_state in ('UNCALIBRATED','PARTIALLY_CALIBRATED','EMPIRICALLY_CALIBRATED'));

comment on column public.genesis_g8_truth_v2_snapshots.truth_semantics_version is
'Forensic epistemic semantics version. MR-TI-2-TFR1 separates evidence balance, evidence sufficiency, and empirically calibrated probability.';
comment on column public.genesis_g8_truth_v2_snapshots.evidence_sufficiency is
'Independent quantity-of-evidence measure for represented claims. It is not truth probability.';
comment on column public.genesis_g8_truth_v2_snapshots.represented_confidence is
'Legacy compatibility column. For MR-TI-2-TFR1 snapshots this mirrors evidence_sufficiency; do not interpret it as probability.';
comment on column public.genesis_g8_truth_v2_snapshots.calibrated_probability_coverage is
'Percentage of represented claim weight backed by an empirical truth calibration profile.';
comment on column public.genesis_g8_truth_v2_snapshots.probability_state is
'Whether represented claim truth probabilities are uncalibrated, partially calibrated, or empirically calibrated.';

-- The historic helper name is retained so old callers fail conservatively instead of breaking,
-- but it now returns a value ONLY when the claim explicitly carries an empirically calibrated probability.
create or replace function public.mrti2_result_claim_probability(p_result jsonb,p_claim_key text)
returns double precision language sql immutable parallel safe as $$
  select (select (item->>'truthProbability')::double precision * 100
    from jsonb_array_elements(coalesce(p_result->'diagnostics'->'contributions','[]'::jsonb)) item
    where item->>'claimKey'=p_claim_key
      and coalesce((item->>'represented')::boolean,false)
      and item->>'probabilityState'='EMPIRICALLY_CALIBRATED'
      and item->>'truthProbability' is not null
    limit 1);
$$;

create or replace function public.mrti2_result_claim_evidence_balance(p_result jsonb,p_claim_key text)
returns double precision language sql immutable parallel safe as $$
  select (select (item->>'evidenceBalance')::double precision * 100
    from jsonb_array_elements(coalesce(p_result->'diagnostics'->'contributions','[]'::jsonb)) item
    where item->>'claimKey'=p_claim_key
      and coalesce((item->>'represented')::boolean,false)
      and item->>'evidenceBalance' is not null
    limit 1);
$$;

revoke all on function public.mrti2_result_claim_probability(jsonb,text) from public,anon,authenticated;
revoke all on function public.mrti2_result_claim_evidence_balance(jsonb,text) from public,anon,authenticated;
grant execute on function public.mrti2_result_claim_probability(jsonb,text) to service_role;
grant execute on function public.mrti2_result_claim_evidence_balance(jsonb,text) to service_role;

comment on function public.mrti2_result_claim_probability(jsonb,text) is
'Returns calibrated claim truth probability only. Uncalibrated evidence returns NULL; evidence balance is not silently relabelled as probability.';
comment on function public.mrti2_result_claim_evidence_balance(jsonb,text) is
'Returns the directional evidence balance for compatibility/read models. This value is not a truth probability.';
