# Genesis T8 — CE2-R6 Research Calculus

## Purpose
CE2-R6 formalises deterministic research prioritisation. The governing relationship is not "reduce the most uncertainty"; it is "acquire the information most capable of improving the current commercial decision, subject to constitutional authority boundaries."

## Theory review
Three candidate families were tested before implementation.

1. **Expected Value of Information (VOI / EVPI / EVSI).** Correct objective: information has value through its effect on decisions. Rejected as a numeric R6 formula because standard VOI requires utilities and outcome probabilities that CE2 does not constitutionally own.
2. **Information gain / entropy / active-learning uncertainty sampling.** Useful for efficient model learning, but rejected as the governing commercial research rule because uncertainty reduction can prefer a highly uncertain irrelevant fact over a less uncertain decision-critical fact.
3. **Deterministic decision-impact calculus.** Accepted. R6 preserves the VOI principle while replacing unavailable expected utility with categorical, directly observable decision effects derived from R2/R4/R5.

## Adopted ordering
Research is ordered lexicographically:

1. DECISION_BLOCKING
2. DECISION_SHARPENING
3. STABILITY_RELEVANT
4. ASSURANCE_RELEVANT
5. ENRICHMENT
6. NO_DECISION_VALUE

Within equal decision impact, greater overlap with currently critical R5 stability dimensions wins. Only then may explicit known acquisition cost and duration break ties. Unknown cost is never treated as zero.

## Constitutional boundaries
- AI owns semantic question generation/canonicalisation only.
- Truth Index continues to own probability, confidence, evidence truth and freshness.
- CE2-R6 does not calculate entropy, expected utility, Bayesian probability or numeric VOI.
- CE2-R6 does not rank opportunities, routes or contacts.
- Counterfactual decision-set contraction is deferred until CE2 has an authorised counterfactual engine.
