# Genesis T8 CE-R1 Build 1 — Platform Constitution

Build 1 establishes the machine-readable and human-readable Genesis T8 constitutional boundary without changing the production G8 runtime.

## Added

- `lib/genesis-t8/constitution.ts`
- `lib/genesis-t8/index.ts`
- `docs/genesis-t8/GENESIS-T8-CONSTITUTION-v1.0.md`
- `docs/genesis-t8/TI-2.1.8-FREEZE-MANIFEST.json`
- `scripts/validate-genesis-t8-ce-r1-build1.mjs`
- package script `genesis:t8-ce-r1-build1-check`

## Architectural effect

The build makes the following rules executable/versioned:

- AI understands; Genesis reasons.
- Truth precedes downstream reasoning.
- TI-2.1.8 owns truth only.
- Commercial, Contact, Route and Opportunity engines consume truth-qualified knowledge.
- Derived reasoning cannot become authoritative persisted knowledge.
- Applications consume Genesis T8 and may not define its engine mathematics.
- Frozen kernels require explicit version changes.

## TI-2.1.8 protection

The active `lib/genesis-g8/truth-v2` source tree is SHA-256 fingerprinted. Build 1 validation fails if the frozen TI-2.1.8 source changes unexpectedly.

## Runtime impact

None. No production route, migration, scheduler, OpenAI prompt, database object or Truth Index mathematical source was modified by this build.
