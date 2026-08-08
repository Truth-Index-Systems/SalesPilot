# MarketRoute Genesis G5.1.11 — Company Discovery Work-Unit Authority Audit

## Root cause
G5.1.10 correctly made terminal OpenAI background responses immutable. Business Analysis adopted a deterministic fresh-retry chain, but Company Discovery still used one fixed request scope per archetype. A terminal `incomplete`, `failed`, or `cancelled` response therefore became a permanent checkpoint: every later scheduler claim rediscovered the same terminal response, logged archetype 1 again, and could never advance the persisted cursor.

## Surgical fixes
- Company Discovery now recognises terminal background checkpoints and closes the corresponding AI ledger attempt.
- A terminal response derives a fresh deterministic retry scope from its response ID. Pending retries remain resumable/idempotent; terminal generations are bounded to four.
- The archetype cursor remains unchanged until a valid AI result is persisted and evidence verification completes.
- `complete_company_discovery_archetype_owned` now rejects completion if the persisted plan total differs or the exact archetype result is not durably present.
- `ARCHETYPE_RESEARCH_STARTED` is database-deduplicated per search pass + archetype, eliminating repeated “1 of 5” timeline rows caused by background polling/resume.

## Existing stuck sessions
No manual cursor reset is required. After deployment/migration, an existing terminal checkpoint is treated as historical evidence and the same archetype receives a fresh provider attempt. The cursor advances only after successful durable completion.

## Migration
Apply `0104_marketroute_g5111_company_discovery_work_unit_authority.sql`.
