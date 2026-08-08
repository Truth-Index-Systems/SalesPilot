# Genesis G8.1 Release 18 — Founder Intelligence Command Centre

R18 turns the protected MarketRoute founder dashboard into the operational view of the Genesis G8 intelligence asset.

## Constitutional boundaries

- Dashboard analytics are read-only derived state. They never mutate Truth Index.
- Overall Truth/Confidence/Coverage use the latest immutable snapshot per active entity.
- Knowledge vs Discovery contribution is measured from evidence provenance, not inferred from UI state.
- R17 remains the capacity authority; R18 only reads and presents its live deterministic decision.
- Founder review actions continue through the existing R11 resolution path.
- Customer-private Business DNA and campaign reasoning are not copied into the shared G8 graph.
- R18 schedules no AI work and creates no new cron.

## Command centre surfaces

- Overall Truth Index, Confidence and Coverage.
- Entity health by Industry / Sector / Company / Contact / Route / Opportunity.
- Knowledge Intelligence vs Discovery Intelligence evidence mix.
- Knowledge retrieval hit rate, latency and campaign reuse.
- Customer and background repair pressure.
- R16 refresh activity.
- R17 capacity mode, background budget and Truth gain efficiency.
- Founder-attention ranking for unresolved review, blocking repair and high-demand low-Truth intelligence.
- Industry Truth Index cards when industry-level entities exist.

## Data architecture

`genesis_g8_founder_intelligence_snapshot()` is a compact service-role-only aggregate RPC. It calculates metrics in PostgreSQL and returns only founder-operational aggregates to the dashboard. The browser never downloads the shared evidence graph.

The existing dashboard fails open if R18 has not yet been migrated, preserving access to all pre-R18 founder operations.
