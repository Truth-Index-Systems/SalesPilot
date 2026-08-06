# SalesPilot Genesis G4.3 — Route-Aware Opportunity Scoring

## Purpose

G4.3 changes the opportunity decision from **who has the most authority** to **whether SalesPilot has a credible, supported and commercially useful route into the organisation**.

## Database migration

Run:

```sql
supabase/migrations/0045_genesis_g43_route_aware_opportunity_scoring.sql
```

The migration:

- adds persisted `route_quality`, `route_confidence`, and `recommended_entry_strategy` fields;
- upgrades the opportunity scoring version to `opportunity-score/v2-route-quality`;
- rebuilds opportunity views with richer primary-route evidence;
- keeps human-approved, rejected, and engaged states authoritative;
- keeps low-scoring opportunities visible;
- uses Route Quality as a major ranking factor;
- uses Route Quality as a ranking tie-breaker;
- writes route scores into opportunity history for auditability.

## Route Quality inputs

Route Quality is evidence-led and combines:

- route accessibility;
- expected response likelihood;
- authority of the associated role;
- route confidence;
- campaign relevance;
- relationship or referral strength.

Route Confidence separately combines:

- channel confidence;
- contact identity confidence;
- route/contact evidence;
- verification strength.

## Opportunity score v2 weights

| Component | Weight |
|---|---:|
| Company fit | 24% |
| Operational fit | 18% |
| Route quality | 24% |
| Route confidence | 10% |
| Evidence quality | 10% |
| Commercial value | 8% |
| Urgency | 6% |

Buying authority remains useful, but it is now an input to Route Quality rather than a standalone dominant opportunity factor.

## UI changes

- Opportunity cards display persisted Route Quality and Route Confidence.
- Route stars now derive from persisted Route Quality after the first post-migration scheduler scoring run.
- Recommended entry strategy is used as the route recommendation.
- Opportunity-facing copy now describes commercial need and access quality rather than exposing intelligence-engine terminology.

## Validation

```bash
npm run genesis:g43-check
npm run build
```

After applying the migration, allow the scheduler to run once so existing opportunities are rescored with v2.
