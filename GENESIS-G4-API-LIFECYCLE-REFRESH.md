# Genesis G4 API Lifecycle Refresh

## Purpose
Keep server-rendered campaign status, counts, timelines and stage labels synchronized with API work without waiting for a later polling interval.

## Behaviour
- Same-origin POST, PUT, PATCH and DELETE calls trigger a debounced `router.refresh()` when initiated and again when settled.
- Company Discovery status polling refreshes the page whenever the full state snapshot changes, including stage, progress, job state, retry time, company count or recent activity.
- Read-only polling remains bounded and avoids global refresh loops.
- Existing local loading and error states remain authoritative.

## Validation

```bash
node scripts/validate-g4-api-lifecycle-refresh.mjs
npm run build
```
