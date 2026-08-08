# Genesis G8.1 Release 9 — Discovery Repair Worker Consumption

R9 closes the first real G8 feedback loop:

Truth Index -> exact claim gap -> Discovery Intelligence evidence research -> evidence persistence -> Truth rehydration.

## Authority boundary
- AI researches and proposes sourced evidence only.
- The repair worker deterministically derives source-family independence and traceability.
- `MR-TI-1.0` alone recalculates confidence/coverage/Truth Index.
- Repair completion never means the claim is true; an empty or contradicting result is valid research output.
- Exact repairs are never widened into full company/contact/route discovery.

## Production mechanics
- `GENESIS_G8_REPAIR` is a governed/background-resumable AI workload.
- R8 repair jobs are claimed with lease fencing and bounded retry backoff.
- Blocking + critical repairs receive deterministic queue priority.
- Evidence is persisted as `DISCOVERY_INTELLIGENCE` provenance.
- Truth snapshots are append-only and written only when rehydration changes state.
