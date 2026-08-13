# MarketRoute Forensic Build 6 — Contact Truth

## Status
Implemented and locally validated. This build is not a Genesis T8 freeze.

## Purpose
Replace binary legacy contact verification with claim-level, time-aware Contact Truth and bind CIE-R6 contact authority to those truth-qualified claims.

## Live authority chain after Build 6
Evidence -> Contact Truth -> R5 canonical relationship path -> R6 contact binding -> READY / engagement.

## Contact Truth claims
Each named contact is evaluated independently for:
- IDENTITY
- CURRENT_ROLE
- CURRENT_EMPLOYMENT
- EMAIL_OWNERSHIP
- LINKEDIN_OWNERSHIP

States are categorical: KNOWN, SUPPORTED, UNRESOLVED, STALE, CONTRADICTED. No probability, quality score, weighted confidence, or legacy `verified` Boolean owns R6 authority.

## Temporal policy
Live current sources use retrieval time as their currentness reference. Fixed documents require a publication timestamp before they can establish current role/employment. Claim validity windows are explicit deterministic policy:
- Identity: 365 days
- Current role: 180 days
- Current employment: 180 days
- Email ownership: 120 days
- LinkedIn ownership: 120 days

Every named R6 authority records `next_revalidation_at`; authority fails closed when it becomes due. Organisational routes are exempt because no named-person claim is being relied upon.

## Contradiction policy
Absence or wording variation is never treated as contradiction. Only evidence explicitly persisted with `truth_polarity='CONTRADICTS'` can create a CONTRADICTED contact claim.

## Database changes
Migration 0156:
- adds `source_published_at` and `truth_polarity` to `contact_evidence`;
- explicitly documents legacy `contact_evidence.verified` as historical-only;
- adds Contact Truth lineage fields to `cie_r6_contact_decisions`;
- creates append-only `genesis_t8_contact_truth_snapshots`;
- changes the R6 persistence RPC with explicit DROP-before-CREATE protection;
- keeps `get_cie_r6_contact_authority_context` return shape unchanged;
- adds temporal R6 invalidation;
- marks pre-FB6 R6 authority stale for conservative revalidation.

## Important behavioural changes
- A matching name is insufficient for a named route.
- Current identity, employer and role must be truth-qualified.
- Direct email / LinkedIn routes require truth-qualified channel ownership.
- Route contact role must match the bound contact role.
- Legacy `email_status`, `linkedin_status`, evidence quality and `verified=true` cannot rescue an unresolved Contact Truth state.
- Organisational routes remain executable without a named person.

## Validation
Build 6:
- 22/22 static authority checks
- 10/10 PostgreSQL signature checks
- 15/15 Contact Truth adversarial tests
- 8/8 CIE-R6 adversarial binding tests
- 18/18 CIE-R6 static checks
- changed Build-6 TypeScript modules transpile cleanly
- standalone SQL exactly matches canonical 0156

Regression:
- Build 5 static: 40/40
- Build 5 SQL signatures: 11/11
- Build 3 static: 47/47
- Build 2 static: 36/36

## Deployment order
1. Run `0156_marketroute_forensic_build6_contact_truth.sql` / `APPLY-IN-SUPABASE-FORENSIC-BUILD6.sql` in Supabase.
2. Deploy the Build-6 application package.
3. Allow the scheduler to revalidate stale pre-FB6 R6 decisions.

## Deferred to Build 7
Build 6 does not replace the historical opportunity/read-model layer. Founder/UI surfaces can still contain historical fields even though they no longer own R6 authority. Build 7 should create an authoritative read model directly over R4/R5/R6 Truth lineage and make the Founder Command Centre consume that model only.
