# Genesis Stabilisation S7.2 — AI Governance Control Centre

S7.2 makes the S7.1 cost controls operationally usable without weakening the deployment-level safety boundary.

## Safety gates

An AI request is allowed only when:

1. `SALESPILOT_AI_PLATFORM_ENABLED=true` in the deployment.
2. Workspace AI is enabled by an owner or administrator.
3. Workspace and campaign request allowances remain available.
4. The estimated daily workspace budget remains available.
5. The request is atomically reserved in the usage ledger.

The browser cannot enable the deployment-level gate.

## User experience

Settings now includes the AI governance control centre with current gate state, usage, blocked requests, budget progress and emergency stop controls. Technical governance errors from business analysis are translated into calm actionable messages with a direct route to Settings.
