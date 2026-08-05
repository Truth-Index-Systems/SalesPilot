# Genesis G3.1 Contact Foundation Sync Hotfix

## Problem

Buyer Intelligence could remain at approved companies with zero research jobs. Contact session creation was nested inside `prepare_pipeline_work()`, which only inspected campaigns in `PREPARING` or `READY`. Approved companies attached to another live campaign state therefore had no `contact_discovery_sessions` row for the worker to claim.

## Resolution

The scheduler now performs an explicit Contact Foundation Sync after company work and before contact dispatch planning.

The sync:

- scans approved companies across all non-paused, non-failed and non-archived campaigns;
- creates missing contact discovery sessions idempotently;
- safely requeues previously cancelled sessions when a company is re-approved and has no saved contacts;
- cancels unclaimed sessions when their company is no longer eligible;
- requires the active single-scheduler lease;
- does not call AI or bypass governance;
- preserves the existing contact worker, retry, lease and review architecture.

## Migration

Apply `0034_genesis_g3_contact_foundation_sync_hotfix.sql` after the existing migrations.

## Verification

```bash
npm install
npm run g3:contact-foundation-hotfix-check
npm run typecheck
npm run build
```
