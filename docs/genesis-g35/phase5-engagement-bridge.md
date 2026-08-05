# Genesis G3.5 Phase 5 — Engagement Bridge

Phase 5 closes Opportunity Intelligence by turning each approved opportunity into one persisted engagement record.

## Ownership

The single pipeline scheduler remains the only component allowed to progress an opportunity into Engagement. Review actions only persist the human decision.

## Behaviour

- Approved opportunity with a supported email: `READY_FOR_DRAFT`, channel `EMAIL`.
- Approved opportunity with LinkedIn only: `READY_FOR_DRAFT`, channel `LINKEDIN`.
- Approved opportunity without a supported route: `NEEDS_ROUTE`.
- Rejected opportunity with unsent engagement work: `CANCELLED`.
- Existing draft/send states are never overwritten by intelligence refreshes.

## G4 boundary

Phase 5 does not create copy, schedule messages or send email. G4 will consume `opportunity_engagements`, apply the persisted outreach policy and create the full outreach journey.
