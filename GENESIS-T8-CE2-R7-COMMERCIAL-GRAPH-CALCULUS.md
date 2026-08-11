# Genesis T8 CE2-R7 — Commercial Graph Calculus

## Purpose
R7 turns graph structure into deterministic commercial path mathematics without scalar route weights.

## Research conclusion
Three candidate families were tested:
1. scalar weighted shortest path — rejected because incomparable commercial criteria require arbitrary exchange rates;
2. widest/bottleneck path — retained as a weakest-link property but rejected as the sole path selector because it ignores unnecessary path length and other criteria;
3. Pareto multi-objective path reasoning — selected as the path foundation because it preserves nondominated trade-offs without weights.

Menger-style internally vertex-disjoint path reasoning is added orthogonally for route redundancy and source-target-specific cut/criticality analysis.

## Constitutional results
- OPEN-only reachability represents current executable connectivity.
- Structural reachability may still exist through UNRESOLVED/BLOCKED edges and is reported separately.
- Shortest open hop count is descriptive only.
- Path stability is the minimum authorised edge stability margin, never an average.
- Path accessibility is categorical first: OPEN > UNRESOLVED > BLOCKED. No shorter blocked path can compensate for being blocked.
- Pareto comparison then operates only within the same accessibility class using blocker/unresolved counts, hop count and bottleneck stability.
- Critical nodes/edges are identified by deterministic source-target removal tests, not generic centrality scores.
- Internally vertex-disjoint OPEN paths produce a categorical redundancy class.
- Enumeration guards fail closed if exhaustive path computation exceeds explicit caller limits.

## Deferred
Dynamic graph replanning, admissible interventions, flow/capacity economics, and counterfactual path repair are deferred until later CE2 releases define the necessary action semantics.
