# Genesis G8.2 Release 2 — Founder Review, Live Activity & Industry Coverage

This release is presentation/operability only. It does not modify MR-TI-1.0, evidence scoring, expansion selection, capacity governance, or the dual-channel execution model.

## Founder review workspace

- Replaces terse review cards with evidence-rich validation cards.
- Shows entity/company identity, Truth Index, confidence, coverage, first seen, latest evidence, priority, escalation reason, claim keys and up to eight real evidence sources.
- Evidence displays URL, excerpt, source class, supports/contradicts direction and deterministic quality derived from stored evidence factors.
- Approve / Correct / More research / Reject are interactive client actions with pending, success and error states.
- Correct still requires founder context; founder corrections remain instructions for research and never become mathematical evidence directly.
- Human resolution is authoritative once the immutable receipt is committed. A later best-effort repair dispatch cannot make the dashboard falsely report that the human action failed.

## Live activity feed

A read-only activity feed combines recent autonomous expansion, exact repairs, evidence ingestion and founder review actions. It is computed server-side and does not schedule work.

## Industry research coverage

Each G8.2 expansion target now exposes:

- unique companies researched/persisted into target membership,
- contacts researched,
- routes researched,
- completed expansion jobs,
- companies found vs persisted,
- configured target company count,
- progress percentage,
- latest activity.

Migration `0124_genesis_g82_r2_founder_review_activity_industry_coverage.sql` adds one service-role-only read RPC. No new cron is added.
