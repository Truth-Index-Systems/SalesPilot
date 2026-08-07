# SalesPilot Genesis G5 — Release 4
## Channel-Specific Outreach Generation

Release 4 consumes the canonical G5 commercial reasoning and the persisted Release 3 primary route/channel decision. G4 remains immutable.

### State movement

`STRATEGY_READY -> GENERATING -> SELF_REVIEW`

R4 stops at `SELF_REVIEW`. It does not run self-review, human approval, queueing, sending, reply intelligence or learning.

### Safety contract

- only an approved G4 Opportunity can remain eligible through the canonical strategy authority;
- R2 commercial reasoning must already exist;
- R3 channel strategy must already exist and be schema version `g5-channel-strategy/v1`;
- generated route ID must equal the persisted R3 primary route ID;
- generated channel must equal the persisted R3 execution channel;
- the selected route is rechecked against immutable G4 route truth for existence, viability, channel compatibility and persisted reachability;
- evidence source IDs emitted by the model must exist in the immutable G4 source snapshot;
- stale workers cannot persist because all context and completion RPCs are lease-token fenced;
- retryable generation failures return to `FAILED_RETRYABLE` with `failure_stage='OUTREACH_GENERATION'` and are reclaimed only by the R4 worker.

### Channel-native output

Release 4 supports the exact channels Release 3 can select today:

- EMAIL — subject + concise full email;
- LINKEDIN — optional connection note + native short message;
- SWITCHBOARD — spoken opening + routing request;
- REFERRAL — introduction request + forwardable note.

Irrelevant channel content is explicitly null. The engine is instructed not to convert one route into another channel.

### Persistence

The canonical `engagement_strategies` row now stores the generated outreach, schema/prompt version, model, confidence, source fingerprint and generation timestamp. The fingerprint represents the exact compacted reasoning + channel strategy + immutable G4 context consumed by the generation request.

### Compatibility repair

R3 emits `CHANNEL_STRATEGY_READY` into `engagement_strategy_events`, while the R1 event check constraint predated that event type. R4 widens that constraint only so the existing R3 event can persist. No R3 decision logic is changed.
