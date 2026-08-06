# SalesPilot AI Cost Optimisation — Release A

Adds production cost observability only. It does not introduce test mode or alter scheduler, governance, model, prompt, research, queue, or sending behaviour.

## Internal page

`/internal/ai-costs` (OWNER and ADMIN only)

Provides range, stage, campaign, model, and prompt-version filters; production totals; cost by intelligence stage; token and web-search use; latency; and highest-cost request visibility.

## Setup

No SQL migration is required. The dashboard reads the existing `ai_usage_ledger` and G4 prompt-version records.

```bash
npm install
npm run cost:release-a-check
npm run typecheck
npm run build
```
