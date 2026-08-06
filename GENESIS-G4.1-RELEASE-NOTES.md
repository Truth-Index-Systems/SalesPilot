# SalesPilot Genesis G4.1 — Opportunity Experience Polish

Presentation-only release. No SQL, AI prompt, scoring, scheduler, dispatch, queue, or autonomous pipeline behaviour was changed.

## Changes
- Rebuilt the opportunity card footer around one clear `View Opportunity →` primary action.
- Removed the bottom-right floating selection square.
- Preserved bulk review by moving selection into a labelled control in the card header.
- Replaced `Strongest buying contact` with `Best access route` on opportunity cards.
- Replaced `Still researching` with `Research in progress`.
- Added route-focused progress copy while no supported route exists.
- Replaced `Open opportunity intelligence` with the customer-facing `View Opportunity` action.
- Updated opportunity-page and detail-page language to avoid exposed engine terminology.
- Added responsive behaviour: the primary CTA becomes full width on mobile.
- Improved footer spacing, alignment, status grouping, section separation, hover depth, and card hierarchy.

## Validation
A production build was attempted, but dependency installation could not complete because the configured package mirror returned HTTP 404 for the locked `zod@3.24.2` tarball.

Run locally:

```bash
npm ci
npm run build
```
