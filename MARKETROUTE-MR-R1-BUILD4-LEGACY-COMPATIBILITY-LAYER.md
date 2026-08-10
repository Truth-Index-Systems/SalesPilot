# MarketRoute MR-R1 Build 4 — Legacy Compatibility Layer (Regenerated)

## Purpose

MarketRoute keeps its existing UI/read contracts while immutable `GenesisSellerContext` becomes the authoritative seller source. Campaign strategy remains separately owned by campaign configuration.

## Regeneration fix

The first Build 4 SQL attempted to insert new `genesis_legacy_*` columns into `public.campaign_detail` before the existing `timeline` column. PostgreSQL correctly rejected this because `CREATE OR REPLACE VIEW` cannot change the identity/order of existing columns in that way.

This regenerated build preserves the exact existing `campaign_detail` view contract. It adds no columns, removes no columns, renames no columns, and does not reorder columns. Only the backing expressions for `business_name`, `business_summary`, and `website_url` change to Genesis-first with a historical legacy fallback.

Richer compatibility projections — ICP, industries, buyer roles, pains, geographies, offers and unknowns — remain in the TypeScript `legacy-seller-projection` layer and authenticated compatibility endpoint. They are not pushed into the long-lived SQL view.

## Authority boundaries

- Genesis owns immutable seller knowledge.
- Campaign configuration owns approved campaign strategy.
- Legacy `business_profiles` are fallback only for historical campaigns that predate Genesis context persistence.
- No new AI interpretation is introduced by this build.
- CE-R1 and CE-R2 remain frozen and untouched.
