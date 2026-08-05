# Genesis Current Orchestration Map

Status: S0 audit completed against the uploaded G3 Worker Guard codebase.

## Executive finding

Autonomous work is currently created or reopened by multiple independent actors. The pipeline cron, SQL triggers, review-driven functions, campaign-created outbox trigger, retry-aware claim functions, and completion/readiness triggers all influence progression. This violates the intended single-owner rule and explains why defensive loop guards have accumulated.

The stabilisation target is not to remove the existing repositories or workers. It is to make one scheduler the only internal owner of job creation and campaign progression.

## Runtime actors

| Actor | Reads | Writes | Creates/reopens work? | Advances pipeline? | Current risk |
|---|---|---|---|---|---|
| `POST/GET /api/autonomy/pipeline/run` | all active campaigns through RPCs; queued company/contact sessions | invokes queue top-up and both workers | Yes, through `ensure_active_company_review_queues` | Indirectly | Re-evaluates work creation every cron tick before claiming work |
| Company discovery route | company discovery session | company discovery state, companies, evidence, timeline | No direct creation | No | Remains separately callable alongside pipeline route |
| Contact discovery route | contact discovery session | contacts, channels, evidence, memory, timeline | No direct creation | Completion triggers can advance readiness | Remains separately callable alongside pipeline route |
| Campaign launch service/outbox | campaign and outbox | discovery session through database trigger | Yes | Starts G2 | Work creation is owned by a trigger rather than a scheduler |
| Company review routes | company review status | companies and review history | Indirectly through SQL triggers | Starts G3 and company top-up | A human review write creates autonomous work immediately |
| Contact review routes | contact review status | contacts and review history | No direct job creation | Yes, through readiness trigger | Review write can advance campaign readiness |
| Company worker | claimed discovery session | results and final session state | No | No | Correct executor shape, but its session may be reopened elsewhere |
| Contact worker | claimed contact session | contacts, routes, memory and final state | No | Completion trigger may advance readiness | Correct executor shape, but downstream progression is trigger-owned |
| Timeline | none | descriptive rows | No | No | Historical duplicate entries demonstrate missing idempotent ownership |
| Domain outbox | domain events | trigger can create initial discovery | Yes for campaign-created event | Starts G2 | Event record is descriptive and behavioural at the same time |

## Database work-creation paths

### Company discovery

1. `domain_outbox_queue_company_discovery` trigger from migration `0004` creates the initial `discovery_sessions` record after `CampaignCreated`.
2. `companies_keep_review_queue_healthy` trigger from migration `0014` invokes `ensure_company_review_queue` whenever a company review status changes.
3. `ensure_active_company_review_queues` from migration `0016` scans campaigns and invokes `ensure_company_review_queue`.
4. `/api/autonomy/pipeline/run` invokes `ensure_active_company_review_queues` on every cron execution.
5. `ensure_company_review_queue` has been redefined in migrations `0014`, `0017`, and `0020`; the latest definition reopens a completed session when the pending review queue is below six and cooldown allows it.
6. `claim_company_discovery` also owns retry eligibility for failed sessions.
7. The standalone company discovery route can claim work independently of the pipeline route if both are scheduled or manually invoked.

### Contact discovery

1. `companies_queue_contact_discovery` trigger from migration `0012` invokes `queue_contact_discovery_for_company` after a company is approved.
2. Migration `0012` backfills existing approved companies directly into `contact_discovery_sessions`.
3. `claim_contact_discovery` owns lease recovery and retry claims.
4. The pipeline route and standalone contact route can both attempt to claim contact work.
5. Migration `0019` requeues previously completed approved-company sessions for route enrichment when no stored route exists.

### Outreach readiness

1. `contacts_refresh_campaign_readiness` trigger from migration `0014` runs after contact review changes.
2. `contact_sessions_refresh_campaign_readiness` trigger runs when a contact session completes.
3. Both call `refresh_campaign_contact_readiness`, which writes timeline and outbox readiness events.

## Current status vocabulary mismatch

Company sessions use legacy states including `QUEUED`, `RUNNING`, `COMPLETED`, `FAILED`, `PAUSED`, and `CANCELLED`.

Contact sessions use the same broad legacy vocabulary plus `result_status` added later to distinguish no-results and failures.

The UI has therefore had to infer whether `FAILED` means retry scheduled, terminal failure, recovered lease, or visible pause. Progress values have also survived status transitions in historical records.

## Ownership conflicts to remove in S2-S4

- Cron must not call a broad queue-creation sweep before attempting to claim existing work.
- Review triggers must stop creating jobs directly.
- Campaign-created outbox trigger must stop being the permanent owner of initial work creation.
- Completion triggers must stop deciding campaign advancement.
- Standalone worker routes must not be simultaneously scheduled with the pipeline route.
- Retry eligibility must be evaluated once by the scheduler, while claim functions only atomically claim an explicitly eligible job.
- A completed aggregate session must not be repeatedly mutated back into a new job. Future cycles need explicit job identity or an explicit scheduler-owned cycle record.

## Frozen assets preserved

The following remain intact throughout stabilisation:

- Authentication and organisation membership
- Tenant scoping and RLS
- Campaigns, versions, timeline and outbox
- Company/contact/evidence repositories
- Existing OpenAI research and verification logic
- Human approval gates
- Campaign, Company and Contact UI
- Company and Contact worker implementation logic, once separated from orchestration

## S0 conclusion

The primary issue is distributed state ownership, not one isolated retry bug. The next implementation stage must introduce a scheduler lock and one authoritative next-action decision before disabling the competing triggers and queue sweeps.
