# MarketRoute Genesis G5 — Release 12: Autopilot Mode

## Scope

Release 12 removes only the human approval click for campaigns explicitly configured as `autopilot`. It does not create a second engagement pipeline and does not bypass G4/G5 intelligence.

## Required gates

A strategy may be auto-approved only when all of the following remain true at approval time:

- campaign automation mode is `autopilot` and campaign is not paused/archived;
- the G4 Opportunity remains `APPROVED`;
- R5 personalisation safety exists;
- R6 self-review outcome is `PASS`;
- R7 Engagement Quality exists;
- Engagement Confidence meets the configured threshold (default 85/100);
- generated outreach exists;
- the effective R3/R8 primary route still exists in G4, is viable and has a reachable channel value;
- the G5 execution channel matches the canonical G4 route type.

## Execution

R12 writes `AUTO_APPROVED` and advances only `READY_FOR_APPROVAL -> APPROVED`. R9 remains the sole execution authority for `APPROVED -> QUEUED -> SENT`, including recipient validation, campaign pause, timezone confidence, the 08:00–18:00 recipient-local window, duplicate prevention and transport retries.

Assisted and Approval campaigns remain unchanged and require the R8 human approval workflow.

## Threshold

`SALESPILOT_AUTOPILOT_ENGAGEMENT_CONFIDENCE_MIN` controls the minimum Engagement Confidence. Default: `85`. Values are clamped to 0–100.

## R9 compatibility hardening

R12 also fixes the G4/G5 channel vocabulary boundary used by R9:

- DIRECT_EMAIL / DEPARTMENT_EMAIL / GENERAL_EMAIL -> EMAIL
- LINKEDIN -> LINKEDIN
- SWITCHBOARD -> SWITCHBOARD
- INTRODUCTION -> REFERRAL

This prevents valid G4 email routes from being incorrectly held because G5 uses the execution-channel label `EMAIL`.

## Event instrumentation

R11's engagement business-event projection now maps `AUTO_APPROVED` to an `APPROVED` event with actor type `SYSTEM`, preserving a clean distinction from human approval.
