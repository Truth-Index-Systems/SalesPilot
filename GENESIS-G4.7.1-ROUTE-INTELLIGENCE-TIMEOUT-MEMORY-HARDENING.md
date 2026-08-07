# Genesis G4.7.1 — Route Intelligence Timeout + Memory Hardening

## Root cause

The first G4.7 Route Intelligence pass is materially heavier than legacy Contact Discovery: medium-context web research, organisation mapping, buying paths, multiple commercial routes, people/channels and a large structured response. The scheduler still used the old initial-contact burst and launched several of these deep investigations concurrently. In production the correlated `TimeoutError` failures occurred at the client abort boundary, causing all route results to be discarded before persistence.

## Changes

- Initial Route Intelligence is now one deep investigation per scheduler cycle. No `Promise.all` burst for heavyweight first-pass route research.
- First-pass OpenAI timeout increased from 150s to 240s; narrower expansion passes receive 180s.
- Structured output budget is bounded to 9k first-pass / 6.5k expansion tokens to reduce long tail completion time while retaining the full G4.7 schema.
- Reachability is researched before organisation-map prose. The prompt explicitly prioritises direct emails, departmental/general monitored inboxes, switchboards and exact LinkedIn profiles.
- Added cross-campaign route memory by organisation + exact company domain. Previously verified channels, contacts and commercial routes are supplied to subsequent Route Intelligence runs as leads for revalidation. They are not blindly trusted and must still pass current normalisation/evidence rules.

## Frozen boundary

Company Discovery search, evidence verification, expansion and state-machine code are unchanged.
