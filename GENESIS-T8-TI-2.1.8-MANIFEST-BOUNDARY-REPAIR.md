# Genesis T8 — TI-2.1.8 Manifest Boundary Repair

## Status
Constitutional integrity repair. No TI-2.1.8 mathematics or semantics changed.

## Defect
A post-freeze G8.2 timestamp hardening patch added RFC3339 validation directly to `lib/genesis-g8/truth-v2/ai/repair-contract.ts`. The safety intent was correct, but the file is inside the cryptographically frozen TI-2.1.8 source tree, so the later edit violated the TI freeze manifest.

## Repair
- Restored `lib/genesis-g8/truth-v2/ai/repair-contract.ts` byte-for-byte from the CE-R2 v1 constitutional freeze baseline.
- Expected/restored SHA-256: `6f6cb0d726c6450e0533e8279c9667ca5a019378c40874174902c235397ce582`.
- Moved RFC3339 validation to `lib/genesis-g8/discovery-repair-openai-v2.ts`, a post-freeze transport/persistence safety boundary.
- Both directly accepted and AI-canonicalised repair results must cross this boundary before returning to the repair worker.
- Malformed `sourcePublishedAt` or `observedAt` values therefore still fail before PostgreSQL persistence.
- Updated the G8.2 timestamp validator to assert both byte-for-byte TI integrity and the relocated safety boundary.

## Constitutional outcome
TI-2.1.8 remains immutable. The timestamp production hardening remains active. The manifest is not rewritten to bless an unauthorised mutation.
