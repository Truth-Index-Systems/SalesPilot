# Genesis G8.1 Release 4 — Knowledge Read Model & Truth Hydration

## Purpose
Reconstruct persisted shared intelligence into the MR-TI-1.0 Truth Kernel without changing live MarketRoute discovery behaviour.

## Added
- Pure persisted knowledge read model.
- Current-time Truth hydration (freshness is recalculated on every hydration).
- Ranked claim-level intelligence gaps.
- Gap reasons: missing evidence, insufficient evidence, low confidence, contradiction, stale evidence.
- Latest persisted Truth snapshot comparison and recalculation detection.
- Server-only read repository by entity id or canonical key.
- Optional append-only snapshot persistence after hydration.

## Boundary
R4 does not wire Genesis G8 into Company Discovery, Contacts, Routes, Opportunities, Pipeline, or Autonomy. Knowledge Intelligence remains parallel infrastructure.

## Important behaviour
A persisted opportunity remains persisted regardless of current Truth score. Hydration changes its measured reliability and review/gap state; it never deletes the entity.
