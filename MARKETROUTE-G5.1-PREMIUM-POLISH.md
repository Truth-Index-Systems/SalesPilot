# MarketRoute Genesis G5.1 — Premium Polish & Rebrand

## Scope
This release is a presentation-first commercial polish pass. It does not change campaign state authority, AI workload profiles, scheduling, background resumability, route intelligence, engagement logic, or persistence contracts.

## Brand migration
- Customer-facing product name changed from SalesPilot to MarketRoute.
- New MarketRoute wordmark added and used as the single home control in the application sidebar and public header.
- No duplicate text wordmark appears beside the logo.
- New MarketRoute mark and favicon added.
- Page metadata, auth surfaces, user-facing errors, account copy and product language updated to MarketRoute.
- Package display identity updated to `marketroute-genesis`.

## Startup positioning
The public and product copy now speaks to startups, founders and founder-led sales. The main proposition is customer acquisition rather than AI tooling: MarketRoute learns the business, finds best-fit companies, identifies credible routes in, assembles opportunities and prepares outreach for review.

## Premium UI polish
- Added restrained hover lift and depth to buttons, cards and brand surfaces.
- Added a subtle top highlight to interactive cards.
- Refined hero typography and visual depth.
- Reused existing live-state motion rather than adding heavy animation.
- Added reduced-motion-safe behaviour for new effects.
- Improved empty states and active-work language so pages feel alive while background research is progressing.

## Compatibility boundary
Legacy lowercase database RPC names, cache keys, OpenAI schema identifiers and existing `SALESPILOT_*` environment variables are intentionally retained where changing them could break persisted production contracts. The primary deployment gate now accepts `MARKETROUTE_AI_PLATFORM_ENABLED` with `SALESPILOT_AI_PLATFORM_ENABLED` as a compatibility fallback.

## Validation
- MarketRoute customer-language validation passes.
- MarketRoute landing validation passes.
- G2.4 review-queue contract validation passes.
- Speed R4 workload optimisation: 18/18 passes.
- Speed R5 latency observatory: 21/21 passes.
- All-AI background resumability: 36/36 passes.
- Responsibility-boundary audit: 64/64 passes.
- TypeScript/TSX syntax validation passes using TypeScript transpilation.

A full `npm run build` could not be executed in the packaging environment because the configured package registry returned 404 for the existing locked `zod@3.24.2` tarball. This is an environment/package-registry limitation, not a TypeScript syntax failure.
