# Genesis G4.7.7 — PostgreSQL JSON Persistence Boundary

## Root cause
Business Discovery could successfully complete website research and AI generation, then fail inside `complete_business_analysis_job` with PostgreSQL error `22P05` because an AI/web-derived string contained the NUL code point (`U+0000`). PostgreSQL `text`/`jsonb` cannot represent that code point.

## Fix
- Business Discovery text and URL canonicalisation strips `U+0000` before strict schema validation.
- Added a shared recursive PostgreSQL JSON sanitiser at `lib/database/postgres-json.ts`.
- `completeBusinessAnalysisJob()` sanitises the entire analysis payload, result summary, and canonical URL immediately before the PostgREST RPC call.
- No commercial content is invented or rewritten; only the database-forbidden NUL code point is removed.

## Recovery
No SQL migration is required. Existing `FAILED_RETRYABLE` Business Discovery jobs can retry under the existing persisted retry mechanism after deployment.

## Validation
Passed:
- G4.7.7 PostgreSQL JSON persistence boundary
- G4.7.3 Business Discovery boundary / observability
- Business Analysis live-progress validator
- G4.7 Route Intelligence validator
- Company Discovery state-machine validator
