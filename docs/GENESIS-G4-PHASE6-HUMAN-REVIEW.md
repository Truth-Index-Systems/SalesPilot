# MarketRoute Genesis G4 Phase 6 — Human Review Experience

Phase 6 turns AI-approved outreach into a transparent, professional decision workspace.

## Delivered
- Engagement review queue and detail page.
- Opportunity, buyer, draft, commercial reasoning and independent AI score in one review experience.
- Approve, edit-and-approve, reject and regenerate actions.
- Bulk approve and bulk reject.
- Tenant-scoped, role-protected RPCs.
- Complete human review, engagement history and customer timeline persistence.
- Approval stops at `APPROVED_TO_SEND`; no queueing or sending occurs.
- Regeneration safely resets the existing unique draft record to `PENDING`, preserving the single-engagement/single-current-draft architecture.

## Migration
Apply `0039_genesis_g4_phase6_human_review.sql` after `0038`.
