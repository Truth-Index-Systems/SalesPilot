# Genesis Stabilisation S10 — Production Rollout and G3 Freeze

## Purpose
S10 is the release gate. It adds no sales feature and creates no orchestration path. It provides one audited repair function, a 24-hour observation record, and an explicit G3 freeze decision.

## Deployment order
1. Back up the production database.
2. Apply migration `0027_genesis_stabilisation_s10_production_rollout.sql`.
3. Deploy the S10 application build.
4. Confirm `vercel.json` contains only `/api/autonomy/pipeline/run`.
5. Keep AI governance disabled while running **Preview repair**.
6. Review the repair summary. Run **Repair pipeline** only when the preview is understood.
7. Enable the deployment and workspace AI gates with conservative S7.1 limits.
8. Use one controlled campaign first. Pause unrelated campaigns if necessary.
9. Start the 24-hour observation from `/internal/autonomy`.

## Pass criteria
During the observation window:
- no duplicate active jobs;
- no expired running leases;
- no terminal failures;
- no overdue retries left uncleared;
- no repeated timeline spam;
- no false progress states;
- governance limits remain enforced;
- website analysis, company discovery and contact discovery recover from controlled failures;
- only the single pipeline cron is enabled.

## Failure handling
Mark the observation failed, stop workspace autonomy, inspect diagnostics and repair preview, then begin a new observation after the issue is corrected. Do not freeze G3 while any readiness counter is non-zero.

## Freeze
Use **Pass and freeze G3** only after the observation period and manual checks complete. The freeze is an audit record; it does not disable the product. Future G4 changes must extend the frozen G1–G3 foundation.
