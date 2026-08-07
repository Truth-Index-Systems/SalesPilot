# Genesis G4 — Campaign Live Refresh & Company Review Handoff

## Problem

Two user-facing gaps remained after the deterministic Company Discovery orchestration fix:

1. Verified companies could become `PENDING_REVIEW` without an obvious approval route on the campaign control centre.
2. `DiscoveryActivityTicker` only watched Company Discovery. Once discovery completed and Route Research took over, the campaign page stopped receiving automatic server refreshes and appeared stale until a manual browser refresh.

## Fix

### Company review handoff

The campaign page now surfaces review work in two places whenever `pendingCompanyCount > 0`:

- Current-stage panel: `Review N companies →`
- Dedicated Company approval card with awaiting/approved/not-selected counts and a primary `Review companies` CTA.

Both links open:

`/companies?campaign=<campaignId>&status=PENDING_REVIEW`

so the user lands directly in the correct campaign-scoped review queue.

### Campaign-level autonomous refresh

Added `components/campaign-auto-refresh.tsx`.

It refreshes the server-rendered campaign view every 2 seconds while the campaign is active, and also refreshes when the browser tab becomes visible or the window regains focus.

This deliberately sits above stage-specific polling. It keeps the campaign control centre synchronized across:

- Company Discovery
- Route Research / Contact Discovery
- Opportunity assembly/reasoning
- Engagement generation
- later autonomous campaign stages rendered by the same server page

The refresh pauses when the campaign itself is paused and while the document is hidden.

## Validation

Existing G4 lifecycle/state validations pass after the change:

- `validate-g4-api-lifecycle-refresh.mjs`
- `validate-g4-discovery-state-machine.mjs`
- `validate-g4-orchestration-root-cause-fix.mjs`

No SQL migration is required for this patch.
