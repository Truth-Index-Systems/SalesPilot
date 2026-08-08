# Genesis G8.1 Release 11 — Founder Review Resolution & Feedback Loop

R11 makes human review an executable part of the Genesis G8 intelligence loop.

## Rules

- Human review never rewrites Truth Index mathematics or historical snapshots.
- APPROVE changes operational eligibility only; the underlying Truth score and gaps remain visible and repairable.
- REJECT suppresses active eligibility but preserves the entity, claims, evidence, snapshots, and immutable review receipt.
- MORE_RESEARCH converts the review into exact claim-level Discovery Intelligence repair work.
- CORRECT records the founder correction as immutable feedback, then asks Discovery Intelligence to verify the affected claim(s); a correction is not silently treated as evidence.
- Review resolution is idempotent by review task ID.
- Queued repair work is cancelled when an entity is rejected; already-running research may finish and remains historical evidence.

## Founder dashboard

The existing password-protected founder dashboard now surfaces the G8 review queue and provides Approve, Correct, More research, and Reject actions.

## Migration

`0113_genesis_g81_release11_founder_review_resolution_feedback.sql`
