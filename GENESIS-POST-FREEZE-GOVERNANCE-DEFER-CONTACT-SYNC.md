# SalesPilot Genesis — Post-Freeze Governance Deferral + Contact/Route Sync

This patch is based on the compiled depth-first Route Intelligence candidate.

## Governance recovery

AI governance exhaustion is now a deferral, not a technical failure, for scheduler-owned Company Discovery, Route Intelligence, and G5 AI stages.

When `reserve_ai_request` blocks a request because the platform/autonomy/request/cost allowance does not permit another call:

- the existing persisted job/strategy is retained;
- scheduler ownership and leases are released;
- the claim attempt is rolled back (`attempt_count - 1`, bounded at zero);
- no FAILED_TERMINAL state is created;
- no duplicate job is created;
- the job becomes claimable again automatically after allowance/policy permits work.

G5 resumes from the safe pre-AI state:

- Commercial Reasoning: `REASONING -> WAITING`
- Channel Strategy: `STRATEGY_READY -> STRATEGY_READY`
- Outreach Generation: `GENERATING -> STRATEGY_READY`
- Self Review: `SELF_REVIEW -> SELF_REVIEW`

The existing G5 intelligence payloads are not cleared by governance deferral.

## Canonical contact reconciliation

Route Intelligence may discover an executable named-person email or LinkedIn route even when the model's `contacts[]` output does not contain the same person. The Contacts page reads `public.contacts`, so those two truths could diverge.

The new `reconcile_route_contacts_owned` RPC runs after Route Intelligence persists routes and the ordinary contact batch. It reconciles only routes that are:

- viable;
- named-person routes;
- `DIRECT_EMAIL` or `LINKEDIN`;
- backed by verified `IDENTITY` evidence;
- backed by verified `ROLE` evidence;
- backed by verified evidence for the specific channel (`EMAIL` or `LINKEDIN`).

Generic/departmental inboxes, switchboards, introductions, and unsupported people are never converted into Contact records.

## Non-destructive channel updates

`save_contact_discovery_batch` now preserves an existing email/LinkedIn value when a later research pass returns null or weaker channel evidence. A channel is only replaced by a non-null result with equal or stronger confidence.

This prevents Route Intelligence expansion from accidentally erasing previously found reachability.

## Migration

Apply:

`0087_genesis_post_freeze_governance_defer_contact_route_sync.sql`

No G4/G5 scoring, Opportunity truth, route selection, or engagement-generation logic is changed.
