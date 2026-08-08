# MarketRoute Genesis G4.6.5 — Rigorous Reliability & Legacy Audit

## Scope

Audited the complete autonomous path from campaign work preparation through company discovery, buyer discovery, opportunity scoring, engagement strategy, commercial reasoning, channel generation, AI review, human review, execution, outcome recording and controlled learning.

The audit covered runtime ownership, scheduler leases, claim idempotency, retry/dead-letter behaviour, tenant boundaries, channel safety, execution state, outcome integrity, learning activation, API payload limits, migrations and legacy runtime paths.

## Important fixes applied

### 1. Scheduler health now includes Engagement failures

The cron endpoint previously returned a healthy HTTP response when Commercial Reasoning, Channel Content Generation or AI Quality Review returned `FAILED_RETRYABLE`. Company and contact worker failures were surfaced, but engagement-stage failures were not.

The endpoint now returns a partial-failure response whenever any claimed engagement worker fails. This makes monitoring accurately reflect the state of the full autonomous pipeline.

### 2. Website homepages are no longer represented as verified contact forms

G4.6.1 treated any company website URL as a `WEBSITE_FORM` route. This could generate “paste into the contact form” instructions when only a homepage had been verified.

Migration `0053` introduces conservative contact-form URL verification. Only a specific HTTP(S) URL whose path indicates a contact, enquiry, quote, demo or consultation route can be selected as `WEBSITE_FORM`. A normal homepage now leaves the engagement in route research rather than overstating access.

### 3. Commercial outcomes cannot regress

Outcome history previously blocked duplicates and events after WON/LOST, but still allowed backward transitions such as `QUALIFIED → REPLIED` or `MEETING_BOOKED → NO_RESPONSE`.

Migration `0053` enforces monotonic progression while still allowing `NO_RESPONSE → REPLIED → MEETING_BOOKED → QUALIFIED → WON`, or a legitimate `LOST` terminal result. Outcome value is now accepted only for `WON`.

### 4. Execution metadata is bounded

The execution endpoint accepted an unbounded arbitrary JSON object from authenticated users. It is now limited to 20 fields and 8 KiB, preventing accidental or abusive database growth while retaining useful audit metadata.

### 5. Obsolete runtime compatibility shim removed

`lib/engagement/domain.ts` only re-exported the canonical type module for an earlier G3.5 import path. The scheduler now imports directly from `lib/engagement/types.ts`, and the obsolete shim has been deleted.

## Legacy assessment

No duplicate scheduler, competing engagement worker, old dispatch engine, mock campaign runtime or retired outreach pipeline remains active.

Historical SQL migrations and validation scripts were retained intentionally. They are required for deterministic fresh database reconstruction and regression testing; deleting them would make the repository less reliable, not cleaner.

The legacy campaign-draft browser key remains as a narrow one-time migration path for users with an old in-progress draft. It does not control current persistence or execution and was retained to avoid unnecessary data loss.

The model router's `OPENAI_MODEL` fallback remains a deliberate environment compatibility boundary. Task-specific model variables still take priority.

## Validation

Passed:

- Genesis G4.6.1 validator
- Genesis G4.6.2 validator
- Genesis G4.6.3 validator
- Genesis G4.6.4 validator
- Genesis G4.6.5 validator
- Commercial Reasoning claim ambiguity validator
- Outreach Generation claim ambiguity validator
- Genesis SQL hardening validator
- New rigorous audit validator
- ZIP integrity and source-structure checks

A complete Next.js build could not be run in the packaging environment because its internal npm mirror does not contain the locked `zod@3.24.2` tarball. No dependency or lockfile changes were made.

## Deployment

Apply migration:

`supabase/migrations/0053_genesis_g465_reliability_and_legacy_cleanup.sql`

Then run:

```bash
npm ci
npm run genesis:g465-check
node scripts/validate-genesis-g465-audit.mjs
npm run build
```
