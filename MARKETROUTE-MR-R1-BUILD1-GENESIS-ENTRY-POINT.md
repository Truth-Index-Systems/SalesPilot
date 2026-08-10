# MarketRoute MR-R1 Build 1 — Genesis T8 Seller Entry Point

## Mission
Make Genesis T8 the mandatory boundary crossed by completed MarketRoute seller understanding before downstream matching or persistence, without changing current product behaviour.

## What changed
- Added `lib/integrations/genesis-t8/marketroute-seller-entry.ts`.
- Completed Business DNA now enters Genesis T8 before legacy G8 knowledge matching and persistence.
- The entrypoint hard-validates seller identity and essential Business DNA structure.
- It stamps CKR v1, CE-R2/UDOSIB v1 and AI Research Contract provenance.
- It creates an ontology-governed baseline seller research surface using CE-R1 predicate definitions.
- The existing Business DNA payload is passed through unchanged for compatibility.

## Constitutional boundary
This build does **not** translate legacy prose into canonical tokens with deterministic code. Semantic mapping remains AI-owned. It also does not calculate fit, route, contact or opportunity scores.

## Why the adapter lives outside the frozen kernel
The integration is under `lib/integrations/genesis-t8/`, not inside `lib/genesis-t8/`. MarketRoute may depend on Genesis, but Genesis must remain application-independent and cryptographically frozen.

## Build 2 handoff
Build 2 may persist the Genesis seller context and canonical Commercial Genome structures. Build 1 only establishes and enforces the live entry boundary.
