# Genesis G8.1 Release 12 — Knowledge Acquisition from Existing Discovery

R12 makes the existing slow Discovery Intelligence channel additive to the shared Genesis knowledge graph without rewriting the frozen discovery workers.

## Boundary
- Existing companies, contacts, route intelligence and their verified public evidence remain authoritative source records.
- Database triggers enqueue projection work only; they do not alter customer workflow state.
- The acquisition worker copies only externally sourced public evidence into G8 with `DISCOVERY_INTELLIGENCE` provenance.
- Business DNA, campaign fit, opportunity scores, buying reasons, customer-specific rationale, outreach, replies, notes and tenant identifiers are not promoted into shared Knowledge Intelligence.
- Source conclusions are never treated as evidence by themselves. Only verified source URLs/excerpts are mapped into Truth claims.

## Canonicalisation
- Company: canonical domain.
- Contact: verified LinkedIn URL where available; otherwise company-domain + normalised person name.
- Route: company domain + target role + public channel/access path.

## Operation
Migration `0114` installs a durable acquisition queue and non-invasive triggers on existing discovery source tables. `/api/autonomy/genesis-g8/acquisition/run` consumes queued projections with lease fencing, evidence deduplication, contract hydration and deterministic Truth recalculation.

The endpoint is intentionally not added to `vercel.json` in R12. Scheduling/capacity policy remains an explicit later activation decision.
