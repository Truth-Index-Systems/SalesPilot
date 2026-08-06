# Genesis G4 AI Governance Persistence Hotfix

## Fixed

- Numeric governance inputs now remove browser-preserved leading zeroes.
- Focusing a numeric setting selects its current value for clean replacement.
- Saving governance limits now performs a database read-back and returns the persisted policy.
- The UI immediately adopts the database-confirmed values and displays a save confirmation.
- Workspace and campaign limits are explicitly described as independent gates.
- The blocked-attempt metric is labelled as a historical daily count rather than a current gate state.
- Users are told that terminal jobs must be retried after limits are increased.

## Operational note

Raising the workspace daily request limit does not override the campaign daily request limit. A campaign that has used 25 requests remains blocked while its campaign limit is 20, even when the workspace limit is 100.

No SQL migration is required.
