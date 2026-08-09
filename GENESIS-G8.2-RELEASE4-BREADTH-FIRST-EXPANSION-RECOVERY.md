# Genesis G8.2 Release 4 — Breadth-First Expansion Recovery

## Problem
G8.2 expansion treated a valid structured response containing `companies: []` as a successful completed job. The enriched research prompt could therefore consume governed AI capacity without growing the knowledge graph.

## Changes
- Empty company batches are no longer successful expansion outcomes.
- First pass remains the rich six-company company/contact/route research pass.
- A zero-result first pass automatically triggers a distinct breadth-first recovery request.
- Recovery prioritises verified company identity/domain/current-operation evidence and does not require contact/route enrichment before a company can be retained.
- Recovery asks for 3–6 companies when verifiable new companies exist.
- Job attempt number rotates a deterministic search angle so retries do not repeat essentially identical market research.
- Known-domain exclusions remain authoritative and canonical persistence still performs final deduplication.
- If recovery is also empty, the worker receives `GENESIS_G82_EXPANSION_EMPTY_AFTER_RECOVERY` and uses the existing bounded retry/failure lifecycle instead of recording false progress.

## No changes
Truth Kernel, eligibility policy, evidence scoring, capacity governance, founder review, customer Discovery and cron cadence are unchanged.
