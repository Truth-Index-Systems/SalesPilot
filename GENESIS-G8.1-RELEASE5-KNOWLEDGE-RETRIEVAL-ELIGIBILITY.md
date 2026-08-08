# Genesis G8.1 Release 5 — Knowledge Retrieval & Eligibility Engine

## Purpose

Classify hydrated Knowledge Intelligence into deterministic operational states before any future integration with MarketRoute's live Discovery Intelligence pipeline.

## Eligibility states

- `READY` — strong, complete intelligence with no unresolved contract gaps.
- `READY_WITH_GAPS` — usable intelligence with only non-material gaps that Discovery Intelligence may repair surgically.
- `REFRESH_REQUIRED` — critical or required knowledge is stale and must be refreshed before use.
- `HUMAN_REVIEW_REQUIRED` — material contradiction, explicit review state, or unresolved critical gap requires founder judgement.
- `NOT_USABLE` — suppressed/rejected/superseded or below the minimum usable Truth floor; future orchestration must use Discovery Intelligence.

## Constitutional rules

1. Eligibility never changes Truth Index.
2. Human approval does not manufacture evidence or inflate confidence.
3. Human rejection/suppression blocks use but does not delete intelligence.
4. Material contradiction outranks score thresholds.
5. Stale material intelligence is refreshed rather than discarded.
6. Low-quality Knowledge Intelligence falls back to Discovery Intelligence, keeping MarketRoute open to any market.
7. The existing live discovery/contact/route/opportunity/autonomy pipeline remains untouched in R5.

## Retrieval boundary

Server-only helpers retrieve by entity ID or canonical key, hydrate current Truth at read time, then apply the pure deterministic eligibility engine. This is not yet connected to customer requests.
