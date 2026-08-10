# MarketRoute MR-R1 Build 8 — Hardening Patch

Status: FREEZE CANDIDATE

## Scope

Closes the two blockers found by the MR-R1 Build 8 audit without modifying frozen CE-R1 or CE-R2.

## Blocker 1 — final deterministic ranking

Evidence/source normalisation can change contact evidence quality and route confidence after structured-output canonicalisation. Build 8 establishes one final deterministic authority pass immediately after normalisation and immediately before persistence.

- contact overall + label are recomputed by `deterministicContactOverall` / `deterministicConfidenceLabel`;
- company-channel routing scores are recomputed by `deterministicChannelRouting`;
- routes are re-ordered by `deterministicRouteOrderingScore` after final evidence/confidence values exist;
- the competing formula previously embedded in `normalise.ts` is removed.

## Blocker 2 — historical campaign compatibility

`getCampaign()` now catches only `GENESIS_SELLER_CONTEXT_NOT_FOUND` and, only for the presentation read model, consumes the historical seller fields already returned by `campaign_detail`. Database/integrity/version errors still fail closed. Execution stages continue to use strict `loadGenesisSellerContext()` and therefore cannot silently execute without Genesis.

## Route semantic hardening

New AI route research may no longer label routes `PRIMARY` or `FALLBACK`. Those are authoritative ordering concepts, not semantic research categories. New model output is constrained to OPERATIONAL, TRANSFORMATION, PROCUREMENT, TECHNICAL, EXECUTIVE or REGIONAL. Legacy background output using priority labels is neutralised to OPERATIONAL at canonicalisation; SQL `is_primary` remains deterministic authority.

## Build 6 RLS hardening

Migration 0142 aligns completeness reads with neighbouring Genesis integration tables by requiring ACTIVE organisation membership and adds JSON/fingerprint checks at the immutable persistence boundary.

## Regression maintenance

Superseded responsibility/G5 validators were updated for decomposed Business Analysis, Speed R3 governed parallelism, current outreach prompt v5 and current approved-state UI copy. Build 8 adds a dedicated freeze-hardening validator exercising the actual final persistence path and historical fallback boundary.

## Freeze rule

CE-R1 and CE-R2 are unchanged. If Build 8 and the critical compatibility suite pass after deployment, MR-R1 may be frozen and MR-R2 Company Reality Engine may begin.
