# Genesis G8.2 Release 5 — Three-Company Reliability Revert

## Purpose

Restore the proven three-company autonomous expansion work unit after production zero-result behaviour appeared immediately after the R3 six-company throughput increase.

## Changes

- Maximum companies per governed expansion research call is restored from 6 to **3**.
- The primary enriched expansion prompt explicitly prioritises up to three strong companies.
- The R4 breadth-first recovery pass also uses the same three-company ceiling.
- The governance reservation estimate is restored from **$0.12 to $0.08**.
- The structured-output floor is restored from **10,000 to 6,000 tokens**.
- R4 empty-result recovery remains intact: zero companies do not count as successful progress.
- R4 attempt-indexed search-angle rotation remains intact.
- Truth scoring, evidence requirements, deduplication, human review, capacity governance and cron scheduling are unchanged.

## Deployment

No database migration is required. Deploy the application bundle and observe the next new expansion work unit. Existing in-flight background responses created by an older deployment may still complete under their original request contract; subsequent R5 calls use the three-company contract.
