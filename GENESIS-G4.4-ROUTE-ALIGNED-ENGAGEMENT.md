# Genesis G4.4 — Route-Aligned Engagement Intelligence

## Delivered

- Commercial reasoning now receives the persisted Best Access Route, Route Quality, Route Confidence and Recommended Entry Strategy.
- Commercial analysis v2 must produce an explicit route strategy, channel rationale, authority rationale, accessibility rationale and fallback plan.
- Outreach generation v2 must declare how the draft aligns with the selected route.
- Lower-authority or indirect routes are instructed to earn escalation or an introduction rather than impersonating a final-buyer conversation.
- Independent AI review now penalises drafts that ignore the route or overstate recipient authority.
- Human review displays route quality, route confidence, recommended entry strategy and draft alignment.
- Queue, approval, sending windows and dispatch behaviour are unchanged.

## Migration

Run `supabase/migrations/0046_genesis_g44_route_aligned_engagement_intelligence.sql`.

## Validation

```bash
npm ci
npm run build
```
