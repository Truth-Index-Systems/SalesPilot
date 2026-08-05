# Genesis Stabilisation State Machines

Status: S1 contract. Runtime migration begins in S2-S4.

## Autonomous job states

```text
QUEUED -> RUNNING
RUNNING -> COMPLETED | NO_RESULTS | EXHAUSTED
RUNNING -> FAILED_RETRYABLE | FAILED_TERMINAL
RUNNING -> PAUSED | CANCELLED
FAILED_RETRYABLE -> QUEUED | FAILED_TERMINAL | CANCELLED
PAUSED -> QUEUED | CANCELLED
```

Terminal states never return to `QUEUED`. A later search is a new job or explicit new cycle with a new idempotency key; it is not mutation of completed history.

### Definitions

- `QUEUED`: persisted work exists and is eligible for an atomic claim.
- `RUNNING`: a worker owns a valid unexpired lease.
- `COMPLETED`: work succeeded and produced a valid persisted result.
- `NO_RESULTS`: research completed successfully but produced no supportable result.
- `EXHAUSTED`: the current search scope has repeatedly produced no new unique result and requires cooldown or scope change.
- `PAUSED`: work is intentionally stopped by campaign/customer state.
- `CANCELLED`: work is permanently stopped without completion.
- `FAILED_RETRYABLE`: execution failed, with a persisted reason and `next_retry_at`.
- `FAILED_TERMINAL`: execution cannot safely continue automatically.

## Invariants

1. One campaign may have at most one active company-discovery job.
2. One campaign/company pair may have at most one active contact-discovery job.
3. Only `QUEUED` work may become `RUNNING`.
4. Only the scheduler may create a job or return `FAILED_RETRYABLE`/`PAUSED` work to `QUEUED`.
5. A worker may only move its claimed job from `RUNNING` to an outcome state.
6. A lease-expired `RUNNING` job becomes `FAILED_RETRYABLE`; it is never silently left as researching.
7. `NO_RESULTS` is not an exception and does not retry immediately.
8. Timeline and outbox records are consequences of a committed state transition, never causes of one.
9. Each transition has an idempotency key tied to job id and destination state.
10. UI progress is visible only for a valid `RUNNING` lease.

## Campaign stage derivation

Priority order:

```text
ARCHIVED
PAUSED
BUSINESS_ANALYSIS
CAMPAIGN_REVIEW
OPPORTUNITIES
REPLIES
OUTREACH
OUTREACH_READY
CONTACT_REVIEW
CONTACT_DISCOVERY
COMPANY_REVIEW
COMPANY_DISCOVERY
```

The stage is derived from persisted facts through one function. Individual pages must not infer a different stage from local counts.

## Top-up eligibility contract

A company top-up job may be created only when all conditions are true:

- campaign is active and not paused or archived;
- pending company review count is below the configured floor;
- no active company-discovery job exists;
- no retryable company job is waiting for `next_retry_at`;
- the latest no-result/exhaustion cooldown has expired;
- the search scope or cycle idempotency key has not already been scheduled.

## Contact eligibility contract

A contact-discovery job may be created only when:

- the company is approved for the same campaign and organisation;
- no active contact-discovery job exists for that campaign/company pair;
- no retryable job is awaiting its retry time;
- the latest successful result is stale, absent, or a scheduler-recognised enrichment version requires new work.

## Outreach-ready contract

A campaign is `OUTREACH_READY` only when:

- at least one approved contact has a usable, policy-compliant route;
- no contacts await review for the current campaign version;
- no active contact-discovery job remains for the current approved-company set;
- the readiness transition has not already been recorded for the same campaign version.
