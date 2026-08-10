# MarketRoute MR-R1 Build 3 — Genesis Business DNA API

Build 3 turns the immutable campaign-scoped Genesis seller snapshot introduced in Build 2 into the canonical read boundary used by MarketRoute execution stages.

A new `GenesisSellerContext` API loads `campaign_genesis_t8_seller_contexts`, verifies campaign/organisation ownership, schema/integration version and source fingerprint consistency, then exposes one deeply frozen object containing seller identity, Business DNA, commercial objectives, the selected objective, research directives and Genesis provenance.

Company Discovery and Contact/Route Intelligence no longer read `business_profile_versions` to reconstruct seller understanding. Both consume `GenesisSellerContext.businessDNA`. Campaign configuration remains a separate approved execution strategy; it does not reinterpret the seller.

The authenticated read endpoint is:

`GET /api/genesis-t8/campaigns/:id/seller-context`

This build deliberately does not rewrite the existing campaign UI. Legacy display fields remain in place until MR-R1 Build 4, where they become compatibility projections from Genesis. Build 3 also does not deterministically invent canonical Commercial Genome tokens from legacy prose; CE-R1 semantic sovereignty remains intact.

## Constitutional guarantees

- Genesis T8 remains independent of MarketRoute application code.
- The persisted seller snapshot is immutable and fingerprint checked.
- Downstream execution stages receive the same seller context.
- Company and contact/route research no longer independently load mutable legacy Business Profile versions.
- AI is not allowed to reinterpret the seller at this boundary.
- CKR and UDOSIB frozen kernels are untouched.
