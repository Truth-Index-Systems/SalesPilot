# SalesPilot Genesis G5 — Release 8: Assisted Approval Workspace

## Boundary
Release 8 consumes the frozen G4 Opportunity and persisted G5 R2–R7 intelligence. It does not change Company Discovery, Route Intelligence, Opportunity scoring, G4 evidence, or G4 orchestration.

## Delivered
- G5 approval workspace embedded in Opportunity detail.
- Commercial argument, selected route, channel, outreach, evidence used, self-review status and Engagement Confidence are visible together.
- Human actions: Approve, Edit, Reject, Try secondary route.
- Approve transitions only READY_FOR_APPROVAL -> APPROVED. Queueing and sending remain disabled.
- Human edits invalidate the previous R6 review and R7 quality score, then re-enter mandatory SELF_REVIEW before approval can become available again.
- Try secondary route stores a separate human route override. The original R3 channel strategy remains untouched; R4/R6/R7 consume the override for regeneration/review/scoring.
- Secondary-route regeneration uses already-discovered G4 route truth and never reruns G4.
- Viewer roles cannot perform approval actions.
- Generic scheduler-owned READY_FOR_APPROVAL -> APPROVED is blocked; R8 approval requires an authenticated workspace user.

## Migration
Apply `supabase/migrations/0081_genesis_g5_release8_assisted_approval_workspace.sql`.

## Validation
Run `npm run genesis:g5-release8-check`.
The static invariant suite passes 20/20 in the release package.

## Explicitly not Release 8
- Autopilot approval
- Queue execution
- Sending
- Recipient-time policy execution
- Engagement activity timeline
- Learning activation
