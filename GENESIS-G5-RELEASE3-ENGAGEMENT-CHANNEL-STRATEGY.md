# MarketRoute Genesis G5 — Release 3
## Engagement Channel Strategy

Release 3 builds directly on the deployed Release 2 compile-fix artifact.

### Boundary

G4 remains immutable. Release 3 does not research companies, contacts, routes or buying paths and does not change Opportunity truth. It consumes the exact G4 source snapshot persisted by Release 2 plus the canonical Commercial Reasoning object.

Release 3 also does not generate outreach. The G5 lifecycle remains at `STRATEGY_READY`.

### What Release 3 adds

- A strict, versioned `g5-channel-strategy/v1` schema.
- Primary, secondary and fallback route selection.
- Executable channel classification: EMAIL, LINKEDIN, SWITCHBOARD or REFERRAL.
- Explainability for why the primary route is first and why alternatives are not first.
- Commercial-friction and expected-commitment guidance for each selected route.
- Channel confidence and explicit limitations.
- Persisted channel-strategy source fingerprint.
- Customer-visible timeline event when the strongest engagement route is selected.

### Deterministic safety gate

The model is not trusted to establish reachability. After structured output parsing, code verifies that every selected route:

1. already exists in the immutable G4 commercial route set;
2. is marked viable by G4;
3. has a persisted non-empty channel value; and
4. uses an execution channel compatible with the G4 route channel type.

Mappings are deliberately strict:

- DIRECT_EMAIL / DEPARTMENT_EMAIL / GENERAL_EMAIL -> EMAIL
- LINKEDIN -> LINKEDIN
- SWITCHBOARD -> SWITCHBOARD
- INTRODUCTION -> REFERRAL
- UNKNOWN -> not actionable

The AI cannot invent a direct phone route because G4 does not currently expose one as a canonical commercial-route channel type.

### State-machine behaviour

Release 3 does **not** add a new lifecycle state. Channel Strategy is a fenced enrichment of a `STRATEGY_READY` record. A dedicated lease claims the record while preserving its state and clears ownership after persistence.

If Channel Strategy fails, the strategy enters `FAILED_RETRYABLE` with `failure_stage = CHANNEL_STRATEGY`. Its dedicated claim function can safely recover only that failure stage.

The generic future `STRATEGY_READY -> GENERATING` claim is now gated: a strategy cannot enter generation unless `channel_strategy_json` exists with the expected schema version.

### Scheduler rule

At most one G5 AI worker may run in a scheduler cycle. Release 2 reasoning gets first refusal. Release 3 runs only when no Release 2 reasoning job was processed. This prevents two 120-second AI envelopes being chained inside the same Vercel invocation.

### Migration

Apply:

`0076_genesis_g5_release3_engagement_channel_strategy.sql`

### Validation

Run:

`npm run genesis:g5-release3-check`

Release 3 intentionally stops before outreach generation, AI self-review, approval, queueing or sending.
