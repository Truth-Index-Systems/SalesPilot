# Genesis T8 — CIE v1 Founder Command Centre

## Purpose
Replace the legacy founder analytics emphasis with a CIE-native operating surface.

## Governing rule
The dashboard is presentation only. It may aggregate authoritative persisted CIE and Truth outputs, but it may not calculate opportunity, route, contact, truth, or research authority.

## Primary surfaces
- Research Density: latest MR-TI-2 company coverage grouped into 100%, 80–99%, 60–79%, <60%, and unmeasured bands.
- Truth Health: AUTO / VERIFY / HUMAN_REVIEW_REQUIRED plus missing, contradicted, and dependency-constrained claim counts.
- Commercial Reality: authoritative CIE-R4 reality-state and disposition distribution.
- Route & Contact Reachability: authoritative CIE-R6 applied bindings, named/organisational routes, multi-contact frontiers, and candidates awaiting binding.
- Research Intelligence: active CIE-R7 directives ordered by deterministic decision impact and current repair execution state.
- Company Intelligence: highest-density active company entities with Truth/coverage diagnostics.
- Operations: AI spend and database footprint retained as secondary operational telemetry.

## Authority exclusions
No opportunity score, route score, route-confidence star, weighted contact rank, or AI-generated commercial recommendation is presented as decision authority.

## Validation
- `npm run cie:dashboard-check`
- CIE-R8 static freeze validator remains green.
- No changes to `lib/genesis-t8`.
