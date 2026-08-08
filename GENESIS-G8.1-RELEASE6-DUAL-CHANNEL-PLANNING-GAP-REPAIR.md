# Genesis G8.1 Release 6 — Dual-Channel Planning & Gap-Repair Contracts

## Purpose
Convert R5 knowledge eligibility into deterministic, execution-neutral work plans while preserving MarketRoute's existing Discovery Intelligence implementation.

## Constitutional boundary
- AI proposes/researches only when a later orchestrator executes a Discovery work order.
- R6 does not call AI, web search, Supabase, or customer pipeline code.
- R6 does not mutate Truth Index or review state.
- Knowledge Intelligence and Discovery Intelligence remain peer channels.
- The default future strategy remains `KNOWLEDGE_FIRST_WITH_DISCOVERY_FALLBACK`.

## Plan states
- `USE_KNOWLEDGE` — ready intelligence can be consumed immediately.
- `USE_KNOWLEDGE_AND_REPAIR` — current knowledge remains usable while non-material gaps are repaired by Discovery.
- `REFRESH_BEFORE_USE` — material stale intelligence blocks use until exact claims are refreshed.
- `ROUTE_TO_HUMAN_REVIEW` — unresolved material ambiguity/critical issues are escalated without deletion.
- `RUN_FULL_DISCOVERY` — knowledge below the usable floor falls back to the existing live discovery path.

## Gap-repair contracts
Each gap becomes a bounded claim-level work order containing:
- claim identity and criticality
- deterministic reason
- repair mode
- current confidence
- current/minimum evidence count
- exact additional evidence deficit
- current freshness timestamp
- bounded objective
- execution disposition (`DISCOVERY_INTELLIGENCE` or `HUMAN_REVIEW`)

## Non-regression rule
No existing Discovery, Contacts, Opportunities, Pipeline, or Autonomy production module imports Genesis G8 in Release 6.
