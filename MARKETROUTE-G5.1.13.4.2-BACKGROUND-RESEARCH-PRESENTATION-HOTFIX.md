# MarketRoute Genesis G5.1.13.4.2 — Background Research Presentation Hotfix

## Scope
Presentation-only freeze hotfix for Company Discovery background deferral.

## Fix
`defer_company_discovery_background_owned` intentionally returns a live discovery session to `QUEUED` while preserving the active research stage and durable OpenAI checkpoint. The campaign page previously mapped every generic `QUEUED` state to **Company research scheduled**, making healthy background continuation look like a restart loop.

G5.1.13.4.2 recognises a queued session with a persisted active research stage as **background-deferred research**. The UI now:

- keeps the active stage label (for example **Searching your market**),
- explains that the same saved research pass is continuing in the background,
- preserves and displays the persisted progress bar while deferred,
- reserves **Company research scheduled** for genuinely not-yet-started queued work.

## Safety boundary
No scheduler, RPC, AI prompt, retry, evidence, scoring, Route Intelligence, Contact Discovery or Opportunity behaviour is changed. No database migration is required.
