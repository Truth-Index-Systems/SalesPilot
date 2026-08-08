# Genesis G8.1 Release 15 — Knowledge + Discovery Merge Engine

R15 is the first dual-channel customer-flow merge. R14 Knowledge candidates may seed the normal campaign company universe at launch while existing live Discovery Intelligence continues unchanged.

## Rules
- Canonical domain is the deduplication key.
- Knowledge never bypasses the existing company review lifecycle.
- Only R14 candidates already marked usable are sent by the client, and the server re-verifies the shared G8 entity/status/Truth floor.
- Business Fit remains customer-specific and tenant-private.
- Shared Truth is never changed by campaign relevance.
- Knowledge merge is fail-open; campaign launch succeeds if G8 is unavailable.
- Live Discovery remains the universal second channel and may enrich the same company later.
- `GENESIS_G8_KNOWLEDGE_DISCOVERY_MERGE=false` disables the launch merge without disabling G8 acquisition/retrieval.

## Persistence
Migration `0117_genesis_g81_release15_knowledge_discovery_merge.sql` adds a tenant-private provenance link and the idempotent merge RPC. Public evidence is copied into the existing company evidence surface for explainability; private customer data never enters shared Knowledge Intelligence.
