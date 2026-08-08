# Genesis G8.1 Release 17 — Knowledge Scheduler & Capacity Budgeting

R17 makes background intelligence growth subordinate to governed capacity. It does not create a new AI executor and it does not change MR-TI-1.0.

## Capacity allocations

- NORMAL: 60% live customer, 20% customer repair, 15% background growth, 5% experiment reserve.
- CONSERVATIVE: 80% live customer, 15% customer repair, 5% background growth, 0% experiment.
- CUSTOMER_ONLY: 90% live customer, 10% customer repair, 0% background.
- PAUSED: no Genesis background scheduling.

The existing AI governance daily request/cost policy remains the hard authority. R17 can only schedule inside the background share of that already-governed capacity. It cannot raise or bypass the underlying limits.

Customer-scoped queued/claimed repair work immediately forces CUSTOMER_ONLY. At >=75% governed daily capacity usage the engine becomes CONSERVATIVE; at >=90% it becomes CUSTOMER_ONLY. If the system governance identity/policy is unavailable, background work fails closed as PAUSED.

R17 also exposes Truth gain today and Truth gain per completed G8 repair call as operational efficiency metrics. They are diagnostics, not inputs to the Truth equation.

The existing R16 refresh endpoint is routed through the R17 capacity decision so direct invocation cannot bypass budgeting. R16 still only schedules exact repairs and R9 remains the only exact-repair model executor.

No new cron is activated by this release.
