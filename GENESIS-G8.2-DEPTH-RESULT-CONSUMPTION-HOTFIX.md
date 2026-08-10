# Genesis G8.2 Depth Result Consumption Hotfix

## Production defect
Completed `genesis-g82-depth:*` background responses could decode to zero hard-accepted contacts and zero routes. The worker then settled the job as `COMPLETED` with `0/0`, creating no reusable contact/route entities and leaving the Founder Dashboard at zero despite successful depth scheduling and AI completion.

## Changes
- Bumps depth worker to `G8.2-DEPTH-WORKER-1.1-ZERO-RESULT-HARDENING`.
- Adds `GENESIS_G82_DEPTH_DECISION` telemetry for job claim, dispatch, accepted result counts, contact persistence, route persistence, queued/pending states, retryable failures and completion.
- Treats a `0 contacts / 0 routes` accepted response as `GENESIS_G82_DEPTH_NOTHING_SAFE_TO_PERSIST` instead of false success.
- Requeues zero-result depth work under the existing bounded retry policy (maximum five attempts).
- Preserves the hard evidence gate; no fabricated contact or route is accepted merely to satisfy a non-empty result.
- Strengthens the research contract to actively inspect official company sites for evidenced organisational routes such as departmental/general inboxes, contact forms, switchboards, procurement/vendor pages and introduction paths.
- Preserves `reserve_ai_request` and existing governance as final spending/concurrency authority.

## Expected production telemetry
A successful enrichment should now show:

`JOB_CLAIMED -> RESEARCH_DISPATCH -> RESEARCH_ACCEPTED -> CONTACT_PERSIST_* / ROUTE_PERSIST_* -> SETTLE_COMPLETED`

If research returns no safe reusable intelligence, it should show:

`RESEARCH_ACCEPTED contactsFound=0 routesFound=0 -> SETTLE_RETRYABLE_FAILURE GENESIS_G82_DEPTH_NOTHING_SAFE_TO_PERSIST`

rather than silently completing at zero.

## Validation
Run:

`node scripts/validate-genesis-g82-depth-result-consumption-hotfix.mjs`
