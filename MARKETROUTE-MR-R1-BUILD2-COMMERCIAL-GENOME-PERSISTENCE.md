# MarketRoute MR-R1 Build 2 — Commercial Genome Persistence

Build 2 makes the Genesis T8 seller-understanding context durable at campaign launch without modifying the frozen CKR or UDOSIB kernels.

Each launched campaign receives one immutable `campaign_genesis_t8_seller_contexts` record containing the Genesis seller identity, CKR/UDOSIB/AI Research Contract provenance, baseline ontology research surface, selected commercial objective identifier and the compatibility Business DNA snapshot that crossed the Build 1 Genesis entry gate.

The record is idempotent by campaign and protected by a SHA-256 source fingerprint. A retry with the same seller reality succeeds; a conflicting attempt for an existing campaign fails closed with `GENESIS_T8_CAMPAIGN_CONTEXT_IMMUTABILITY_VIOLATION`.

This release does not claim that legacy Business DNA prose has become canonical Commercial Genome tokens. Semantic canonicalisation remains AI-owned. The persisted context is the durable application boundary that Build 3 and later MR-R1 releases can populate and consume using Genesis-native contracts.
