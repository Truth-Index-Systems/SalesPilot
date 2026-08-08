# MarketRoute Genesis G5 — Release 5
## Personalisation Safety Layer

Release 5 is a controlled hardening release built on the compiled G5 Release 4 artifact.

### Boundary

G4 remains immutable. Release 5 does not research, rediscover, score or modify Business DNA, companies, contacts, Route Intelligence, commercial routes or Opportunities.

Release 5 also adds no new G5 lifecycle state. The canonical Release 1 state machine remains authoritative.

### Deterministic safety manifest

Release 2 already creates three distinct evidence classes. Release 5 converts those directly into one persisted manifest:

- `safeEvidence` → `VERIFIED_FACT`
- `commercialInferences` → `COMMERCIAL_INFERENCE`
- `prohibitedClaims` → `DO_NOT_USE`

This classification is deterministic. It does not call an AI model.

Every verified fact source ID must be present in the immutable G4 source snapshot persisted by Release 2. A missing source causes a fenced retryable failure rather than allowing the claim into outreach.

### Pre-generation gate

For new strategies, the sequence is now:

`STRATEGY_READY + R3 channel decision`

→ deterministic R5 personalisation safety manifest

→ `STRATEGY_READY`

→ R4 generation may claim `GENERATING`

R4 cannot claim a strategy unless `personalisation_safety_schema_version = g5-personalisation-safety/v1`.

### Outreach generation v2 prompt

The R4 output schema remains `g5-outreach-generation/v1`, but the prompt contract is now `g5-outreach-generation/v2`.

`personalisationBasis` is no longer free-text explanation. It contains only R5 manifest `itemId` values actually used by the message.

Deterministic post-generation checks require:

- every personalisation basis ID is classified `VERIFIED_FACT` or `COMMERCIAL_INFERENCE`;
- `DO_NOT_USE` IDs are never accepted;
- every `evidenceUsed.sourceId` belongs to a `VERIFIED_FACT` manifest item;
- the existing R4 route, channel, reachability and immutable-source checks still pass.

### Compatibility with already-generated R4 drafts

If a strategy reached `SELF_REVIEW` before R5 deployment, R5 may backfill its manifest without regressing the state. These records are persisted with `personalisation_safety_enforced_before_generation = false`.

Future Release 6 self-review must therefore treat them as legacy generated content requiring full review, not as content generated under the R5 pre-generation gate.

Newly generated content records `personalisation_safety_enforced_before_generation = true` and cannot complete R4 generation otherwise.

### Release 5 stop point

Release 5 still stops at `SELF_REVIEW` after R4 generation.

It does not activate AI self-review, approval, queueing or sending. Those remain controlled future releases.

### Migration

Apply:

`supabase/migrations/0078_genesis_g5_release5_personalisation_safety_layer.sql`

### Validation

Run:

`node scripts/validate-genesis-g5-release5.mjs`
