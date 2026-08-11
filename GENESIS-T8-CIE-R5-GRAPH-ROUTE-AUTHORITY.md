# Genesis T8 — CIE-R5 Graph & Route Authority

## Objective
Promote CE2-R7 Commercial Graph Calculus to the authoritative route decision layer and demote legacy weighted/AI route selection without dual authority.

## Authority change
- `lib/genesis-t8/cie/route-authority.ts` is authoritative for route accessibility, Pareto frontier and execution route selection.
- `lib/engagement/g5-channel-strategy.ts` now calls CIE-R5 deterministically; it no longer calls OpenAI for route selection.
- `lib/engagement/g5-channel-strategy-openai.ts` remains only as a historical/shadow artefact and has no live caller.
- Legacy weighted route scores remain compatibility telemetry only. Route arrays are ordered canonically by stable route key rather than score.
- Contact ranking is intentionally unchanged until CIE-R6.

## Mathematics
R5 consumes the frozen CE2-R7 graph calculus:
1. Route state is categorical: OPEN / UNRESOLVED / BLOCKED.
2. Only OPEN routes may control execution.
3. The OPEN Pareto frontier is the commercial route result.
4. No weighted route score is used.
5. If multiple routes are mathematically indistinguishable under authorised information, canonical route-id order is used only as an operational tie-break for the existing primary/secondary/fallback compatibility envelope. It is not represented as commercial superiority.
6. No OPEN route fails closed; AI or legacy scoring may not rescue the decision.

## Compatibility note
`channelConfidence=100` is retained temporarily because the downstream G5 schema/database contract requires a numeric field. In CIE-R5 it means only "categorically OPEN and CIE validated" and is not a probability or route rank. Engagement quality authority is scheduled for later CIE migration and must not reinterpret this as route probability.

## Validation
- CIE-R5 static validator: 12/12 PASS
- CIE-R5 adversarial runtime: 8/8 PASS
- Full inherited CIE-R4 chain: PASS
- Frozen UDOSIB mathematics: byte-identical to CIE-R4
- Frozen Truth Index v2 tree: byte-identical to CIE-R4
- CE2 Evolution R1-R8: byte-identical to CIE-R4

## Deferred
- Contact authority remains CIE-R6.
- Richer graph topology from explicit contact/dependency nodes can evolve after contact authority is migrated; R5 does not invent topology absent from canonical route truth.
- Engagement quality/autopilot numeric authority is not solved here.
