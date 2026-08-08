# MarketRoute Genesis G4.2 — Route Intelligence Foundation

## Delivered

- Added a future-ready access-route view adapter over the existing opportunity/contact data.
- Added Route Quality (five-star presentation mapping).
- Added Route Confidence with high/good/moderate/low presentation states.
- Added recommended route type and a human-readable recommendation reason.
- Upgraded opportunity cards with route quality, confidence and entry strategy.
- Upgraded opportunity detail pages with a dedicated access-route signal panel.
- Replaced remaining opportunity-facing contact-first terminology with route-first language.
- Preserved all existing SQL schemas, RPCs, AI prompts, scoring, queues and scheduler behaviour.

## Route quality mapping

- 95–100: 5 stars
- 85–94: 4 stars
- 70–84: 3 stars
- 55–69: 2 stars
- Below 55: 1 star

The current quality value is intentionally derived from existing confidence data. True multi-factor Route Quality belongs to the next Route Intelligence release.

## Validation

The source changes were checked for remaining legacy opportunity terminology. A production build could not be run in the packaging environment because its internal npm mirror returned 404 for the locked `zod@3.24.2` tarball. No dependency versions or lockfile entries were changed.

Run:

```bash
npm ci
npm run build
```
