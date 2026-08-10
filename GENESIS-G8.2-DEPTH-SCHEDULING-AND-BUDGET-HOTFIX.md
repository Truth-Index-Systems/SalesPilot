# Genesis G8.2 — Depth Scheduling Priority & Background Budget Hotfix

## Purpose

Fix two production conditions observed on the Founder dashboard and `/api/autonomy/genesis-g8/operate/run` logs:

1. Existing-company contact/route depth was gated behind the same `mayGrow` condition as new-company breadth, so the depth worker could remain completely uninvoked.
2. The legacy percentage allocation produced a $15 background envelope from a $100 governed workspace limit, exhausting background work while substantial total governed capacity remained.

## Changes

- Existing-company depth now has an independent `mayDepth` gate and runs before new breadth.
- `CUSTOMER_ONLY` and `PAUSED` still block background depth; live customer work remains authoritative.
- New-company breadth retains the stricter `mayGrow` gate.
- Background intelligence receives a default $100/day target via `MARKETROUTE_G8_BACKGROUND_DAILY_BUDGET_USD`.
- The effective background budget is always capped by the workspace `daily_cost_limit_usd`.
- The displayed/usable background remaining amount is additionally capped by the workspace's actual remaining dollars today, so it can never imply spend beyond governance.
- `reserve_ai_request` remains the final authoritative spend gate.

No existing Genesis company data is migrated or rewritten.
