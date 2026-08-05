# Genesis G3.5 Phase 1 — Opportunity Domain

The opportunity is now the composed commercial object linking an approved company to the strongest currently supported buying contact. Companies, contacts and evidence remain authoritative repositories; opportunity rows reference them rather than duplicating their content.

The single pipeline scheduler owns materialisation through `sync_opportunity_foundations`. The builder makes no OpenAI or web request and therefore consumes no AI credit.

Phase 1 ranking is deterministic creation order. Phase 2 will replace the ranking stub with Opportunity Intelligence scoring.
