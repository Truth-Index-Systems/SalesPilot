# G2 Campaign Scoping & Review Accuracy Patch

## Correctness changes

- Company review decisions are now explicitly bound to both `company_id` and `campaign_id` in the API and database function.
- Bulk review requests are grouped by campaign and validated campaign-by-campaign.
- Company review counters follow the selected campaign filter instead of always showing workspace-wide totals.
- Sidebar workspace totals remain workspace-wide.
- Campaign detail uses live per-campaign counts for pending, approved and rejected companies.
- A completed discovery session no longer claims companies are ready when all recommendations have already been reviewed.
- When no recommendations remain pending, the campaign shows `Company review is complete` and the next stage is Contact Discovery.

## Discovery cadence

The current discovery engine runs once for each launched campaign. Vercel checks for eligible queued or retrying sessions every minute, but completed campaigns are not searched again automatically. The workspace total therefore remains fixed until another campaign completes discovery or a future replenishment feature is introduced.

This patch deliberately does not add recurring replenishment because that requires product limits, cost controls and duplicate-handling rules beyond the correctness scope.

## Migration

Run `supabase/migrations/0010_genesis_g2_campaign_scoped_review_accuracy.sql` after migration `0009`.
