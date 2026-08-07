# Genesis G4.7 — Route Intelligence Engine

## Objective

Company Discovery remains frozen. G4.7 consumes its persisted company version, evidence and Business DNA and answers the next commercial question: **what is the strongest evidence-backed path into this organisation?**

## What changed

- Contact Discovery is evolved into Route Intelligence at the AI/research boundary.
- The first pass is deliberately extensive: larger evidence context, medium web-search context and a larger output budget.
- Company fit research is not repeated. Existing Company Discovery evidence is injected into Route Intelligence.
- Route Intelligence now returns an organisation map, buying paths, multiple independent commercial routes, supported people, company channels and uncertainty.
- Commercial routes are scored independently across authority, accessibility, commercial relevance, evidence quality, resilience and confidence.
- Named people are stripped from a route unless identity + role evidence survives deterministic verification.
- Email/LinkedIn route values are normalised against the official company domain / LinkedIn profile contract before persistence.
- A route package is not considered strong merely because one contact exists. The readiness gate now prefers a viable primary route plus an independent fallback.
- Opportunity scoring is upgraded to `opportunity-score/v3-route-intelligence` and consumes the best commercial route.
- Opportunity UI now shows the best commercial route, organisation/buying path context, alternative routes and route evidence.

## Persistence

Migration `0065_genesis_g47_route_intelligence_engine.sql` adds:

- `route_intelligence_snapshots`
- `commercial_routes`
- `commercial_route_evidence`
- `save_route_intelligence(...)`
- Route-aware readiness evaluation
- Route-aware opportunity views
- `apply_route_intelligence_opportunity_scoring(...)`

## First-pass philosophy

The first Route Intelligence pass should do the expensive thinking once: understand the relevant buying centre, generate multiple plausible access paths and investigate the strongest supported people/channels. Later expansion passes are narrower and exist to strengthen missing primary/fallback routes, not to restart research.

## Frozen boundary

G4.7 does **not** alter Company Discovery planning, search order, evidence thresholds, verification, expansion or state-machine behaviour.

## Deployment

Run all migrations through `0065_genesis_g47_route_intelligence_engine.sql`, then deploy the application code. No new environment variable is required. `SALESPILOT_ROUTE_INTELLIGENCE_ESTIMATED_COST_USD` is optional; when absent, the governance reservation defaults to a higher first-pass estimate and a lower expansion-pass estimate.

## Validation

Run:

`npm run genesis:g47-check`

The existing route expansion, route claim, opportunity scoring and frozen Company Discovery validators should also remain green.
