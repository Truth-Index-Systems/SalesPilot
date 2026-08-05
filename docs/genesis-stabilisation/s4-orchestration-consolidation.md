# S4 — Orchestration Consolidation

## Outcome

The pipeline scheduler is now the only internal component allowed to create or reopen autonomous work.

## Removed competing paths

- Campaign-created outbox trigger that queued company discovery
- Company approval trigger that queued contact discovery
- Company review trigger that reopened discovery top-ups
- Contact review trigger that advanced outreach readiness
- Contact-session completion trigger that advanced outreach readiness
- Legacy bulk queue-health RPC
- Legacy direct company top-up RPC
- Legacy direct contact queue RPC
- Legacy direct outreach-readiness RPC

## Scheduler-owned decisions

`prepare_pipeline_work(run_id)` now owns:

1. Expired lease recovery
2. Initial company discovery creation
3. Company queue top-up eligibility
4. Contact job creation for approved companies
5. Cancellation of unclaimed contact jobs for companies no longer approved
6. Outreach-readiness hand-off

Workers continue to claim and execute persisted jobs only. Review actions persist human decisions only. Timeline and outbox records describe decisions but never cause them.

## Data repair

Migration `0022` recovers stranded running rows and removes duplicate top-up timeline events per persisted cycle. It does not delete companies, contacts, evidence, versions, review history, campaign data, or intelligence memory.

## Runtime invariant

```text
Cron -> acquire scheduler lease -> prepare work -> worker claims -> worker executes
```

No trigger or public orchestration RPC can create competing work.
