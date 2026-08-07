# SalesPilot Genesis G5 — Release 10: Live Engagement Timeline

## Scope
Presentation and observability only. G4 truth, G5 intelligence, review, approval, queue and transport authority are unchanged.

## Delivered
- Opportunity-level live Engagement Activity workspace.
- Customer-facing mapping of append-only `engagement_strategy_events` into meaningful milestones.
- Current-state banner covering WAITING through SENT, retryable recovery, terminal stop, execution holds and manual-channel readiness.
- R9 execution queue/hold visibility without duplicating execution authority.
- Automatic server refresh while an engagement is actively progressing; refresh stops in stable human-waiting/completed states.
- Existing R8 approved-state wording updated to reflect that R9 execution is now active.

## Canonical customer milestones
1. Engagement strategy started.
2. Building commercial argument.
3. Commercial argument ready.
4. Selecting strongest engagement route.
5. Engagement route selected.
6. Checking personalisation safety.
7. Writing outreach.
8. Checking evidence and factual accuracy.
9. Independent review passed / rewrite / block.
10. Engagement confidence calculated.
11. Outreach ready for approval / human action.
12. Outreach approved.
13. Queued for recipient's working day.
14. Outreach sent.

## Architectural constraints
- No new state machine.
- No new scheduler.
- No new AI call.
- No mutation of G4 or G5 intelligence.
- No queue/send changes.
- Timeline reads existing authoritative G5 event and R9 execution records only.

## Release freeze test
The user can open an Opportunity at any active G5 stage and understand what SalesPilot is doing now, what it has completed, and whether it is waiting on the system, the recipient's local-time policy, or a human decision.
